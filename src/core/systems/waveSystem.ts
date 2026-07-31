import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { endGame } from '../endGame';
import { createEnemy, determineValidationType, randomEdgeSpawnPosition, spawnEnemy, spawnWaveBoss } from './enemySystem';
import { fireTrigger, reconcileEquipmentPassives } from '../effects/interpreter';
import { budgetAdmission, budgetWaveQuotaFor } from './budgetRules';
import { resolveActiveWavePlan } from '../runStage';
import { clearDecisionQueue } from './decisionQueueSystem';
import { beginIntermission, beginValidationRewardSettle, endIntermission, tickIntermission } from './intermissionSystem';
import { generateActivePool } from './activePoolSystem';
export { budgetAdmission } from './budgetRules';

/** 第 wave 波的总出怪配额：base + wave*perWave。 */
export function enemyCountFor(wave: number): number {
  return cfg.waves.enemyCountBase + wave * cfg.waves.enemyCountPerWave;
}

/**
 * 进入下一波：推进波数、排定生成节奏，并触发 onWaveStart（装备态护盾回填/图腾/空投等）。
 */
export function startNextWave(state: GameState, config: Config, rng: Rng): GameEvent[] {
  endIntermission(state);
  state.wave++;
  state.effectRuntime.pickupsThisWave = 0;
  const activePool = generateActivePool(state, state.wave, rng);
  state.combatTelemetry = { wave: state.wave, perCard: {} };
  state.ordinaryDrop.credit = Math.min(cfg.economy.ordinaryDropRate.carryCap, state.ordinaryDrop.credit);
  state.ordinaryDrop.activeRegularSeconds = 0;
  state.ordinaryDrop.shownThisWave = 0;
  state.ordinaryDrop.eligibleKillsThisWave = 0;
  const wavePlan = resolveActiveWavePlan(cfg, state.wave);
  state.spawnLeft = cfg.waves.spawnMode === 'budget'
    ? budgetWaveQuotaFor(wavePlan)
    : enemyCountFor(state.wave);
  state.waveSpawnQuota = state.spawnLeft;
  state.spawnTimer = cfg.waves.firstSpawnDelay;
  state.lastSpawnCheckCount = 0;
  state.wavePhase = 'regular';
  state.validationRewardSettleRemaining = 0;
  state.validationRewardSettleConfirmed = false;
  state.validationRuntime = { spawnedEliteIndexes: [], bossEscortTimer: 0, bossEscortsCleared: false };
  state.waveBossId = null;
  state.waveBossSpawnedAt = null;
  state.bountyOffers.length = 0;
  state.bountyDirector.offersThisWave = 0;
  state.bountyDirector.acceptedThisWave = 0;
  state.bountyDirector.completedThisWave = 0;
  state.bountyDirector.guaranteedThisWave = false;
  state.bountyDirector.checkTimer = cfg.bounty.offer.checkIntervalSeconds;
  const events: GameEvent[] = [
    { type: 'waveStart', wave: state.wave },
    ...(state.godPool.mainGod ? [{
      type: 'activePoolCreated',
      wave: state.wave,
      focusGod: state.godPool.focusGod,
      cardTypes: activePool,
    } as const] : []),
  ];
  events.push(...fireTrigger(state, config, rng, 'onWaveStart', { wave: state.wave }));
  events.push(...reconcileEquipmentPassives(state, config, rng));
  return events;
}

/** 按节奏生成敌人：间隔 max(min, base - wave*perWave)。 */
export interface SpawnStrategy {
  tick(state: GameState, rng: Rng, dt: number): void;
}

/** Fixed-interval strategy. Its operations intentionally match the former tickSpawns body. */
const intervalSpawnStrategy: SpawnStrategy = { tick(state, rng, dt) {
  if (state.spawnLeft <= 0) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, rng);
    state.spawnLeft--;
    const si = cfg.waves.spawnInterval;
    state.spawnTimer = Math.max(si.min, si.base - state.wave * si.perWave);
  }
} };

/** Budget target for the current wave, including the quota-based end sprint. */
export function budgetTargetFor(state: GameState): number {
  return budgetAdmission(resolveActiveWavePlan(cfg, state.wave), state.spawnLeft, state.enemies.length).effectiveTarget;
}

const budgetSpawnStrategy: SpawnStrategy = { tick(state, rng, dt) {
  if (state.spawnLeft <= 0) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const plan = resolveActiveWavePlan(cfg, state.wave);
  const count = budgetAdmission(plan, state.spawnLeft, state.enemies.length).spawnCount;
  for (let i = 0; i < count; i++) {
    spawnEnemy(state, rng);
    state.spawnLeft--;
  }
  state.lastSpawnCheckCount = count;
  state.spawnTimer = plan.regular?.checkInterval ?? cfg.waves.budget.checkInterval;
} };

