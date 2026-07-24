import { cfg } from '../../config';
import type { RunBaseStatKind } from '../../config/types';
import type { GameEvent, GameState, WaveRewardGrant } from '../types';

function applyRunBaseReward(
  state: GameState,
  effect: { stat: RunBaseStatKind; add: number },
): void {
  switch (effect.stat) {
    case 'damageAdd':
      state.runBaseStats.damageAdd += effect.add;
      break;
    case 'fireRateAdd':
      state.runBaseStats.fireRateAdd += effect.add;
      break;
    case 'rangeAdd':
      state.runBaseStats.rangeAdd += effect.add;
      break;
    case 'multiAdd':
      state.runBaseStats.multiAdd += effect.add;
      break;
    case 'maxHpAdd':
      state.maxHp += effect.add;
      state.hp += effect.add;
      break;
    case 'heal':
      state.hp = Math.min(state.maxHp, state.hp + effect.add);
      break;
  }
}

/**
 * Settles every matching reward in one batch. The claimed-wave cursor is moved
 * before applying effects so repeated hooks and restored settle frames are safe.
 */
export function grantWaveRewards(state: GameState, wave: number): GameEvent[] {
  if (wave <= 0 || state.waveRewardsClaimedWave >= wave) return [];
  state.waveRewardsClaimedWave = wave;

  const granted: WaveRewardGrant[] = [];
  for (const def of cfg.waveRewards.rewards) {
    if (def.waves !== 'all' && !def.waves.includes(wave)) continue;
    applyRunBaseReward(state, def.effect);
    granted.push({ id: def.id, stat: def.effect.stat, add: def.effect.add });
  }

  return granted.length ? [{ type: 'waveRewardsGranted', wave, granted }] : [];
}
