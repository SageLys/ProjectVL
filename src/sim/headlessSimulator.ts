import { applyConfig, buildConfig, cfg } from '../config';
import type { GameConfig } from '../config';
import { createDefaultConfig, createInitialState } from '../core/createInitialState';
import { registerSkillDefs } from '../core/effects/interpreter';
import {
  isParticleSimulationEnabled,
  setParticleSimulationEnabled,
} from '../core/systems/particleSystem';
import { collectDrop } from '../core/systems/dropSystem';
import {
  consumeCard,
  moveOrSwap,
  quickEquip,
  toggleLock,
} from '../core/systems/equipmentSystem';
import { applyPerk } from '../core/systems/progressionSystem';
import { startNextWave } from '../core/systems/waveSystem';
import { acceptBountyAt } from '../core/systems/bountySystem';
import type { Card, Config, GameEvent, GameState, GroundDrop, Rng } from '../core/types';
import { updateGame } from '../core/updateGame';

export const HEADLESS_HZ = 30;
export const HEADLESS_DT = 1 / HEADLESS_HZ;
export const P4_REGULAR_WAVE_KPI_DENOMINATOR = 8;

export type AttentionProfileName = 'fast' | 'target' | 'stressed';

export type AttentionActionKind =
  | 'pickup'
  | 'bountyAccept'
  | 'equipment'
  | 'consume'
  | 'perk';

export interface HeadlessBotOptions {
  /** 掉落第一次进入视野时，永久忽略它的概率。 */
  permanentMissChance: number;
  /** 从首次看到掉落到尝试拾取的基础延迟。 */
  pickupReactionSeconds: number;
  /** 反应延迟的对称随机抖动（±秒）。 */
  pickupReactionJitterSeconds: number;
  /** 检查喂养/装备的最短间隔。 */
  equipmentDecisionIntervalSeconds: number;
  /** 连续两次拾取动作的最短间隔，避免同帧吞掉整场掉落雨。 */
  pickupActionIntervalSeconds: number;
  /** 每次三选一暂停折算进墙钟时长的决策耗时。 */
  perkDecisionSeconds: number;
  /** 喂养或锁定一次卡牌占用注意力通道的时间。 */
  equipmentActionSeconds: number;
  /** 拖卡并在战场落点释放一次卡牌占用注意力通道的时间。 */
  consumeActionSeconds: number;
  /** 点击接受一次 Bounty 占用注意力通道的时间。 */
  bountyActionSeconds: number;
  /** 在不同动词之间切换的额外成本。 */
  verbSwitchSeconds: number;
  /** 指针/视线跨越 100px 的时间成本。 */
  spatialTravelSecondsPer100Px: number;
  /** 已决定动作在执行时发生误点/取消的概率。 */
  actionErrorChance: number;
  /** 看见 Bounty 后愿意主动接单的基础概率。 */
  bountyAcceptChance: number;
  /** 敌人进入炮台多少像素内时，Bot 会考虑消耗卡解围。 */
  rescueDistance: number;
  /** 两次主动解围判断之间的最短间隔。 */
  rescueDecisionIntervalSeconds: number;
}

export interface HeadlessBatchOptions {
  runs?: number;
  seed?: number;
  variantNames?: string[];
  /** 局外成长占位：只乘运行期基础 damage，不修改 core 或磁盘配置。 */
  metaPowerMultiplier?: number;
  maxActiveSeconds?: number;
  /** 共享注意力参数组；默认 target。 */
  attentionProfile?: AttentionProfileName;
  bot?: Partial<HeadlessBotOptions>;
}

export interface ResolvedHeadlessBatchOptions {
  runs: number;
  seed: number;
  variantNames: string[];
  metaPowerMultiplier: number;
  maxActiveSeconds: number;
  attentionProfile: AttentionProfileName;
  bot: HeadlessBotOptions;
}

export interface PeakEntities {
  enemies: number;
  bullets: number;
  drops: number;
  /** Headless 中 VFX 被关闭，因此恒为 0；设备性能上限须由 T1 实测。 */
  particles: number;
}

export interface EconomySnapshot {
  formed3Star: number;
  locked3Star: number;
  collected: number;
}

export interface WaveStats {
  wave: number;
  startActiveSeconds: number | null;
  endActiveSeconds: number | null;
  durationSeconds: number | null;
  merges: number;
  formed3Star: number;
  dropsGenerated: number;
  collected: number;
  expired: number;
  consumes: number;
  peakEnemies: number;
}

export interface HeadlessRunResult {
  runIndex: number;
  gameplaySeed: number;
  botSeed: number;
  win: boolean;
  timedOut: boolean;
  activeDurationSeconds: number;
  estimatedWallDurationSeconds: number;
  waveReached: number;
  level: number;
  perkDecisions: number;
  kills: number;
  merges: number;
  formed3Star: number;
  locked3Star: number;
  consumes: number;
  dropsGenerated: number;
  collected: number;
  expired: number;
  cardsFull: number;
  permanentlyMissedDrops: number;
  unresolvedDrops: number;
  expiredRate: number;
  collectedRate: number;
  mergesBeforeBoss: number;
  mergesPerRegularWave: number;
  breatherSeconds: number;
  breatherShare: number;
  /** 进入最终 Boss 波时的战斗经济，不含该波后续成长。 */
  bossEntryEconomy: EconomySnapshot | null;
  /** 最终 Boss 实体首次生成时的战斗经济。 */
  bossSpawnEconomy: EconomySnapshot | null;
  /** 最终 Boss 被击杀前的战斗经济，不含 Boss 奖励。 */
  preBossKillEconomy: EconomySnapshot | null;
  /** 等尾波地面奖励处理完毕后的最终经济。 */
  settlementEconomy: EconomySnapshot;
  bossSpawnActiveSeconds: number | null;
  bossKillActiveSeconds: number | null;
  bossFightDurationSeconds: number | null;
  bossBreached: boolean;
  bossShare: number;
  waveStats: WaveStats[];
  peak: PeakEntities;
  attention: AttentionRunMetrics;
}

export interface AttentionAbandonCounts {
  permanentMiss: number;
  expiredBeforeReady: number;
  expiredInQueue: number;
  bountyRiskRejected: number;
  bountyWindowExpired: number;
  invalidated: number;
  gameEnded: number;
}

/** P4.1：单局共享注意力/点击压力结果。滚动窗口字段均为“窗口内动作数”。 */
export interface AttentionRunMetrics {
  profile: AttentionProfileName;
  actions: number;
  actionsPerMinute: number;
  successfulActions: number;
  pickupActions: number;
  bountyAcceptActions: number;
  equipmentActions: number;
  consumeActions: number;
  perkActions: number;
  consumeActionsPerMinute: number;
  rolling3sP50: number;
  rolling3sP95: number;
  rolling10sP50: number;
  rolling10sP95: number;
  queueDelayMeanSeconds: number;
  queueDelayP50Seconds: number;
  queueDelayP95Seconds: number;
  queueDelayMaxSeconds: number;
  attentionWindowSeconds: number;
  overlappingWindowSeconds: number;
  overlappingWindowShare: number;
  overlapEpisodes: number;
  maxConcurrentWindows: number;
  attentionExtraExpired: number;
  reactionExpired: number;
  errorActions: number;
  errorRate: number;
  positionSwitches: number;
  verbSwitches: number;
  bountyOffered: number;
  bountyAccepted: number;
  bountyCompleted: number;
  bountyExpired: number;
  bountyFailed: number;
  bountyRewardDrops: number;
  bountyRewardCollected: number;
  bountyAcceptedBreaches: number;
  bountyAcceptedRunDeaths: number;
  abandoned: AttentionAbandonCounts;
}

export interface DistributionSummary {
  min: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
  mean: number;
}

export interface HeadlessBatchSummary {
  runs: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  bossKillRate: number;
  bossBreachRate: number;
  winningBossKills: number;
  winningBossFightDurationSeconds: DistributionSummary;
  winningBossShare: DistributionSummary;
  expiredRate: number;
  collectedRate: number;
  mergesPerRegularWave: number;
  breatherShare: number;
  bossShare: number;
  attention: AttentionBatchSummary;
  metrics: Record<string, DistributionSummary>;
}

export interface AttentionBatchSummary {
  profile: AttentionProfileName;
  actionsPerMinute: DistributionSummary;
  rolling3sP50: DistributionSummary;
  rolling3sP95: DistributionSummary;
  rolling10sP50: DistributionSummary;
  rolling10sP95: DistributionSummary;
  queueDelayP50Seconds: DistributionSummary;
  queueDelayP95Seconds: DistributionSummary;
  overlappingWindowShare: DistributionSummary;
  attentionExtraExpired: DistributionSummary;
  consumeActionsPerMinute: DistributionSummary;
  errorRate: DistributionSummary;
  positionSwitches: DistributionSummary;
  bountyOffered: number;
  bountyAccepted: number;
  bountyCompleted: number;
  bountyFailed: number;
  bountyRewardDrops: number;
  bountyRewardCollected: number;
  bountyAcceptanceRate: number;
  bountyCompletionRate: number;
  bountyRewardCollectionRate: number;
}

export interface HeadlessBatchResult {
  options: ResolvedHeadlessBatchOptions;
  simulation: { hz: number; dt: number; vfxEnabled: false };
  /** 实际注入 core 的完整配置快照，供结果复现与事后审计。 */
  configSnapshot: GameConfig;
  config: {
    totalWaves: number;
    bossWave: number;
    equipMode: string;
    handSlots: number;
    equipSlots: number;
    maxLocked: number;
    maxStar: number;
    mergeCopies: number;
    baseDamage: number;
    simulatedDamage: number;
    fireRate: number;
    dropChance: number;
  };
  summary: HeadlessBatchSummary;
  runs: HeadlessRunResult[];
}

