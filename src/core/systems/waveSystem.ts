import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { endGame } from '../endGame';
import { createEnemy, randomEdgeSpawnPosition, spawnEnemy, spawnWaveBoss } from './enemySystem';
import { fireTrigger } from '../effects/interpreter';
import { budgetAdmission, budgetWaveQuotaFor } from './budgetRules';
import { resolveActiveWavePlan } from '../runStage';
export { budgetAdmission } from './budgetRules';

/** 第 wave 波的总出怪配额：base + wave*perWave。 */
export function enemyCountFor(wave: number): number {
  return cfg.waves.enemyCountBase + wave * cfg.waves.enemyCountPerWave;
}

/**
 * 进入下一波：推进波数、排定生成节奏，并触发 onWaveStart（装备态护盾回填/图腾/空投等）。
 */
export function startNextWave(state: GameState, config: Config, rng: Rng): GameEvent[] {
  state.wave++;
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
  state.waveBossId = null;
  state.waveBossSpawnedAt = null;
  state.between = 0;
  state.bountyOffers.length = 0;
  state.bountyDirector.offersThisWave = 0;
  state.bountyDirector.acceptedThisWave = 0;
  state.bountyDirector.completedThisWave = 0;
  state.bountyDirector.guaranteedThisWave = false;
  state.bountyDirector.checkTimer = cfg.bounty.offer.checkIntervalSeconds;
  if (wavePlan.validation) {
    state.spawnLeft = 0;
    state.waveSpawnQuota = 0;
    for (const spec of wavePlan.validation.enemies) {
      state.enemies.push(createEnemy(state, spec.type, state.wave, randomEdgeSpawnPosition(rng), {
        hpMul: spec.hpMul,
        damageMul: spec.damageMul,
        speedMul: spec.speedMul,
        spawnKind: 'validationElite',
        ccResistOverride: spec.ccResistOverride,
        knockbackResistOverride: spec.knockbackResistOverride,
        validationReward: spec.reward,
      }));
    }
  }
  const events: GameEvent[] = [{ type: 'waveStart', wave: state.wave }];
  events.push(...fireTrigger(state, config, rng, 'onWaveStart', { wave: state.wave }));
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

/**
 * 波次清空判定：本波敌人生成完且场上清空时，最后一波→胜利结束，
 * 否则进入 betweenWaves 间隔并产出 waveCleared。
 */
function finishWave(state: GameState): GameEvent[] {
  state.wavePhase = 'between';
  state.waveBossId = null;
  state.waveBossSpawnedAt = null;
  if (state.wave >= cfg.waves.totalWaves) return endGame(state, true);
  state.between = cfg.waves.betweenWaves;
  return [{ type: 'waveCleared', wave: state.wave }];
}

/** Advance the explicit regular -> Boss -> between wave phase machine. */
export function advanceWavePhase(state: GameState, _config: Config, rng: Rng): GameEvent[] {
  if (state.mode !== 'playing') return [];
  const bountyActive = state.bountyEncounters.some(encounter => encounter.status === 'spawning' || encounter.status === 'active');
  if (state.wavePhase === 'regular') {
    const blockingEnemy = state.enemies.some(enemy => enemy.spawnKind === 'regular' || enemy.spawnKind === 'bounty' || enemy.spawnKind === 'validationElite');
    if (state.spawnLeft !== 0 || blockingEnemy || bountyActive) return [];
    const events: GameEvent[] = state.bountyOffers.map(offer => ({ type: 'bountyOfferExpired' as const, offerId: offer.id }));
    state.bountyOffers.length = 0;
    if (!cfg.waves.bossWaves.includes(state.wave)) return [...events, ...finishWave(state)];
    const boss = spawnWaveBoss(state, rng);
    state.wavePhase = 'boss';
    state.waveBossId = boss.id;
    state.waveBossSpawnedAt = state.time;
    return [...events, { type: 'waveBossSpawned', wave: state.wave }];
  }
  if (state.wavePhase === 'boss'
    && state.waveBossId !== null
    && !state.enemies.some(enemy => enemy.id === state.waveBossId)
    && state.bossRewardClaimedWave >= state.wave
    && !state.groundDrops.some(drop => drop.kind === 'wildcard' && drop.bossRewardWave === state.wave)
    && !state.groundDrops.some(drop => drop.secure && drop.validationRewardWave === state.wave)) return finishWave(state);
  return [];
}

/** 波间隔倒计时；归零则开启下一波。 */
export function tickBetween(state: GameState, config: Config, rng: Rng, dt: number, beforeWaveStart?: () => void): GameEvent[] {
  if (state.wavePhase !== 'between' || state.mode !== 'playing') return [];
  state.between -= dt;
  if (state.between <= 0) { beforeWaveStart?.(); return startNextWave(state, config, rng); }
  return [];
}

/** 调试入口：清理战场瞬态并直接开启指定波；不改变卡牌、成长、HP 与经济状态。 */
export function jumpToWave(state: GameState, config: Config, rng: Rng, targetWave: number): GameEvent[] {
  const wave = Math.max(1, Math.min(cfg.waves.totalWaves, Math.trunc(targetWave)));
  state.enemies.length = 0;
  state.bullets.length = 0;
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
  state.between = 0;
  state.wavePhase = 'regular';
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