const SPAWN_STRATEGIES: Record<typeof cfg.waves.spawnMode, SpawnStrategy> = {
  interval: intervalSpawnStrategy,
  budget: budgetSpawnStrategy,
};

/** Advance spawning through the configured strategy. */
export function tickSpawns(state: GameState, rng: Rng, dt: number): void {
  if (state.wavePhase !== 'regular') return;
  SPAWN_STRATEGIES[cfg.waves.spawnMode].tick(state, rng, dt);
}

/** Validation director: milestone elites, Boss escorts, and post-Boss escort cleanup. */
export function tickValidationDirector(state: GameState, _config: Config, rng: Rng, dt: number): GameEvent[] {
  if (state.mode !== 'playing') return [];
  const plan = resolveActiveWavePlan(cfg, state.wave);
  if (!plan.validation) return [];
  const events: GameEvent[] = [];

  if (state.wavePhase === 'regular') {
    const quota = state.waveSpawnQuota;
    const progress = quota > 0 ? 1 - state.spawnLeft / quota : 1;
    for (let eliteIndex = 0; eliteIndex < plan.validation.elites.length; eliteIndex++) {
      if (state.validationRuntime.spawnedEliteIndexes.includes(eliteIndex)) continue;
      const spec = plan.validation.elites[eliteIndex];
      if (spec.spawnAtProgress > progress) continue;
      const elite = createEnemy(state, spec.type, state.wave, randomEdgeSpawnPosition(rng), {
        hpMul: spec.hpMul,
        damageMul: spec.damageMul,
        speedMul: spec.speedMul,
        spawnKind: 'validationElite',
        ccResistOverride: spec.ccResistOverride,
        knockbackResistOverride: spec.knockbackResistOverride,
        validationReward: spec.reward,
      });
      state.enemies.push(elite);
      state.validationRuntime.spawnedEliteIndexes.push(eliteIndex);
      events.push({ type: 'validationEliteSpawned', wave: state.wave, eliteIndex, enemyId: elite.id });
    }
  }

  const bossAlive = state.waveBossId !== null
    && state.enemies.some(enemy => enemy.id === state.waveBossId);
  const escort = plan.validation.bossEscort;
  if (state.wavePhase === 'boss' && escort && bossAlive) {
    state.validationRuntime.bossEscortTimer -= dt;
    while (state.validationRuntime.bossEscortTimer <= 0) {
      const alive = state.enemies.filter(enemy => enemy.spawnKind === 'validationMinion').length;
      const count = Math.min(escort.count, Math.max(0, escort.maxAlive - alive));
      for (let index = 0; index < count; index++) {
        const type = determineValidationType(escort.composition, rng());
        state.enemies.push(createEnemy(state, type, state.wave, randomEdgeSpawnPosition(rng), {
          spawnKind: 'validationMinion',
          hpMul: escort.hpMul,
          damageMul: escort.damageMul,
          speedMul: escort.speedMul,
        }));
      }
      if (count > 0) events.push({ type: 'validationEscortSpawned', wave: state.wave, count });
      state.validationRuntime.bossEscortTimer += escort.intervalSeconds;
    }
  }

  if (state.wavePhase === 'boss' && state.waveBossId !== null && !bossAlive
    && !state.validationRuntime.bossEscortsCleared) {
    const before = state.enemies.length;
    state.enemies = state.enemies.filter(enemy => enemy.spawnKind !== 'validationMinion');
    const removed = before - state.enemies.length;
    state.validationRuntime.bossEscortsCleared = true;
    events.push({ type: 'validationEscortsCleared', wave: state.wave, removed });
  }
  return events;
}

/**
 * 波次清空判定：本波敌人生成完且场上清空时，最后一波→胜利结束，
 * 否则进入正式波间阶段并产出 waveCleared。
 */
function finishWave(state: GameState): GameEvent[] {
  state.waveBossId = null;
  state.waveBossSpawnedAt = null;
  if (state.wave >= cfg.waves.totalWaves) return endGame(state, true);
  return beginIntermission(state);
}