interface DropDecision {
  /** 以墙钟计时，避免 perk 暂停期间反应永远无法结束。 */
  readyAtWall: number;
  missed: boolean;
  seenAtWall: number;
  collected: boolean;
}

type AttentionRegion = 'field' | 'bounty' | 'inventory' | 'perk';

interface AttentionActionBase {
  key: string;
  kind: AttentionActionKind;
  region: AttentionRegion;
  x: number;
  y: number;
  createdAtWall: number;
  readyAtWall: number;
  priority: number;
}

type EquipmentPlan =
  | { operation: 'feedLock'; sourceCardId: number; targetCardId: number }
  | { operation: 'feedSlot'; sourceCardId: number; targetCardId: number }
  | { operation: 'lock'; cardId: number }
  | { operation: 'quickEquip'; cardId: number };

type AttentionAction = AttentionActionBase & (
  | { kind: 'pickup'; dropId: number }
  | { kind: 'bountyAccept'; enemyId: number }
  | { kind: 'equipment'; plan: EquipmentPlan }
  | { kind: 'consume'; cardId: number; reason: 'space' | 'rescue' }
  | { kind: 'perk'; perkId: string }
);

interface ActiveAttentionAction {
  action: AttentionAction;
  startedAtWall: number;
  completeAtWall: number;
}

interface MutableAttentionMetrics {
  queue: AttentionAction[];
  current: ActiveAttentionAction | null;
  completedAtWall: number[];
  delays: number[];
  successfulActions: number;
  actionCounts: Record<AttentionActionKind, number>;
  errorActions: number;
  positionSwitches: number;
  verbSwitches: number;
  lastRegion: AttentionRegion | null;
  lastVerb: AttentionActionKind | null;
  lastX: number;
  lastY: number;
  attentionWindowSeconds: number;
  overlappingWindowSeconds: number;
  overlapEpisodes: number;
  overlapActive: boolean;
  maxConcurrentWindows: number;
  attentionExtraExpired: number;
  reactionExpired: number;
  bountyRewardCollected: number;
  bountyAcceptedBreaches: number;
  bountyOffered: number;
  bountyAccepted: number;
  bountyCompleted: number;
  bountyExpired: number;
  bountyFailed: number;
  bountyRewardDrops: number;
  nextRescueDecisionAtWall: number;
  abandoned: AttentionAbandonCounts;
}

interface MutableRunMetrics {
  win: boolean;
  gameEnded: boolean;
  formed3Star: number;
  cardsFull: number;
  perkDecisions: number;
  permanentlyMissedDrops: number;
  bossEntryEconomy: EconomySnapshot | null;
  bossSpawnEconomy: EconomySnapshot | null;
  preBossKillEconomy: EconomySnapshot | null;
  bossSpawnActiveSeconds: number | null;
  bossKillActiveSeconds: number | null;
  bossBreached: boolean;
  mergesBeforeBoss: number | null;
  breatherSeconds: number;
  peak: PeakEntities;
  attention: MutableAttentionMetrics;
}

interface WaveBaseline {
  merges: number;
  formed3Star: number;
  dropsGenerated: number;
  collected: number;
  expired: number;
  consumes: number;
}

interface WaveTracker {
  stats: WaveStats[];
  baselines: Map<number, WaveBaseline>;
  finalized: Set<number>;
}

/** 三种参数组不是难度修正，而是同一局面对不同反应/切换能力玩家的压力投影。 */
export const ATTENTION_PROFILES: Record<AttentionProfileName, Readonly<HeadlessBotOptions>> = {
  fast: {
    permanentMissChance: 0.04,
    pickupReactionSeconds: 0.28,
    pickupReactionJitterSeconds: 0.1,
    equipmentDecisionIntervalSeconds: 0.25,
    pickupActionIntervalSeconds: 0.14,
    perkDecisionSeconds: 1.6,
    equipmentActionSeconds: 0.24,
    consumeActionSeconds: 0.42,
    bountyActionSeconds: 0.24,
    verbSwitchSeconds: 0.08,
    spatialTravelSecondsPer100Px: 0.025,
    actionErrorChance: 0.01,
    bountyAcceptChance: 0.82,
    rescueDistance: 105,
    rescueDecisionIntervalSeconds: 1.5,
  },
  target: {
    permanentMissChance: 0.08,
    pickupReactionSeconds: 0.45,
    pickupReactionJitterSeconds: 0.2,
    equipmentDecisionIntervalSeconds: 0.35,
    pickupActionIntervalSeconds: 0.2,
    perkDecisionSeconds: 3,
    equipmentActionSeconds: 0.34,
    consumeActionSeconds: 0.58,
    bountyActionSeconds: 0.34,
    verbSwitchSeconds: 0.18,
    spatialTravelSecondsPer100Px: 0.055,
    actionErrorChance: 0.04,
    bountyAcceptChance: 0.62,
    rescueDistance: 120,
    rescueDecisionIntervalSeconds: 2,
  },
  stressed: {
    permanentMissChance: 0.14,
    pickupReactionSeconds: 0.72,
    pickupReactionJitterSeconds: 0.3,
    equipmentDecisionIntervalSeconds: 0.55,
    pickupActionIntervalSeconds: 0.32,
    perkDecisionSeconds: 4.5,
    equipmentActionSeconds: 0.58,
    consumeActionSeconds: 0.9,
    bountyActionSeconds: 0.58,
    verbSwitchSeconds: 0.34,
    spatialTravelSecondsPer100Px: 0.1,
    actionErrorChance: 0.11,
    bountyAcceptChance: 0.38,
    rescueDistance: 145,
    rescueDecisionIntervalSeconds: 2.8,
  },
};

const DEFAULT_OPTIONS: Required<Omit<HeadlessBatchOptions, 'bot'>> = {
  runs: 1000,
  seed: 20260712,
  variantNames: [],
  metaPowerMultiplier: 1,
  maxActiveSeconds: 20 * 60,
  attentionProfile: 'target',
};

const UINT32_MAX_PLUS_ONE = 4294967296;

