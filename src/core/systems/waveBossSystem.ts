import { cfg } from '../../config';
import type { GameConfig } from '../../config';
import type { GameEvent, GameState } from '../types';
import { spawnWildcardDrop } from './dropSystem';
import type { WildcardGrant } from './wildcardSystem';

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
  const grants = computeWaveBossReward(state.wave);
  const lifetime = cfg.bounty.reward.dropLifetimeSeconds;
  for (const grant of grants) {
    spawnWildcardDrop(state, x, y, grant.star, grant.count, lifetime);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    if (drop.kind !== 'wildcard') throw new Error('Boss reward must be a wildcard drop');
    drop.bossRewardWave = state.wave;
  }
  state.bossRewardClaimedWave = state.wave;
  return [];
}
