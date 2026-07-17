import { cfg } from '../config';
import type { DifficultyCurve, DifficultyId } from '../config/types';
import type { EnemyType } from './types';

/** 归一化曲线：首波 = start，最终波 = end；power>1 → 前缓后陡。 */
export function difficultyMultiplierAtWave(curve: DifficultyCurve, wave: number, totalWaves: number): number {
  const progress = totalWaves <= 1 ? 1 : Math.min(1, Math.max(0, (wave - 1) / (totalWaves - 1)));
  return curve.start + (curve.end - curve.start) * Math.pow(progress, curve.power);
}

export interface DifficultyMultipliers { hp: number; damage: number; speed: number; }

/** 取某难度某波对某敌人类型生效的三项倍率。 */
export function difficultyMultipliersFor(difficultyId: DifficultyId, type: EnemyType, wave: number): DifficultyMultipliers {
  const profile = cfg.difficulty.profiles[difficultyId];
  const boss = type === 'boss' ? profile.boss : undefined;
  const curve = (stat: keyof DifficultyMultipliers) => boss?.[stat] ?? profile.enemy[stat];
  return {
    hp: difficultyMultiplierAtWave(curve('hp'), wave, cfg.waves.totalWaves),
    damage: difficultyMultiplierAtWave(curve('damage'), wave, cfg.waves.totalWaves),
    speed: difficultyMultiplierAtWave(curve('speed'), wave, cfg.waves.totalWaves),
  };
}
