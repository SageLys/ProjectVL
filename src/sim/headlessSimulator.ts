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
import type { Card, Config, GameEvent, GameState, GroundDrop, Rng } from '../core/types';
import { updateGame } from '../core/updateGame';

export const HEADLESS_HZ = 30;
export const HEADLESS_DT = 1 / HEADLESS_HZ;
export const P4_REGULAR_WAVE_KPI_DENOMINATOR = 8;

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
}

export interface HeadlessBatchOptions {
  runs?: number;
  seed?: number;
  variantNames?: string[];
  /** 局外成长占位：只乘运行期基础 damage，不修改 core 或磁盘配置。 */
  metaPowerMultiplier?: number;
  maxActiveSeconds?: number;
  bot?: Partial<HeadlessBotOptions>;
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
  metrics: Record<string, DistributionSummary>;
}

export interface HeadlessBatchResult {
  options: Required<Omit<HeadlessBatchOptions, 'bot'>> & { bot: HeadlessBotOptions };
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
  readyAt: number;
  missed: boolean;
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

const DEFAULT_BOT: HeadlessBotOptions = {
  permanentMissChance: 0.12,
  pickupReactionSeconds: 0.45,
  pickupReactionJitterSeconds: 0.2,
  equipmentDecisionIntervalSeconds: 0.35,
  pickupActionIntervalSeconds: 0.18,
  perkDecisionSeconds: 3,
};

const DEFAULT_OPTIONS: Required<Omit<HeadlessBatchOptions, 'bot'>> = {
  runs: 1000,
  seed: 20260712,
  variantNames: [],
  metaPowerMultiplier: 1,
  maxActiveSeconds: 20 * 60,
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
  const bot: HeadlessBotOptions = {
    ...DEFAULT_BOT,
    ...options.bot,
  };
  bot.permanentMissChance = clampProbability(bot.permanentMissChance);
  bot.pickupReactionSeconds = Math.max(0, bot.pickupReactionSeconds);
  bot.pickupReactionJitterSeconds = Math.max(0, bot.pickupReactionJitterSeconds);
  bot.equipmentDecisionIntervalSeconds = Math.max(HEADLESS_DT, bot.equipmentDecisionIntervalSeconds);
  bot.pickupActionIntervalSeconds = Math.max(HEADLESS_DT, bot.pickupActionIntervalSeconds);
  bot.perkDecisionSeconds = Math.max(0, bot.perkDecisionSeconds);
  return {
    runs,
    seed: (options.seed ?? DEFAULT_OPTIONS.seed) >>> 0,
    variantNames: [...(options.variantNames ?? DEFAULT_OPTIONS.variantNames)],
    metaPowerMultiplier,
    maxActiveSeconds,
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

function feedOneEquippedCard(state: GameState, config: Config, gameplayRng: Rng): GameEvent[] | null {
  if (!cfg.economy.feedEquipped) return null;
  if (cfg.economy.equipMode === 'lock') {
    for (let targetIndex = 0; targetIndex < state.cards.length; targetIndex++) {
      const target = state.cards[targetIndex];
      if (!target?.locked || target.star >= cfg.economy.maxStar) continue;
      const sourceIndex = state.cards.findIndex((card, index) =>
        index !== targetIndex && !!card && !card.locked
        && card.type === target.type && card.star === target.star);
      if (sourceIndex >= 0) {
        return moveOrSwap(state, config, gameplayRng, 'cards', sourceIndex, 'cards', targetIndex);
      }
    }
    return null;
  }
  for (let targetIndex = 0; targetIndex < state.equipment.length; targetIndex++) {
    const target = state.equipment[targetIndex];
    if (!target || target.star >= cfg.economy.maxStar) continue;
    const sourceIndex = state.cards.findIndex(card =>
      !!card && card.type === target.type && card.star === target.star);
    if (sourceIndex >= 0) {
      return moveOrSwap(state, config, gameplayRng, 'cards', sourceIndex, 'equipment', targetIndex);
    }
  }
  return null;
}

function equipOneCard(state: GameState, config: Config, gameplayRng: Rng): GameEvent[] | null {
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
    return toggleLock(state, candidates[0].index);
  }
  if (!state.equipment.some(card => card === null)) return null;
  return quickEquip(state, config, gameplayRng, candidates[0].index);
}

/** 先喂养已有 2★ 装备，再锁定/装备新的达标类型，直到无合法动作。 */
function manageEquipment(
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  metrics: MutableRunMetrics,
): void {
  const actionLimit = state.cards.length + state.equipment.length + 4;
  for (let action = 0; action < actionLimit; action++) {
    const events = feedOneEquippedCard(state, config, gameplayRng)
      ?? equipOneCard(state, config, gameplayRng);
    if (!events || events.length === 0) return;
    recordEvents(events, metrics);
  }
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
): void {
  const liveIds = new Set<number>();
  for (const drop of state.groundDrops) {
    liveIds.add(drop.id);
    if (decisions.has(drop.id)) continue;
    const missed = botRng() < bot.permanentMissChance;
    const jitter = (botRng() * 2 - 1) * bot.pickupReactionJitterSeconds;
    decisions.set(drop.id, {
      missed,
      readyAt: state.time + Math.max(0, bot.pickupReactionSeconds + jitter),
    });
    if (missed) metrics.permanentlyMissedDrops++;
  }
  for (const id of decisions.keys()) if (!liveIds.has(id)) decisions.delete(id);
}

function attemptPickup(
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  botRng: Rng,
  drop: GroundDrop,
  metrics: MutableRunMetrics,
): void {
  const events = collectDrop(state, config, gameplayRng, drop);
  recordEvents(events, metrics);
  if (!events.some(event => event.type === 'cardsFull')) return;

  const sourceIndex = chooseConsumableIndex(state);
  if (sourceIndex < 0) return;
  const point = consumePoint(state, botRng);
  recordEvents(consumeCard(state, config, gameplayRng, sourceIndex, point.x, point.y), metrics);
  const liveDrop = state.groundDrops.find(candidate => candidate.id === drop.id);
  if (liveDrop) recordEvents(collectDrop(state, config, gameplayRng, liveDrop), metrics);
}

function processReadyDrops(
  state: GameState,
  config: Config,
  gameplayRng: Rng,
  botRng: Rng,
  decisions: Map<number, DropDecision>,
  metrics: MutableRunMetrics,
): boolean {
  const ready = state.groundDrops
    .filter(drop => {
      const decision = decisions.get(drop.id);
      return decision && !decision.missed && decision.readyAt <= state.time;
    })
    .sort((a, b) => a.life - b.life || a.id - b.id);
  const drop = ready[0];
  if (!drop) return false;
  attemptPickup(state, config, gameplayRng, botRng, drop, metrics);
  if (state.groundDrops.some(candidate => candidate.id === drop.id)) {
    const decision = decisions.get(drop.id);
    if (decision) decision.readyAt = state.time + HEADLESS_DT;
  } else {
    decisions.delete(drop.id);
  }
  return true;
}

function countLockedThreeStar(state: GameState): number {
  const effective = cfg.economy.equipMode === 'lock'
    ? state.cards.filter(card => card?.locked)
    : state.equipment.filter(Boolean);
  return effective.filter(card => card!.star >= 3).length;
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
  };
  const decisions = new Map<number, DropDecision>();
  const waveTracker = createWaveTracker();
  let nextEquipmentDecisionAt = 0;
  let nextPickupAt = 0;
  const initialEvents = startNextWave(state, config, gameplayRng);
  recordEvents(initialEvents, metrics);
  trackWaveEvents(initialEvents, state, metrics, waveTracker);
  captureBossEntry(state, metrics);
  captureBossSpawn(state, metrics);
  updatePeak(state, metrics);

  const maxFrames = Math.ceil(options.maxActiveSeconds * HEADLESS_HZ);
  for (let frame = 0; frame < maxFrames && state.mode === 'playing'; frame++) {
    const betweenBeforeUpdate = state.between;
    if (betweenBeforeUpdate > 0 && betweenBeforeUpdate <= HEADLESS_DT) {
      // 在下一波 onWaveStart 效果执行前封存上一波经济，避免空投等被归到旧波。
      finalizeWaveCounters(state.wave, state, metrics, waveTracker);
    }
    const bossBeforeUpdate = isFinalBossPresent(state);
    const killsBeforeUpdate = state.kills;
    const economyBeforeUpdate = economySnapshot(state, metrics);
    const updateEvents = updateGame(state, config, gameplayRng, HEADLESS_DT);
    recordEvents(updateEvents, metrics);
    trackWaveEvents(updateEvents, state, metrics, waveTracker);
    if (betweenBeforeUpdate > 0) {
      metrics.breatherSeconds += Math.min(HEADLESS_DT, betweenBeforeUpdate);
    }
    captureBossResolution(state, metrics, bossBeforeUpdate, killsBeforeUpdate, economyBeforeUpdate);
    captureBossEntry(state, metrics);
    captureBossSpawn(state, metrics);
    state.particles.length = 0;
    updatePeak(state, metrics);
    updateWaveTracking(state, waveTracker);
    if (state.mode !== 'playing') break;

    if (state.paused) {
      const perkId = choosePerkId(state, botRng);
      if (perkId) {
        recordEvents(applyPerk(state, config, perkId), metrics);
        metrics.perkDecisions++;
      }
      if (state.paused) break;
    }

    observeDrops(state, decisions, options.bot, botRng, metrics);
    const bossBeforePickup = isFinalBossPresent(state);
    const killsBeforePickup = state.kills;
    const economyBeforePickup = economySnapshot(state, metrics);
    if (state.time >= nextPickupAt
      && processReadyDrops(state, config, gameplayRng, botRng, decisions, metrics)) {
      nextPickupAt = state.time + options.bot.pickupActionIntervalSeconds;
    }
    captureBossResolution(state, metrics, bossBeforePickup, killsBeforePickup, economyBeforePickup);
    if (state.time >= nextEquipmentDecisionAt) {
      const bossBeforeEquipment = isFinalBossPresent(state);
      const killsBeforeEquipment = state.kills;
      const economyBeforeEquipment = economySnapshot(state, metrics);
      manageEquipment(state, config, gameplayRng, metrics);
      captureBossResolution(state, metrics, bossBeforeEquipment, killsBeforeEquipment, economyBeforeEquipment);
      nextEquipmentDecisionAt = state.time + options.bot.equipmentDecisionIntervalSeconds;
    }
    state.particles.length = 0;
    updatePeak(state, metrics);
    updateWaveTracking(state, waveTracker);
  }

  const timedOut = state.mode === 'playing' && !metrics.gameEnded;
  if (timedOut) finishWaveTracking(state.wave, state, metrics, waveTracker);
  const dropsGenerated = state.nextDropId - 1;
  const settlementEconomy = economySnapshot(state, metrics);
  const activeDurationSeconds = state.time;
  const bossFightDurationSeconds = metrics.bossSpawnActiveSeconds !== null
    && metrics.bossKillActiveSeconds !== null
    ? metrics.bossKillActiveSeconds - metrics.bossSpawnActiveSeconds
    : null;
  const mergesBeforeBoss = metrics.mergesBeforeBoss ?? state.merges;
  return {
    runIndex,
    gameplaySeed,
    botSeed,
    win: metrics.win,
    timedOut,
    activeDurationSeconds,
    estimatedWallDurationSeconds:
      state.time + metrics.perkDecisions * options.bot.perkDecisionSeconds,
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
    ['permanentMissChance', result.options.bot.permanentMissChance],
    ['pickupReactionSeconds', result.options.bot.pickupReactionSeconds],
    ['pickupReactionJitterSeconds', result.options.bot.pickupReactionJitterSeconds],
    ['pickupActionIntervalSeconds', result.options.bot.pickupActionIntervalSeconds],
    ['perkDecisionSeconds', result.options.bot.perkDecisionSeconds],
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
