import { cfg } from '../../config';
import type { GameConfig } from '../../config';
import type { GameEvent, GameState } from '../types';
import { grantWildcards, type WildcardGrant } from './wildcardSystem';

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

/** Grants directly to inventory; the lower-level test-oriented grant event is replaced by a Boss event. */
export function grantWaveBossReward(state: GameState): GameEvent[] {
  if (state.bossRewardClaimedWave >= state.wave) return [];
  const grants = computeWaveBossReward(state.wave);
  grantWildcards(state, grants);
  state.bossRewardClaimedWave = state.wave;
  return [{ type: 'bossRewardGranted', wave: state.wave, grants }];
}
