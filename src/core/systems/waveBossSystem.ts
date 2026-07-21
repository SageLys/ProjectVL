import { cfg } from '../../config';
import type { GameConfig } from '../../config';
import type { Enemy, GameEvent, GameState } from '../types';
import { spawnWildcardDrop } from './dropSystem';
import type { WildcardGrant } from './wildcardSystem';
import { resolveActiveWavePlan } from '../runStage';

export function computeWaveBossReward(wave: number, game: GameConfig = cfg): WildcardGrant[] {
  const reward = game.waves.waveBoss.reward;
  const safeWave = Math.max(1, Math.trunc(wave));
  const star = Math.min(
    reward.starMax,
    1 + Math.floor((safeWave - 1) / Math.max(1, reward.starTierEveryWaves)),
  );
  const count = 1
    + (safeWave % Math.max(1, reward.bonusCountEveryWaves) === 0 ? 1 : 0)
    + (safeWave === game.waves.totalWaves ? reward.finalWaveBonusCount : 0);
  return [{ star, count }];
}

/** Drops the Boss reward for manual pickup, using the same wildcard drop presentation as elite rewards. */
export function grantWaveBossReward(state: GameState, x: number, y: number): GameEvent[] {
  if (state.bossRewardClaimedWave >= state.wave) return [];
  const plan = resolveActiveWavePlan(cfg, state.wave);
  const grants = plan.validation ? [plan.validation.bossReward] : computeWaveBossReward(state.wave);
  const lifetime = cfg.bounty.reward.dropLifetimeSeconds;
  for (const grant of grants) {
    spawnWildcardDrop(state, x, y, grant.star, grant.count, lifetime);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    if (drop.kind !== 'wildcard') throw new Error('Boss reward must be a wildcard drop');
    drop.bossRewardWave = state.wave;
    drop.source = 'bossKill';
    if (plan.validation) {
      drop.secure = true;
      drop.validationRewardWave = state.wave;
    }
  }
  state.bossRewardClaimedWave = state.wave;
  return [];
}

/** Drops one secure wildcard pickup for a defeated validation elite. */
export function grantValidationEliteReward(state: GameState, enemy: Enemy): GameEvent[] {
  const reward = enemy.validationReward;
  if (!reward) return [];
  spawnWildcardDrop(state, enemy.x, enemy.y, reward.star, reward.count, cfg.bounty.reward.dropLifetimeSeconds);
  const drop = state.groundDrops[state.groundDrops.length - 1];
  if (drop.kind !== 'wildcard') throw new Error('Validation reward must be a wildcard drop');
  drop.secure = true;
  drop.validationRewardWave = state.wave;
  return [];
}