/** Advance the explicit regular -> Boss -> between wave phase machine. */
export function advanceWavePhase(state: GameState, _config: Config, rng: Rng): GameEvent[] {
  if (state.mode !== 'playing') return [];
  const bountyActive = state.bountyEncounters.some(encounter => encounter.status === 'spawning' || encounter.status === 'active');
  if (state.wavePhase === 'regular') {
    const blockingEnemy = state.enemies.some(enemy =>
      enemy.spawnKind === 'regular'
      || enemy.spawnKind === 'bounty'
      || enemy.spawnKind === 'validationElite'
      || enemy.spawnKind === 'validationMinion');
    if (state.spawnLeft !== 0 || blockingEnemy || bountyActive) return [];
    const events: GameEvent[] = state.bountyOffers.map(offer => ({ type: 'bountyOfferExpired' as const, offerId: offer.id }));
    state.bountyOffers.length = 0;
    if (!cfg.waves.bossWaves.includes(state.wave)) return [...events, ...finishWave(state)];
    if (resolveActiveWavePlan(cfg, state.wave).validation) {
      return [...events, ...beginValidationRewardSettle(state)];
    }
    const boss = spawnWaveBoss(state, rng);
    state.wavePhase = 'boss';
    state.waveBossId = boss.id;
    state.waveBossSpawnedAt = state.time;
    state.validationRuntime.bossEscortTimer = resolveActiveWavePlan(cfg, state.wave).validation?.bossEscort?.intervalSeconds ?? 0;
    return [...events, { type: 'waveBossSpawned', wave: state.wave }];
  }
  if (state.wavePhase === 'validationRewardSettle') {
    if (!state.validationRewardSettleConfirmed && state.validationRewardSettleRemaining > 0) return [];
    const boss = spawnWaveBoss(state, rng);
    state.wavePhase = 'boss';
    state.waveBossId = boss.id;
    state.waveBossSpawnedAt = state.time;
    state.validationRuntime.bossEscortTimer = resolveActiveWavePlan(cfg, state.wave).validation?.bossEscort?.intervalSeconds ?? 0;
    state.validationRewardSettleRemaining = 0;
    return [{ type: 'waveBossSpawned', wave: state.wave }];
  }
  if (state.wavePhase === 'boss'
    && state.waveBossId !== null
    && !state.enemies.some(enemy => enemy.id === state.waveBossId)
    && state.bossRewardClaimedWave >= state.wave
    && !state.groundDrops.some(drop => drop.kind === 'wildcard' && drop.bossRewardWave === state.wave)
    && !state.groundDrops.some(drop => drop.secure && drop.validationRewardWave === state.wave)) return finishWave(state);
  return [];
}

/** 正式波间状态机；只有显式准备完成或 free 超时才开启下一波。 */
export function tickBetween(state: GameState, config: Config, rng: Rng, dt: number, beforeWaveStart?: () => void): GameEvent[] {
  if (state.wavePhase !== 'between' || state.mode !== 'playing') return [];
  const result = tickIntermission(state, dt, rng);
  if (!result.complete) return result.events;
  beforeWaveStart?.();
  endIntermission(state);
  return [...result.events, ...startNextWave(state, config, rng)];
}

/** 调试入口：清理战场瞬态并直接开启指定波；不改变卡牌、成长、HP 与经济状态。 */
export function jumpToWave(state: GameState, config: Config, rng: Rng, targetWave: number): GameEvent[] {
  const wave = Math.max(1, Math.min(cfg.waves.totalWaves, Math.trunc(targetWave)));
  state.enemies.length = 0;
  state.bullets.length = 0;
  state.beams.length = 0;
  state.vfx.length = 0;
  state.particles.length = 0;
  state.groundDrops.length = 0;
  state.zones.length = 0;
  state.summons.length = 0;
  state.bountyOffers.length = 0;
  state.bountyEncounters.length = 0;
  state.bountyDirector.offersThisWave = 0;
  state.bountyDirector.acceptedThisWave = 0;
  state.bountyDirector.completedThisWave = 0;
  state.bountyDirector.guaranteedThisWave = false;
  state.bountyDirector.checkTimer = cfg.bounty.offer.checkIntervalSeconds;
  state.bountyDirector.cooldownRemaining = 0;
  state.intervalClocks = {};
  state.spawnLeft = 0;
  state.spawnTimer = 0;
  clearDecisionQueue(state);
  endIntermission(state);
  // Debug jumps skip prior rewards but never make an already claimed wave claimable again.
  state.waveRewardsClaimedWave = Math.max(state.waveRewardsClaimedWave, wave - 1);
  state.waveChoiceOfferedWave = Math.max(state.waveChoiceOfferedWave ?? 0, wave - 1);
  state.wavePhase = 'regular';
  state.validationRewardSettleRemaining = 0;
  state.validationRewardSettleConfirmed = false;
  state.waveBossId = null;
  state.waveBossSpawnedAt = null;
  state.bossRewardClaimedWave = 0;
  state.ordinaryDrop.credit = 0;
  state.ordinaryDrop.activeRegularSeconds = 0;
  state.ordinaryDrop.shownThisWave = 0;
  state.ordinaryDrop.eligibleKillsThisWave = 0;
  state.ordinaryDrop.buildStageSeconds = 0;
  state.runSummary = null;
  state.shotCd = 0;
  state.mode = 'playing';
  state.paused = false;
  state.wave = wave - 1;
  return startNextWave(state, config, rng);
}

/** 调试入口：按当前波号重新清场开波。尚未开局时等价于开启第 1 波。 */
export function restartWave(state: GameState, config: Config, rng: Rng): GameEvent[] {
  return jumpToWave(state, config, rng, Math.max(1, state.wave));
}