/** Mulberry32：同一 uint32 seed 在浏览器、Node 与 Vitest 中序列一致。 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };
}

function mixSeed(seed: number, runIndex: number, streamSalt: number): number {
  let x = (seed ^ streamSalt ^ Math.imul(runIndex + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

export function deriveRunSeeds(seed: number, runIndex: number): { gameplaySeed: number; botSeed: number } {
  return {
    gameplaySeed: mixSeed(seed, runIndex, 0xa341316c),
    botSeed: mixSeed(seed, runIndex, 0xc8013ea4),
  };
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveOptions(options: HeadlessBatchOptions): HeadlessBatchResult['options'] {
  const runs = Math.max(1, Math.floor(options.runs ?? DEFAULT_OPTIONS.runs));
  const metaPowerMultiplier = options.metaPowerMultiplier ?? DEFAULT_OPTIONS.metaPowerMultiplier;
  const maxActiveSeconds = options.maxActiveSeconds ?? DEFAULT_OPTIONS.maxActiveSeconds;
  if (!Number.isFinite(metaPowerMultiplier) || metaPowerMultiplier <= 0) {
    throw new Error('metaPowerMultiplier 必须是大于 0 的有限数');
  }
  if (!Number.isFinite(maxActiveSeconds) || maxActiveSeconds <= 0) {
    throw new Error('maxActiveSeconds 必须是大于 0 的有限数');
  }
  const attentionProfile = options.attentionProfile ?? DEFAULT_OPTIONS.attentionProfile;
  if (!(attentionProfile in ATTENTION_PROFILES)) {
    throw new Error(`未知 attentionProfile：${String(attentionProfile)}`);
  }
  const bot: HeadlessBotOptions = {
    ...ATTENTION_PROFILES[attentionProfile],
    ...options.bot,
  };
  bot.permanentMissChance = clampProbability(bot.permanentMissChance);
  bot.pickupReactionSeconds = Math.max(0, bot.pickupReactionSeconds);
  bot.pickupReactionJitterSeconds = Math.max(0, bot.pickupReactionJitterSeconds);
  bot.equipmentDecisionIntervalSeconds = Math.max(HEADLESS_DT, bot.equipmentDecisionIntervalSeconds);
  bot.pickupActionIntervalSeconds = Math.max(HEADLESS_DT, bot.pickupActionIntervalSeconds);
  bot.perkDecisionSeconds = Math.max(0, bot.perkDecisionSeconds);
  bot.equipmentActionSeconds = Math.max(HEADLESS_DT, bot.equipmentActionSeconds);
  bot.consumeActionSeconds = Math.max(HEADLESS_DT, bot.consumeActionSeconds);
  bot.bountyActionSeconds = Math.max(HEADLESS_DT, bot.bountyActionSeconds);
  bot.verbSwitchSeconds = Math.max(0, bot.verbSwitchSeconds);
  bot.spatialTravelSecondsPer100Px = Math.max(0, bot.spatialTravelSecondsPer100Px);
  bot.actionErrorChance = clampProbability(bot.actionErrorChance);
  bot.bountyAcceptChance = clampProbability(bot.bountyAcceptChance);
  bot.rescueDistance = Math.max(0, bot.rescueDistance);
  bot.rescueDecisionIntervalSeconds = Math.max(HEADLESS_DT, bot.rescueDecisionIntervalSeconds);
  return {
    runs,
    seed: (options.seed ?? DEFAULT_OPTIONS.seed) >>> 0,
    variantNames: [...(options.variantNames ?? DEFAULT_OPTIONS.variantNames)],
    metaPowerMultiplier,
    maxActiveSeconds,
    attentionProfile,
    bot,
  };
}

function recordEvents(events: GameEvent[], metrics: MutableRunMetrics): void {
  for (const event of events) {
    if (event.type === 'gameEnd') {
      metrics.gameEnded = true;
      metrics.win = event.win;
    }
    if ((event.type === 'merged' || event.type === 'fed') && event.resultStar === 3) {
      metrics.formed3Star++;
    }
    if (event.type === 'cardsFull') metrics.cardsFull++;
    if (event.type === 'bountyOffered') metrics.attention.bountyOffered++;
    if (event.type === 'bountyAccepted') metrics.attention.bountyAccepted++;
    if (event.type === 'bountyCompleted') {
      metrics.attention.bountyCompleted++;
      metrics.attention.bountyRewardDrops += event.dropCount;
    }
    if (event.type === 'bountyExpired') metrics.attention.bountyExpired++;
    if (event.type === 'bountyFailed') {
      metrics.attention.bountyFailed++;
      if (event.reason === 'breach') metrics.attention.bountyAcceptedBreaches++;
    }
    if (event.type === 'bountyRewardCollected') metrics.attention.bountyRewardCollected++;
  }
}

function createWaveTracker(): WaveTracker {
  return {
    stats: Array.from({ length: cfg.waves.totalWaves }, (_, index) => ({
      wave: index + 1,
      startActiveSeconds: null,
      endActiveSeconds: null,
      durationSeconds: null,
      merges: 0,
      formed3Star: 0,
      dropsGenerated: 0,
      collected: 0,
      expired: 0,
      consumes: 0,
      peakEnemies: 0,
    })),
    baselines: new Map(),
    finalized: new Set(),
  };
}

function startWaveTracking(
  wave: number,
  state: GameState,
  metrics: MutableRunMetrics,
  tracker: WaveTracker,
): void {
  const stat = tracker.stats[wave - 1];
  if (!stat || stat.startActiveSeconds !== null) return;
  stat.startActiveSeconds = state.time;
  stat.peakEnemies = state.enemies.length;
  tracker.baselines.set(wave, {
    merges: state.merges,
    formed3Star: metrics.formed3Star,
    dropsGenerated: state.nextDropId - 1,
    collected: state.collected,
    expired: state.expired,
    consumes: state.consumes,
  });
}

function updateWaveTracking(state: GameState, tracker: WaveTracker): void {
  const stat = tracker.stats[state.wave - 1];
  if (stat && stat.startActiveSeconds !== null && stat.endActiveSeconds === null) {
    stat.peakEnemies = Math.max(stat.peakEnemies, state.enemies.length);
  }
}

function markWaveEnd(wave: number, state: GameState, tracker: WaveTracker): void {
  const stat = tracker.stats[wave - 1];
  if (!stat || stat.endActiveSeconds !== null) return;
  stat.endActiveSeconds = state.time;
  stat.durationSeconds = state.time - (stat.startActiveSeconds ?? state.time);
}

function finalizeWaveCounters(
  wave: number,
  state: GameState,
  metrics: MutableRunMetrics,
  tracker: WaveTracker,
): void {
  const stat = tracker.stats[wave - 1];
  const baseline = tracker.baselines.get(wave);
  if (!stat || !baseline || tracker.finalized.has(wave)) return;
  stat.merges = state.merges - baseline.merges;
  stat.formed3Star = metrics.formed3Star - baseline.formed3Star;
  stat.dropsGenerated = (state.nextDropId - 1) - baseline.dropsGenerated;
  stat.collected = state.collected - baseline.collected;
  stat.expired = state.expired - baseline.expired;
  stat.consumes = state.consumes - baseline.consumes;
  tracker.finalized.add(wave);
}

function finishWaveTracking(
  wave: number,
  state: GameState,
  metrics: MutableRunMetrics,
  tracker: WaveTracker,
): void {
  markWaveEnd(wave, state, tracker);
  finalizeWaveCounters(wave, state, metrics, tracker);
}

function trackWaveEvents(
  events: GameEvent[],
  state: GameState,
  metrics: MutableRunMetrics,
  tracker: WaveTracker,
): void {
  for (const event of events) {
    if (event.type === 'waveStart') {
      if (event.wave > 1) finalizeWaveCounters(event.wave - 1, state, metrics, tracker);
      startWaveTracking(event.wave, state, metrics, tracker);
    }
    if (event.type === 'waveCleared') markWaveEnd(event.wave, state, tracker);
    if (event.type === 'gameEnd') finishWaveTracking(state.wave, state, metrics, tracker);
  }
}

function updatePeak(state: GameState, metrics: MutableRunMetrics): void {
  metrics.peak.enemies = Math.max(metrics.peak.enemies, state.enemies.length);
  metrics.peak.bullets = Math.max(metrics.peak.bullets, state.bullets.length);
  metrics.peak.drops = Math.max(metrics.peak.drops, state.groundDrops.length);
  metrics.peak.particles = Math.max(metrics.peak.particles, state.particles.length);
}

function economySnapshot(state: GameState, metrics: MutableRunMetrics): EconomySnapshot {
  return {
    formed3Star: metrics.formed3Star,
    locked3Star: countLockedThreeStar(state),
    collected: state.collected,
  };
}

function isFinalBossPresent(state: GameState): boolean {
  return state.wave === cfg.waves.bossWave
    && state.enemies.some(enemy => enemy.type === 'boss');
}

function captureBossEntry(state: GameState, metrics: MutableRunMetrics): void {
  if (!metrics.bossEntryEconomy && state.wave === cfg.waves.bossWave) {
    metrics.bossEntryEconomy = economySnapshot(state, metrics);
    metrics.mergesBeforeBoss = state.merges;
  }
}

function captureBossSpawn(state: GameState, metrics: MutableRunMetrics): void {
  if (metrics.bossSpawnActiveSeconds === null && isFinalBossPresent(state)) {
    metrics.bossSpawnActiveSeconds = state.time;
    metrics.bossSpawnEconomy = economySnapshot(state, metrics);
  }
}

function captureBossResolution(
  state: GameState,
  metrics: MutableRunMetrics,
  bossWasPresent: boolean,
  killsBefore: number,
  before: EconomySnapshot,
): void {
  if (metrics.preBossKillEconomy || metrics.bossBreached) return;
  const resolution = classifyBossResolution(
    bossWasPresent,
    isFinalBossPresent(state),
    killsBefore,
    state.kills,
  );
  if (resolution === 'killed') {
    metrics.preBossKillEconomy = before;
    metrics.bossKillActiveSeconds = state.time;
  } else if (resolution === 'breached') {
    metrics.bossBreached = true;
  }
}

export function classifyBossResolution(
  wasPresent: boolean,
  isPresent: boolean,
  killsBefore: number,
  killsAfter: number,
): 'none' | 'killed' | 'breached' {
  if (!wasPresent || isPresent) return 'none';
  return killsAfter > killsBefore ? 'killed' : 'breached';
}

function cardValue(card: Card): number {
  return cfg.economy.mergeCopies ** Math.max(0, card.star - 1);
}

function allOwnedCards(state: GameState): Card[] {
  return cfg.economy.equipMode === 'slots'
    ? [...state.cards, ...state.equipment].filter((card): card is Card => card !== null)
    : state.cards.filter((card): card is Card => card !== null);
}

function typeProgress(state: GameState, type: Card['type']): number {
  let total = 0;
  for (const card of allOwnedCards(state)) if (card.type === type) total += cardValue(card);
  return total;
}

/** 槽满时牺牲合成进度最低的未锁卡；同进度优先低星，再按槽位稳定排序。 */
function chooseConsumableIndex(state: GameState): number {
  let bestIndex = -1;
  let bestKey: [number, number, number] | null = null;
  for (let index = 0; index < state.cards.length; index++) {
    const card = state.cards[index];
    if (!card || card.locked) continue;
    const key: [number, number, number] = [typeProgress(state, card.type), card.star, index];
    if (!bestKey || key[0] < bestKey[0]
      || (key[0] === bestKey[0] && key[1] < bestKey[1])
      || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])) {
      bestKey = key;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function consumePoint(state: GameState, botRng: Rng): { x: number; y: number } {
  if (state.enemies.length > 0) {
    let target = state.enemies[0];
    for (const enemy of state.enemies) if (enemy.hp > target.hp) target = enemy;
    return {
      x: target.x + (botRng() - 0.5) * 20,
      y: target.y + (botRng() - 0.5) * 20,
    };
  }
  return { x: cfg.combat.turret.x, y: cfg.combat.turret.y };
}

function planEquipment(state: GameState): EquipmentPlan | null {
  if (cfg.economy.feedEquipped) {
    if (cfg.economy.equipMode === 'lock') {
      for (let targetIndex = 0; targetIndex < state.cards.length; targetIndex++) {
        const target = state.cards[targetIndex];
        if (!target?.locked || target.star >= cfg.economy.maxStar) continue;
        const source = state.cards.find((card, index) =>
          index !== targetIndex && !!card && !card.locked
          && card.type === target.type && card.star === target.star);
        if (source) return { operation: 'feedLock', sourceCardId: source.id, targetCardId: target.id };
      }
    } else {
      for (const target of state.equipment) {
        if (!target || target.star >= cfg.economy.maxStar) continue;
        const source = state.cards.find(card =>
          !!card && card.type === target.type && card.star === target.star);
        if (source) return { operation: 'feedSlot', sourceCardId: source.id, targetCardId: target.id };
      }
    }
  }

  const threshold = cfg.economy.equipThreshold;
  const equippedTypes = new Set(
    (cfg.economy.equipMode === 'lock'
      ? state.cards.filter(card => card?.locked)
      : state.equipment.filter(Boolean))
      .map(card => card!.type),
  );
  const candidates = state.cards
    .map((card, index) => ({ card, index }))
    .filter((entry): entry is { card: Card; index: number } =>
      !!entry.card && !entry.card.locked && entry.card.star >= threshold
      && !equippedTypes.has(entry.card.type))
    .sort((a, b) => b.card.star - a.card.star || a.index - b.index);
  if (candidates.length === 0) return null;
  if (cfg.economy.equipMode === 'lock') {
    const lockedCount = state.cards.filter(card => card?.locked).length;
    if (lockedCount >= cfg.economy.maxLocked) return null;
    return { operation: 'lock', cardId: candidates[0].card.id };
  }
  if (!state.equipment.some(card => card === null)) return null;
  return { operation: 'quickEquip', cardId: candidates[0].card.id };
}

function executeEquipmentPlan(
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  plan: EquipmentPlan,
): GameEvent[] {
  const cardIndex = (cardId: number): number => state.cards.findIndex(card => card?.id === cardId);
  const equipIndex = (cardId: number): number => state.equipment.findIndex(card => card?.id === cardId);
  if (plan.operation === 'feedLock') {
    const sourceIndex = cardIndex(plan.sourceCardId);
    const targetIndex = cardIndex(plan.targetCardId);
    if (sourceIndex < 0 || targetIndex < 0) return [];
    const source = state.cards[sourceIndex];
    const target = state.cards[targetIndex];
    if (!source || !target?.locked || source.locked || source.type !== target.type
      || source.star !== target.star || target.star >= cfg.economy.maxStar) return [];
    return moveOrSwap(state, config, gameplayRng, 'cards', sourceIndex, 'cards', targetIndex);
  }
  if (plan.operation === 'feedSlot') {
    const sourceIndex = cardIndex(plan.sourceCardId);
    const targetIndex = equipIndex(plan.targetCardId);
    if (sourceIndex < 0 || targetIndex < 0) return [];
    const source = state.cards[sourceIndex];
    const target = state.equipment[targetIndex];
    if (!source || !target || source.locked || source.type !== target.type
      || source.star !== target.star || target.star >= cfg.economy.maxStar) return [];
    return moveOrSwap(state, config, gameplayRng, 'cards', sourceIndex, 'equipment', targetIndex);
  }
  const sourceIndex = cardIndex(plan.cardId);
  if (sourceIndex < 0) return [];
  return plan.operation === 'lock'
    ? toggleLock(state, sourceIndex)
    : quickEquip(state, config, gameplayRng, sourceIndex);
}

function choosePerkId(state: GameState, botRng: Rng): string | null {
  const perks = cfg.progression.perks;
  const heal = perks.find(perk => perk.kind === 'heal');
  if (heal && state.hp / Math.max(1, state.maxHp) <= 0.6) return heal.id;
  const offense = perks.filter(perk => perk.kind === 'damagePct' || perk.kind === 'fireRatePct');
  if (offense.length > 0) return offense[Math.floor(botRng() * offense.length)].id;
  return perks[0]?.id ?? null;
}

function observeDrops(
  state: GameState,
  decisions: Map<number, DropDecision>,
  bot: HeadlessBotOptions,
  botRng: Rng,
  metrics: MutableRunMetrics,
  wallTime: number,
): void {
  for (const drop of state.groundDrops) {
    if (decisions.has(drop.id)) continue;
    const missed = botRng() < bot.permanentMissChance;
    const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
    decisions.set(drop.id, {
      missed,
      seenAtWall: wallTime,
      readyAtWall: wallTime + Math.max(0, bot.pickupReactionSeconds + jitter),
      collected: false,
    });
    if (missed) {
      metrics.permanentlyMissedDrops++;
      metrics.attention.abandoned.permanentMiss++;
    }
  }
}

function hasQueuedKey(attention: MutableAttentionMetrics, key: string): boolean {
  return attention.current?.action.key === key || attention.queue.some(action => action.key === key);
}

function hasQueuedKind(attention: MutableAttentionMetrics, kind: AttentionActionKind): boolean {
  return attention.current?.action.kind === kind || attention.queue.some(action => action.kind === kind);
}

function enqueueAction(attention: MutableAttentionMetrics, action: AttentionAction): void {
  if (!hasQueuedKey(attention, action.key)) attention.queue.push(action);
}

function enqueuePickupActions(
  state: GameState,
  decisions: Map<number, DropDecision>,
  attention: MutableAttentionMetrics,
): void {
  for (const drop of state.groundDrops) {
    const decision = decisions.get(drop.id);
    if (!decision || decision.missed || decision.collected) continue;
    enqueueAction(attention, {
      key: `pickup:${drop.id}`,
      kind: 'pickup',
      region: 'field',
      x: drop.x,
      y: drop.y,
      createdAtWall: decision.seenAtWall,
      readyAtWall: decision.readyAtWall,
      priority: 74 + (1 - drop.life / Math.max(HEADLESS_DT, drop.maxLife)) * 22,
      dropId: drop.id,
    });
  }
}

function enqueueEquipmentAction(
  state: GameState,
  bot: HeadlessBotOptions,
  botRng: Rng,
  attention: MutableAttentionMetrics,
  wallTime: number,
): void {
  if (hasQueuedKind(attention, 'equipment')) return;
  const plan = planEquipment(state);
  if (!plan) return;
  const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
  enqueueAction(attention, {
    key: `equipment:${JSON.stringify(plan)}`,
    kind: 'equipment',
    region: 'inventory',
    x: cfg.combat.canvas.width / 2,
    y: cfg.combat.canvas.height - 32,
    createdAtWall: wallTime,
    readyAtWall: wallTime + Math.max(0, bot.pickupReactionSeconds * 0.55 + jitter),
    priority: 43,
    plan,
  });
}

function enqueueSpaceConsume(
  state: GameState,
  bot: HeadlessBotOptions,
  botRng: Rng,
  attention: MutableAttentionMetrics,
  wallTime: number,
  reason: 'space' | 'rescue',
): void {
  if (hasQueuedKind(attention, 'consume')) return;
  const sourceIndex = chooseConsumableIndex(state);
  const card = state.cards[sourceIndex];
  if (!card) return;
  const point = consumePoint(state, botRng);
  const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
  enqueueAction(attention, {
    key: `consume:${card.id}`,
    kind: 'consume',
    region: 'field',
    x: point.x,
    y: point.y,
    createdAtWall: wallTime,
    readyAtWall: wallTime + Math.max(0, bot.pickupReactionSeconds * 0.6 + jitter),
    priority: reason === 'space' ? 98 : 88,
    cardId: card.id,
    reason,
  });
}

function enqueueRescueAction(
  state: GameState,
  bot: HeadlessBotOptions,
  botRng: Rng,
  attention: MutableAttentionMetrics,
  wallTime: number,
): void {
  if (wallTime < attention.nextRescueDecisionAtWall || state.enemies.length === 0) return;
  attention.nextRescueDecisionAtWall = wallTime + bot.rescueDecisionIntervalSeconds;
  const tx = cfg.combat.turret.x;
  const ty = cfg.combat.turret.y;
  const nearest = state.enemies.reduce((best, enemy) => {
    const distance = Math.hypot(enemy.x - tx, enemy.y - ty);
    return !best || distance < best.distance ? { enemy, distance } : best;
  }, null as { enemy: GameState['enemies'][number]; distance: number } | null);
  if (nearest && nearest.distance <= bot.rescueDistance) {
    enqueueSpaceConsume(state, bot, botRng, attention, wallTime, 'rescue');
  }
}

function enqueuePerkAction(
  state: GameState,
  bot: HeadlessBotOptions,
  botRng: Rng,
  attention: MutableAttentionMetrics,
  wallTime: number,
): void {
  if (!state.paused || hasQueuedKind(attention, 'perk')) return;
  const perkId = choosePerkId(state, botRng);
  if (!perkId) return;
  enqueueAction(attention, {
    key: `perk:${state.level}`,
    kind: 'perk',
    region: 'perk',
    x: cfg.combat.canvas.width / 2,
    y: cfg.combat.canvas.height / 2,
    createdAtWall: wallTime,
    readyAtWall: wallTime + bot.pickupReactionSeconds * 0.25,
    priority: 100,
    perkId,
  });
}

function observeBounties(
  state: GameState,
  bot: HeadlessBotOptions,
  botRng: Rng,
  attention: MutableAttentionMetrics,
  decisions: Map<number, 'accept' | 'reject'>,
  wallTime: number,
): void {
  for (const enemy of state.enemies) {
    if (enemy.bounty?.phase !== 'offered' || decisions.has(enemy.id)) continue;
    const distance = Math.hypot(enemy.x - cfg.combat.turret.x, enemy.y - cfg.combat.turret.y);
    const dangerMul = distance <= bot.rescueDistance ? 0.55 : 1;
    const hpMul = 0.7 + 0.3 * (enemy.hp / Math.max(1, enemy.maxHp));
    const accept = botRng() < clampProbability(bot.bountyAcceptChance * dangerMul * hpMul);
    decisions.set(enemy.id, accept ? 'accept' : 'reject');
    if (!accept) {
      attention.abandoned.bountyRiskRejected++;
      continue;
    }
    const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
    enqueueAction(attention, {
      key: `bounty:${enemy.id}`,
      kind: 'bountyAccept',
      region: 'bounty',
      x: enemy.x,
      y: enemy.y,
      createdAtWall: wallTime,
      readyAtWall: wallTime + Math.max(0, bot.pickupReactionSeconds + jitter),
      priority: 70 + Math.min(12, enemy.bounty.remaining),
      enemyId: enemy.id,
    });
  }
}

function dropActionKey(dropId: number): string {
  return `pickup:${dropId}`;
}

function removeQueuedKey(attention: MutableAttentionMetrics, key: string): void {
  attention.queue = attention.queue.filter(action => action.key !== key);
}

function reconcileExpiredDrops(
  dropsBeforeUpdate: GroundDrop[],
  state: GameState,
  decisions: Map<number, DropDecision>,
  attention: MutableAttentionMetrics,
  wallTime: number,
): void {
  const liveIds = new Set(state.groundDrops.map(drop => drop.id));
  for (const drop of dropsBeforeUpdate) {
    if (liveIds.has(drop.id)) continue;
    const decision = decisions.get(drop.id);
    if (!decision) continue;
    if (!decision.collected && !decision.missed) {
      if (wallTime < decision.readyAtWall) {
        attention.reactionExpired++;
        attention.abandoned.expiredBeforeReady++;
      } else {
        attention.attentionExtraExpired++;
        attention.abandoned.expiredInQueue++;
      }
    }
    decisions.delete(drop.id);
    removeQueuedKey(attention, dropActionKey(drop.id));
  }
}

function actionIsValid(action: AttentionAction, state: GameState): boolean {
  if (action.kind === 'pickup') {
    return state.groundDrops.some(drop => drop.id === action.dropId);
  }
  if (action.kind === 'bountyAccept') {
    return state.enemies.some(enemy =>
      enemy.id === action.enemyId && enemy.bounty?.phase === 'offered');
  }
  if (action.kind === 'equipment') return true;
  if (action.kind === 'consume') {
    return state.cards.some(card => card?.id === action.cardId && !card.locked);
  }
  return state.paused;
}

function purgeInvalidQueuedActions(
  state: GameState,
  attention: MutableAttentionMetrics,
): void {
  const kept: AttentionAction[] = [];
  for (const action of attention.queue) {
    if (actionIsValid(action, state)) {
      kept.push(action);
      continue;
    }
    if (action.kind === 'bountyAccept') attention.abandoned.bountyWindowExpired++;
    else if (action.kind !== 'pickup') attention.abandoned.invalidated++;
  }
  attention.queue = kept;
}

function actionDurationSeconds(kind: AttentionActionKind, bot: HeadlessBotOptions): number {
  if (kind === 'pickup') return bot.pickupActionIntervalSeconds;
  if (kind === 'bountyAccept') return bot.bountyActionSeconds;
  if (kind === 'equipment') return bot.equipmentActionSeconds;
  if (kind === 'consume') return bot.consumeActionSeconds;
  return bot.perkDecisionSeconds;
}

function startNextAttentionAction(
  state: GameState,
  attention: MutableAttentionMetrics,
  bot: HeadlessBotOptions,
  wallTime: number,
): void {
  if (attention.current) return;
  purgeInvalidQueuedActions(state, attention);
  let bestIndex = -1;
  for (let index = 0; index < attention.queue.length; index++) {
    const action = attention.queue[index];
    if (state.paused && action.kind !== 'perk') continue;
    if (action.readyAtWall > wallTime) continue;
    if (bestIndex < 0
      || action.priority > attention.queue[bestIndex].priority
      || (action.priority === attention.queue[bestIndex].priority
        && action.readyAtWall < attention.queue[bestIndex].readyAtWall)) {
      bestIndex = index;
    }
  }
  if (bestIndex < 0) return;
  const [action] = attention.queue.splice(bestIndex, 1);
  const distance = attention.lastRegion === null
    ? 0
    : Math.hypot(action.x - attention.lastX, action.y - attention.lastY);
  const regionChanged = attention.lastRegion !== null && attention.lastRegion !== action.region;
  const verbChanged = attention.lastVerb !== null && attention.lastVerb !== action.kind;
  if (regionChanged || distance >= 120) attention.positionSwitches++;
  if (verbChanged) attention.verbSwitches++;
  const travelSeconds = distance / 100 * bot.spatialTravelSecondsPer100Px;
  const switchSeconds = verbChanged ? bot.verbSwitchSeconds : 0;
  attention.delays.push(Math.max(0, wallTime - action.readyAtWall));
  attention.current = {
    action,
    startedAtWall: wallTime,
    completeAtWall: wallTime + actionDurationSeconds(action.kind, bot) + travelSeconds + switchSeconds,
  };
  attention.lastRegion = action.region;
  attention.lastVerb = action.kind;
  attention.lastX = action.x;
  attention.lastY = action.y;
}

type ActionOutcome = 'success' | 'blocked' | 'invalid';

function executeAttentionAction(
  active: ActiveAttentionAction,
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  botRng: Rng,
  bot: HeadlessBotOptions,
  decisions: Map<number, DropDecision>,
  metrics: MutableRunMetrics,
  wallTime: number,
): ActionOutcome {
  const action = active.action;
  if (state.paused && action.kind !== 'perk') return 'blocked';
  if (action.kind === 'pickup') {
    const drop = state.groundDrops.find(candidate => candidate.id === action.dropId);
    if (!drop) return 'invalid';
    const events = collectDrop(state, config, gameplayRng, drop);
    recordEvents(events, metrics);
    if (events.some(event => event.type === 'cardsFull')) {
      const decision = decisions.get(drop.id);
      if (decision) decision.readyAtWall = wallTime + HEADLESS_DT;
      enqueueSpaceConsume(state, bot, botRng, metrics.attention, wallTime, 'space');
      return 'blocked';
    }
    if (!events.some(event => event.type === 'collected')) return 'invalid';
    const decision = decisions.get(drop.id);
    if (decision) decision.collected = true;
    decisions.delete(drop.id);
    return 'success';
  }
  if (action.kind === 'bountyAccept') {
    const enemy = state.enemies.find(candidate => candidate.id === action.enemyId);
    if (!enemy || enemy.bounty?.phase !== 'offered') return 'invalid';
    const events = acceptBountyAt(state, config, enemy.x, enemy.y);
    recordEvents(events, metrics);
    return events.some(event => event.type === 'bountyAccepted') ? 'success' : 'invalid';
  }
  if (action.kind === 'equipment') {
    const events = executeEquipmentPlan(state, config, gameplayRng, action.plan);
    recordEvents(events, metrics);
    return events.some(event => event.type === 'fed' || event.type === 'locked'
      || event.type === 'moved' || event.type === 'swapped') ? 'success' : 'invalid';
  }
  if (action.kind === 'consume') {
    const sourceIndex = state.cards.findIndex(card => card?.id === action.cardId && !card.locked);
    if (sourceIndex < 0) return 'invalid';
    const events = consumeCard(state, config, gameplayRng, sourceIndex, action.x, action.y);
    recordEvents(events, metrics);
    return events.some(event => event.type === 'skillConsumed') ? 'success' : 'invalid';
  }
  if (!state.paused) return 'invalid';
  const events = applyPerk(state, config, action.perkId);
  recordEvents(events, metrics);
  if (!events.some(event => event.type === 'perkApplied')) return 'invalid';
  metrics.perkDecisions++;
  return 'success';
}

function retryErroredAction(
  action: AttentionAction,
  state: GameState,
  attention: MutableAttentionMetrics,
  bot: HeadlessBotOptions,
  botRng: Rng,
  wallTime: number,
  decisions: Map<number, DropDecision>,
): void {
  if (!actionIsValid(action, state)) return;
  const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
  const readyAtWall = wallTime + Math.max(HEADLESS_DT, bot.pickupReactionSeconds * 0.5 + jitter);
  if (action.kind === 'pickup') {
    const decision = decisions.get(action.dropId);
    if (decision) decision.readyAtWall = readyAtWall;
  }
  enqueueAction(attention, { ...action, createdAtWall: wallTime, readyAtWall });
}

function completeCurrentAttentionAction(
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  botRng: Rng,
  bot: HeadlessBotOptions,
  decisions: Map<number, DropDecision>,
  metrics: MutableRunMetrics,
  wallTime: number,
): void {
  const active = metrics.attention.current;
  if (!active || active.completeAtWall > wallTime) return;
  metrics.attention.current = null;
  metrics.attention.completedAtWall.push(wallTime);
  metrics.attention.actionCounts[active.action.kind]++;
  if (botRng() < bot.actionErrorChance) {
    metrics.attention.errorActions++;
    retryErroredAction(active.action, state, metrics.attention, bot, botRng, wallTime, decisions);
    return;
  }
  const outcome = executeAttentionAction(
    active,
    state,
    config,
    gameplayRng,
    botRng,
    bot,
    decisions,
    metrics,
    wallTime,
  );
  if (outcome === 'success') metrics.attention.successfulActions++;
  else if (outcome === 'invalid') metrics.attention.abandoned.invalidated++;
  else retryErroredAction(active.action, state, metrics.attention, bot, botRng, wallTime, decisions);
}

function updateAttentionWindows(attention: MutableAttentionMetrics, dt: number): void {
  const concurrent = attention.queue.length + (attention.current ? 1 : 0);
  attention.maxConcurrentWindows = Math.max(attention.maxConcurrentWindows, concurrent);
  if (concurrent > 0) attention.attentionWindowSeconds += dt;
  if (concurrent >= 2) {
    attention.overlappingWindowSeconds += dt;
    if (!attention.overlapActive) attention.overlapEpisodes++;
    attention.overlapActive = true;
  } else {
    attention.overlapActive = false;
  }
}

function rollingActionCounts(
  actionTimes: number[],
  durationSeconds: number,
  windowSeconds: number,
): number[] {
  if (durationSeconds <= 0) return [0];
  const values: number[] = [];
  let left = 0;
  let right = 0;
  for (let sample = 0.5; sample <= durationSeconds + 0.001; sample += 0.5) {
    while (right < actionTimes.length && actionTimes[right] <= sample) right++;
    while (left < right && actionTimes[left] <= sample - windowSeconds) left++;
    values.push(right - left);
  }
  return values.length > 0 ? values : [0];
}

function finalizeAttentionMetrics(
  attention: MutableAttentionMetrics,
  profile: AttentionProfileName,
  wallTime: number,
  win: boolean,
  hp: number,
): AttentionRunMetrics {
  const actions = attention.completedAtWall.length;
  const minutes = Math.max(HEADLESS_DT, wallTime) / 60;
  const delays = summarize(attention.delays);
  const rolling3 = summarize(rollingActionCounts(attention.completedAtWall, wallTime, 3));
  const rolling10 = summarize(rollingActionCounts(attention.completedAtWall, wallTime, 10));
  return {
    profile,
    actions,
    actionsPerMinute: actions / minutes,
    successfulActions: attention.successfulActions,
    pickupActions: attention.actionCounts.pickup,
    bountyAcceptActions: attention.actionCounts.bountyAccept,
    equipmentActions: attention.actionCounts.equipment,
    consumeActions: attention.actionCounts.consume,
    perkActions: attention.actionCounts.perk,
    consumeActionsPerMinute: attention.actionCounts.consume / minutes,
    rolling3sP50: rolling3.p50,
    rolling3sP95: rolling3.p95,
    rolling10sP50: rolling10.p50,
    rolling10sP95: rolling10.p95,
    queueDelayMeanSeconds: delays.mean,
    queueDelayP50Seconds: delays.p50,
    queueDelayP95Seconds: delays.p95,
    queueDelayMaxSeconds: delays.max,
    attentionWindowSeconds: attention.attentionWindowSeconds,
    overlappingWindowSeconds: attention.overlappingWindowSeconds,
    overlappingWindowShare: attention.attentionWindowSeconds > 0
      ? attention.overlappingWindowSeconds / attention.attentionWindowSeconds
      : 0,
    overlapEpisodes: attention.overlapEpisodes,
    maxConcurrentWindows: attention.maxConcurrentWindows,
    attentionExtraExpired: attention.attentionExtraExpired,
    reactionExpired: attention.reactionExpired,
    errorActions: attention.errorActions,
    errorRate: actions > 0 ? attention.errorActions / actions : 0,
    positionSwitches: attention.positionSwitches,
    verbSwitches: attention.verbSwitches,
    bountyOffered: attention.bountyOffered,
    bountyAccepted: attention.bountyAccepted,
    bountyCompleted: attention.bountyCompleted,
    bountyExpired: attention.bountyExpired,
    bountyFailed: attention.bountyFailed,
    bountyRewardDrops: attention.bountyRewardDrops,
    bountyRewardCollected: attention.bountyRewardCollected,
    bountyAcceptedBreaches: attention.bountyAcceptedBreaches,
    bountyAcceptedRunDeaths: attention.bountyAccepted > 0 && !win && hp <= 0 ? 1 : 0,
    abandoned: { ...attention.abandoned },
  };
}

function countLockedThreeStar(state: GameState): number {
  const effective = cfg.economy.equipMode === 'lock'
    ? state.cards.filter(card => card?.locked)
    : state.equipment.filter(Boolean);
  return effective.filter(card => card!.star >= 3).length;
}

function createMutableAttentionMetrics(): MutableAttentionMetrics {
  return {
    queue: [],
    current: null,
    completedAtWall: [],
    delays: [],
    successfulActions: 0,
    actionCounts: { pickup: 0, bountyAccept: 0, equipment: 0, consume: 0, perk: 0 },
    errorActions: 0,
    positionSwitches: 0,
    verbSwitches: 0,
    lastRegion: null,
    lastVerb: null,
    lastX: cfg.combat.turret.x,
    lastY: cfg.combat.turret.y,
    attentionWindowSeconds: 0,
    overlappingWindowSeconds: 0,
    overlapEpisodes: 0,
    overlapActive: false,
    maxConcurrentWindows: 0,
    attentionExtraExpired: 0,
    reactionExpired: 0,
    bountyRewardCollected: 0,
    bountyAcceptedBreaches: 0,
    bountyOffered: 0,
    bountyAccepted: 0,
    bountyCompleted: 0,
    bountyExpired: 0,
    bountyFailed: 0,
    bountyRewardDrops: 0,
    nextRescueDecisionAtWall: 0,
    abandoned: {
      permanentMiss: 0,
      expiredBeforeReady: 0,
      expiredInQueue: 0,
      bountyRiskRejected: 0,
      bountyWindowExpired: 0,
      invalidated: 0,
      gameEnded: 0,
    },
  };
}

function runOne(
  runIndex: number,
  options: HeadlessBatchResult['options'],
): HeadlessRunResult {
  const { gameplaySeed, botSeed } = deriveRunSeeds(options.seed, runIndex);
  const gameplayRng = createSeededRng(gameplaySeed);
  const botRng = createSeededRng(botSeed);
  const config = createDefaultConfig();
  config.metaPowerMultiplier = options.metaPowerMultiplier;
  const state = createInitialState();
  state.mode = 'playing';
  const metrics: MutableRunMetrics = {
    win: false,
    gameEnded: false,
    formed3Star: 0,
    cardsFull: 0,
    perkDecisions: 0,
    permanentlyMissedDrops: 0,
    bossEntryEconomy: null,
    bossSpawnEconomy: null,
    preBossKillEconomy: null,
    bossSpawnActiveSeconds: null,
    bossKillActiveSeconds: null,
    bossBreached: false,
    mergesBeforeBoss: null,
    breatherSeconds: 0,
    peak: { enemies: 0, bullets: 0, drops: 0, particles: 0 },
    attention: createMutableAttentionMetrics(),
  };
  const decisions = new Map<number, DropDecision>();
  const bountyDecisions = new Map<number, 'accept' | 'reject'>();
  const waveTracker = createWaveTracker();
  let nextEquipmentDecisionAtWall = 0;
  let wallTime = 0;
  const initialEvents = startNextWave(state, config, gameplayRng);
  recordEvents(initialEvents, metrics);
  trackWaveEvents(initialEvents, state, metrics, waveTracker);
  captureBossEntry(state, metrics);
  captureBossSpawn(state, metrics);
  updatePeak(state, metrics);

  const maxWallFrames = Math.ceil((options.maxActiveSeconds + 10 * 60) * HEADLESS_HZ);
  for (let frame = 0;
    frame < maxWallFrames && state.mode === 'playing' && state.time < options.maxActiveSeconds;
    frame++) {
    wallTime += HEADLESS_DT;
    const pausedBeforeUpdate = state.paused;
    const betweenBeforeUpdate = state.between;
    if (!pausedBeforeUpdate && betweenBeforeUpdate > 0 && betweenBeforeUpdate <= HEADLESS_DT) {
      // 在下一波 onWaveStart 效果执行前封存上一波经济，避免空投等被归到旧波。
      finalizeWaveCounters(state.wave, state, metrics, waveTracker);
    }
    const dropsBeforeUpdate = [...state.groundDrops];
    const bossBeforeUpdate = isFinalBossPresent(state);
    const killsBeforeUpdate = state.kills;
    const economyBeforeUpdate = economySnapshot(state, metrics);
    const updateEvents = updateGame(state, config, gameplayRng, HEADLESS_DT);
    recordEvents(updateEvents, metrics);
    reconcileExpiredDrops(dropsBeforeUpdate, state, decisions, metrics.attention, wallTime);
    trackWaveEvents(updateEvents, state, metrics, waveTracker);
    if (!pausedBeforeUpdate && betweenBeforeUpdate > 0) {
      metrics.breatherSeconds += Math.min(HEADLESS_DT, betweenBeforeUpdate);
    }
    captureBossResolution(state, metrics, bossBeforeUpdate, killsBeforeUpdate, economyBeforeUpdate);
    captureBossEntry(state, metrics);
    captureBossSpawn(state, metrics);
    state.particles.length = 0;
    updatePeak(state, metrics);
    updateWaveTracking(state, waveTracker);
    if (state.mode !== 'playing') break;

    observeDrops(state, decisions, options.bot, botRng, metrics, wallTime);
    enqueuePickupActions(state, decisions, metrics.attention);
    observeBounties(
      state,
      options.bot,
      botRng,
      metrics.attention,
      bountyDecisions,
      wallTime,
    );
    enqueuePerkAction(state, options.bot, botRng, metrics.attention, wallTime);
    if (!state.paused) {
      enqueueRescueAction(state, options.bot, botRng, metrics.attention, wallTime);
      if (wallTime >= nextEquipmentDecisionAtWall) {
        enqueueEquipmentAction(state, options.bot, botRng, metrics.attention, wallTime);
        nextEquipmentDecisionAtWall = wallTime + options.bot.equipmentDecisionIntervalSeconds;
      }
    }

    const bossBeforeAction = isFinalBossPresent(state);
    const killsBeforeAction = state.kills;
    const economyBeforeAction = economySnapshot(state, metrics);
    completeCurrentAttentionAction(
      state,
      config,
      gameplayRng,
      botRng,
      options.bot,
      decisions,
      metrics,
      wallTime,
    );
    captureBossResolution(state, metrics, bossBeforeAction, killsBeforeAction, economyBeforeAction);
    startNextAttentionAction(state, metrics.attention, options.bot, wallTime);
    updateAttentionWindows(metrics.attention, HEADLESS_DT);
    state.particles.length = 0;
    updatePeak(state, metrics);
    updateWaveTracking(state, waveTracker);
  }

  const timedOut = state.mode === 'playing' && !metrics.gameEnded;
  if (timedOut) finishWaveTracking(state.wave, state, metrics, waveTracker);
  metrics.attention.abandoned.gameEnded += metrics.attention.queue.length
    + (metrics.attention.current ? 1 : 0);
  const dropsGenerated = state.nextDropId - 1;
  const settlementEconomy = economySnapshot(state, metrics);
  const activeDurationSeconds = state.time;
  const bossFightDurationSeconds = metrics.bossSpawnActiveSeconds !== null
    && metrics.bossKillActiveSeconds !== null
    ? metrics.bossKillActiveSeconds - metrics.bossSpawnActiveSeconds
    : null;
  const mergesBeforeBoss = metrics.mergesBeforeBoss ?? state.merges;
  const attention = finalizeAttentionMetrics(
    metrics.attention,
    options.attentionProfile,
    wallTime,
    metrics.win,
    state.hp,
  );
  return {
    runIndex,
    gameplaySeed,
    botSeed,
    win: metrics.win,
    timedOut,
    activeDurationSeconds,
    estimatedWallDurationSeconds: wallTime,
    waveReached: state.wave,
    level: state.level,
    perkDecisions: metrics.perkDecisions,
    kills: state.kills,
    merges: state.merges,
    formed3Star: metrics.formed3Star,
    locked3Star: settlementEconomy.locked3Star,
    consumes: state.consumes,
    dropsGenerated,
    collected: state.collected,
    expired: state.expired,
    cardsFull: metrics.cardsFull,
    permanentlyMissedDrops: metrics.permanentlyMissedDrops,
    unresolvedDrops: Math.max(0, dropsGenerated - state.collected - state.expired),
    expiredRate: dropsGenerated > 0 ? state.expired / dropsGenerated : 0,
    collectedRate: dropsGenerated > 0 ? state.collected / dropsGenerated : 0,
    mergesBeforeBoss,
    mergesPerRegularWave: mergesBeforeBoss / P4_REGULAR_WAVE_KPI_DENOMINATOR,
    breatherSeconds: metrics.breatherSeconds,
    breatherShare: activeDurationSeconds > 0 ? metrics.breatherSeconds / activeDurationSeconds : 0,
    bossEntryEconomy: metrics.bossEntryEconomy,
    bossSpawnEconomy: metrics.bossSpawnEconomy,
    preBossKillEconomy: metrics.preBossKillEconomy,
    settlementEconomy,
    bossSpawnActiveSeconds: metrics.bossSpawnActiveSeconds,
    bossKillActiveSeconds: metrics.bossKillActiveSeconds,
    bossFightDurationSeconds,
    bossBreached: metrics.bossBreached,
    bossShare: bossFightDurationSeconds !== null && activeDurationSeconds > 0
      ? bossFightDurationSeconds / activeDurationSeconds
      : 0,
    waveStats: waveTracker.stats,
    peak: metrics.peak,
    attention,
  };
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function summarize(values: number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.length > 0
    ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
    : 0;
  return {
    min: sorted[0] ?? 0,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    mean,
  };
}

const METRICS: { name: string; read(run: HeadlessRunResult): number }[] = [
  { name: 'activeDurationSeconds', read: run => run.activeDurationSeconds },
  { name: 'estimatedWallDurationSeconds', read: run => run.estimatedWallDurationSeconds },
  { name: 'waveReached', read: run => run.waveReached },
  { name: 'level', read: run => run.level },
  { name: 'perkDecisions', read: run => run.perkDecisions },
  { name: 'kills', read: run => run.kills },
  { name: 'merges', read: run => run.merges },
  { name: 'formed3Star', read: run => run.formed3Star },
  { name: 'locked3Star', read: run => run.locked3Star },
  { name: 'consumes', read: run => run.consumes },
  { name: 'dropsGenerated', read: run => run.dropsGenerated },
  { name: 'collected', read: run => run.collected },
  { name: 'expired', read: run => run.expired },
  { name: 'cardsFull', read: run => run.cardsFull },
  { name: 'permanentlyMissedDrops', read: run => run.permanentlyMissedDrops },
  { name: 'unresolvedDrops', read: run => run.unresolvedDrops },
  { name: 'expiredRate', read: run => run.expiredRate },
  { name: 'collectedRate', read: run => run.collectedRate },
  { name: 'mergesBeforeBoss', read: run => run.mergesBeforeBoss },
  { name: 'mergesPerRegularWave', read: run => run.mergesPerRegularWave },
  { name: 'breatherSeconds', read: run => run.breatherSeconds },
  { name: 'breatherShare', read: run => run.breatherShare },
  { name: 'bossReached', read: run => run.bossEntryEconomy ? 1 : 0 },
  { name: 'bossKilled', read: run => run.preBossKillEconomy ? 1 : 0 },
  { name: 'bossBreached', read: run => run.bossBreached ? 1 : 0 },
  { name: 'bossEntryFormed3Star', read: run => run.bossEntryEconomy?.formed3Star ?? 0 },
  { name: 'bossEntryLocked3Star', read: run => run.bossEntryEconomy?.locked3Star ?? 0 },
  { name: 'bossEntryCollected', read: run => run.bossEntryEconomy?.collected ?? 0 },
  { name: 'bossSpawnFormed3Star', read: run => run.bossSpawnEconomy?.formed3Star ?? 0 },
  { name: 'bossSpawnLocked3Star', read: run => run.bossSpawnEconomy?.locked3Star ?? 0 },
  { name: 'bossSpawnCollected', read: run => run.bossSpawnEconomy?.collected ?? 0 },
  { name: 'preBossKillFormed3Star', read: run => run.preBossKillEconomy?.formed3Star ?? 0 },
  { name: 'preBossKillLocked3Star', read: run => run.preBossKillEconomy?.locked3Star ?? 0 },
  { name: 'preBossKillCollected', read: run => run.preBossKillEconomy?.collected ?? 0 },
  { name: 'bossFightDurationSeconds', read: run => run.bossFightDurationSeconds ?? 0 },
  { name: 'bossShare', read: run => run.bossShare },
  { name: 'peakEnemies', read: run => run.peak.enemies },
  { name: 'peakBullets', read: run => run.peak.bullets },
  { name: 'peakDrops', read: run => run.peak.drops },
  { name: 'peakParticles', read: run => run.peak.particles },
  { name: 'attentionActions', read: run => run.attention.actions },
  { name: 'attentionActionsPerMinute', read: run => run.attention.actionsPerMinute },
  { name: 'attentionSuccessfulActions', read: run => run.attention.successfulActions },
  { name: 'attentionPickupActions', read: run => run.attention.pickupActions },
  { name: 'attentionBountyAcceptActions', read: run => run.attention.bountyAcceptActions },
  { name: 'attentionEquipmentActions', read: run => run.attention.equipmentActions },
  { name: 'attentionConsumeActions', read: run => run.attention.consumeActions },
  { name: 'attentionPerkActions', read: run => run.attention.perkActions },
  { name: 'attentionRolling3sP50', read: run => run.attention.rolling3sP50 },
  { name: 'attentionRolling3sP95', read: run => run.attention.rolling3sP95 },
  { name: 'attentionRolling10sP50', read: run => run.attention.rolling10sP50 },
  { name: 'attentionRolling10sP95', read: run => run.attention.rolling10sP95 },
  { name: 'attentionQueueDelayMeanSeconds', read: run => run.attention.queueDelayMeanSeconds },
  { name: 'attentionQueueDelayP50Seconds', read: run => run.attention.queueDelayP50Seconds },
  { name: 'attentionQueueDelayP95Seconds', read: run => run.attention.queueDelayP95Seconds },
  { name: 'attentionQueueDelayMaxSeconds', read: run => run.attention.queueDelayMaxSeconds },
  { name: 'attentionOverlappingWindowShare', read: run => run.attention.overlappingWindowShare },
  { name: 'attentionOverlapEpisodes', read: run => run.attention.overlapEpisodes },
  { name: 'attentionMaxConcurrentWindows', read: run => run.attention.maxConcurrentWindows },
  { name: 'attentionExtraExpired', read: run => run.attention.attentionExtraExpired },
  { name: 'attentionReactionExpired', read: run => run.attention.reactionExpired },
  { name: 'attentionConsumeActionsPerMinute', read: run => run.attention.consumeActionsPerMinute },
  { name: 'attentionErrorActions', read: run => run.attention.errorActions },
  { name: 'attentionErrorRate', read: run => run.attention.errorRate },
  { name: 'attentionPositionSwitches', read: run => run.attention.positionSwitches },
  { name: 'attentionVerbSwitches', read: run => run.attention.verbSwitches },
  { name: 'bountyOffered', read: run => run.attention.bountyOffered },
  { name: 'bountyAccepted', read: run => run.attention.bountyAccepted },
  { name: 'bountyCompleted', read: run => run.attention.bountyCompleted },
  { name: 'bountyExpired', read: run => run.attention.bountyExpired },
  { name: 'bountyFailed', read: run => run.attention.bountyFailed },
  { name: 'bountyRewardDrops', read: run => run.attention.bountyRewardDrops },
  { name: 'bountyRewardCollected', read: run => run.attention.bountyRewardCollected },
  { name: 'bountyAcceptedBreaches', read: run => run.attention.bountyAcceptedBreaches },
  { name: 'bountyAcceptedRunDeaths', read: run => run.attention.bountyAcceptedRunDeaths },
  { name: 'abandonedPermanentMiss', read: run => run.attention.abandoned.permanentMiss },
  { name: 'abandonedExpiredBeforeReady', read: run => run.attention.abandoned.expiredBeforeReady },
  { name: 'abandonedExpiredInQueue', read: run => run.attention.abandoned.expiredInQueue },
  { name: 'abandonedBountyRiskRejected', read: run => run.attention.abandoned.bountyRiskRejected },
  { name: 'abandonedBountyWindowExpired', read: run => run.attention.abandoned.bountyWindowExpired },
  { name: 'abandonedInvalidated', read: run => run.attention.abandoned.invalidated },
  { name: 'abandonedGameEnded', read: run => run.attention.abandoned.gameEnded },
];

function summarizeRuns(runs: HeadlessRunResult[]): HeadlessBatchSummary {
  const wins = runs.filter(run => run.win).length;
  const timeouts = runs.filter(run => run.timedOut).length;
  const bossKills = runs.filter(run => run.preBossKillEconomy).length;
  const bossBreaches = runs.filter(run => run.bossBreached).length;
  const winningBossRuns = runs.filter(run =>
    run.win && !run.bossBreached && run.bossFightDurationSeconds !== null);
  const totalDrops = runs.reduce((sum, run) => sum + run.dropsGenerated, 0);
  const mean = (read: (run: HeadlessRunResult) => number): number => runs.length > 0
    ? runs.reduce((sum, run) => sum + read(run), 0) / runs.length
    : 0;
  const attentionDistribution = (
    read: (attention: AttentionRunMetrics) => number,
  ): DistributionSummary => summarize(runs.map(run => read(run.attention)));
  const attentionTotal = (read: (attention: AttentionRunMetrics) => number): number =>
    runs.reduce((sum, run) => sum + read(run.attention), 0);
  const bountyOffered = attentionTotal(value => value.bountyOffered);
  const bountyAccepted = attentionTotal(value => value.bountyAccepted);
  const bountyCompleted = attentionTotal(value => value.bountyCompleted);
  const bountyRewardDrops = attentionTotal(value => value.bountyRewardDrops);
  const bountyRewardCollected = attentionTotal(value => value.bountyRewardCollected);
  return {
    runs: runs.length,
    wins,
    losses: runs.length - wins - timeouts,
    timeouts,
    winRate: runs.length > 0 ? wins / runs.length : 0,
    bossKillRate: runs.length > 0 ? bossKills / runs.length : 0,
    bossBreachRate: runs.length > 0 ? bossBreaches / runs.length : 0,
    winningBossKills: winningBossRuns.length,
    winningBossFightDurationSeconds: summarize(
      winningBossRuns.map(run => run.bossFightDurationSeconds!),
    ),
    winningBossShare: summarize(winningBossRuns.map(run => run.bossShare)),
    expiredRate: totalDrops > 0
      ? runs.reduce((sum, run) => sum + run.expired, 0) / totalDrops
      : 0,
    collectedRate: totalDrops > 0
      ? runs.reduce((sum, run) => sum + run.collected, 0) / totalDrops
      : 0,
    mergesPerRegularWave: mean(run => run.mergesPerRegularWave),
    breatherShare: mean(run => run.breatherShare),
    bossShare: mean(run => run.bossShare),
    attention: {
      profile: runs[0]?.attention.profile ?? 'target',
      actionsPerMinute: attentionDistribution(value => value.actionsPerMinute),
      rolling3sP50: attentionDistribution(value => value.rolling3sP50),
      rolling3sP95: attentionDistribution(value => value.rolling3sP95),
      rolling10sP50: attentionDistribution(value => value.rolling10sP50),
      rolling10sP95: attentionDistribution(value => value.rolling10sP95),
      queueDelayP50Seconds: attentionDistribution(value => value.queueDelayP50Seconds),
      queueDelayP95Seconds: attentionDistribution(value => value.queueDelayP95Seconds),
      overlappingWindowShare: attentionDistribution(value => value.overlappingWindowShare),
      attentionExtraExpired: attentionDistribution(value => value.attentionExtraExpired),
      consumeActionsPerMinute: attentionDistribution(value => value.consumeActionsPerMinute),
      errorRate: attentionDistribution(value => value.errorRate),
      positionSwitches: attentionDistribution(value => value.positionSwitches),
      bountyOffered,
      bountyAccepted,
      bountyCompleted,
      bountyFailed: attentionTotal(value => value.bountyFailed),
      bountyRewardDrops,
      bountyRewardCollected,
      bountyAcceptanceRate: bountyOffered > 0 ? bountyAccepted / bountyOffered : 0,
      bountyCompletionRate: bountyAccepted > 0 ? bountyCompleted / bountyAccepted : 0,
      bountyRewardCollectionRate: bountyRewardDrops > 0
        ? bountyRewardCollected / bountyRewardDrops
        : 0,
    },
    metrics: Object.fromEntries(
      METRICS.map(metric => [metric.name, summarize(runs.map(metric.read))]),
    ),
  };
}

/**
 * 同步批量仿真。配置单例与技能注册表会在 finally 恢复，因此调用方不会被 variant 污染。
 * onProgress 只用于 CLI 展示，不参与任何 RNG 或规则结算。
 */
export function runHeadlessBatch(
  input: HeadlessBatchOptions = {},
  onProgress?: (completed: number, total: number) => void,
): HeadlessBatchResult {
  const options = resolveOptions(input);
  const previousConfig = structuredClone(cfg) as GameConfig;
  const previousParticlesEnabled = isParticleSimulationEnabled();
  const gameConfig = buildConfig(options.variantNames);
  const headlessConfig = structuredClone(gameConfig) as GameConfig;
  headlessConfig.combat.vfx.shootParticles = 0;
  headlessConfig.combat.vfx.killParticles = 0;
  headlessConfig.combat.vfx.breakthroughParticles = 0;
  headlessConfig.progression.metaPowerMultiplier = options.metaPowerMultiplier;

  try {
    applyConfig(headlessConfig);
    registerSkillDefs(headlessConfig.skills.cards);
    setParticleSimulationEnabled(false);
    const runs: HeadlessRunResult[] = [];
    const progressStep = Math.max(1, Math.floor(options.runs / 100));
    for (let runIndex = 0; runIndex < options.runs; runIndex++) {
      runs.push(runOne(runIndex, options));
      if (onProgress && ((runIndex + 1) % progressStep === 0 || runIndex + 1 === options.runs)) {
        onProgress(runIndex + 1, options.runs);
      }
    }
    return {
      options,
      simulation: { hz: HEADLESS_HZ, dt: HEADLESS_DT, vfxEnabled: false },
      configSnapshot: structuredClone(headlessConfig) as GameConfig,
      config: {
        totalWaves: headlessConfig.waves.totalWaves,
        bossWave: headlessConfig.waves.bossWave,
        equipMode: headlessConfig.economy.equipMode,
        handSlots: headlessConfig.economy.handSlots,
        equipSlots: headlessConfig.economy.equipSlots,
        maxLocked: headlessConfig.economy.maxLocked,
        maxStar: headlessConfig.economy.maxStar,
        mergeCopies: headlessConfig.economy.mergeCopies,
        baseDamage: headlessConfig.combat.defaults.damage,
        simulatedDamage: headlessConfig.combat.defaults.damage * options.metaPowerMultiplier,
        fireRate: headlessConfig.combat.defaults.fireRate,
        dropChance: headlessConfig.economy.defaults.dropChance,
      },
      summary: summarizeRuns(runs),
      runs,
    };
  } finally {
    setParticleSimulationEnabled(previousParticlesEnabled);
    applyConfig(previousConfig);
    registerSkillDefs(previousConfig.skills.cards);
  }
}

const CSV_COLUMNS: { name: string; read(run: HeadlessRunResult): string | number | boolean }[] = [
  { name: 'runIndex', read: run => run.runIndex },
  { name: 'gameplaySeed', read: run => run.gameplaySeed },
  { name: 'botSeed', read: run => run.botSeed },
  { name: 'win', read: run => run.win },
  { name: 'timedOut', read: run => run.timedOut },
  ...METRICS.map(metric => ({ name: metric.name, read: metric.read })),
];

export function headlessRunsToCsv(runs: HeadlessRunResult[]): string {
  const lines = [CSV_COLUMNS.map(column => column.name).join(',')];
  for (const run of runs) {
    lines.push(CSV_COLUMNS.map(column => String(column.read(run))).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function headlessBatchToCsv(result: HeadlessBatchResult): string {
  const batchColumns: [string, string | number][] = [
    ['variants', result.options.variantNames.join('+') || 'base'],
    ['batchSeed', result.options.seed],
    ['metaPowerMultiplier', result.options.metaPowerMultiplier],
    ['attentionProfile', result.options.attentionProfile],
    ['permanentMissChance', result.options.bot.permanentMissChance],
    ['pickupReactionSeconds', result.options.bot.pickupReactionSeconds],
    ['pickupReactionJitterSeconds', result.options.bot.pickupReactionJitterSeconds],
    ['pickupActionIntervalSeconds', result.options.bot.pickupActionIntervalSeconds],
    ['perkDecisionSeconds', result.options.bot.perkDecisionSeconds],
    ['equipmentActionSeconds', result.options.bot.equipmentActionSeconds],
    ['consumeActionSeconds', result.options.bot.consumeActionSeconds],
    ['bountyActionSeconds', result.options.bot.bountyActionSeconds],
    ['verbSwitchSeconds', result.options.bot.verbSwitchSeconds],
    ['spatialTravelSecondsPer100Px', result.options.bot.spatialTravelSecondsPer100Px],
    ['actionErrorChance', result.options.bot.actionErrorChance],
    ['bountyAcceptChance', result.options.bot.bountyAcceptChance],
    ['simulationHz', result.simulation.hz],
    ['totalWaves', result.config.totalWaves],
  ];
  const header = [
    ...batchColumns.map(([name]) => name),
    ...CSV_COLUMNS.map(column => column.name),
  ].join(',');
  const prefix = batchColumns.map(([, value]) => String(value));
  const lines = [header];
  for (const run of result.runs) {
    lines.push([
      ...prefix,
      ...CSV_COLUMNS.map(column => String(column.read(run))),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}
