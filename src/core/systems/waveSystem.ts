import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { endGame } from '../endGame';
import { spawnEnemy } from './enemySystem';
import { fireTrigger } from '../effects/interpreter';

/** 第 wave 波的敌人数量：base + wave*perWave。 */
export function enemyCountFor(wave: number): number {
  return cfg.waves.enemyCountBase + wave * cfg.waves.enemyCountPerWave;
}

/**
 * 进入下一波：推进波数、排定生成节奏，并触发 onWaveStart（装备态护盾回填/图腾/空投等）。
 */
export function startNextWave(state: GameState, config: Config, rng: Rng): GameEvent[] {
  state.wave++;
  state.spawnLeft = enemyCountFor(state.wave);
  state.spawnTimer = cfg.waves.firstSpawnDelay;
  state.waveClearPending = false;
  state.between = 0;
  const events: GameEvent[] = [{ type: 'waveStart', wave: state.wave }];
  events.push(...fireTrigger(state, config, rng, 'onWaveStart', { wave: state.wave }));
  return events;
}

/** 按节奏生成敌人：间隔 max(min, base - wave*perWave)。 */
export function tickSpawns(state: GameState, rng: Rng, dt: number): void {
  if (state.spawnLeft <= 0) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, rng);
    state.spawnLeft--;
    const si = cfg.waves.spawnInterval;
    state.spawnTimer = Math.max(si.min, si.base - state.wave * si.perWave);
  }
}

/**
 * 波次清空判定：本波敌人生成完且场上清空时，最后一波→胜利结束，
 * 否则进入 betweenWaves 间隔并产出 waveCleared。
 */
export function checkWaveClear(state: GameState): GameEvent[] {
  if (state.spawnLeft === 0 && state.enemies.length === 0 && !state.waveClearPending && state.mode === 'playing') {
    // 尾波保留地面奖励的拾取窗口；全部拾取或自然过期后再结算，避免 Boss 奖励在同帧胜利时失效。
    if (state.wave >= cfg.waves.totalWaves && state.groundDrops.length > 0) return [];
    state.waveClearPending = true;
    if (state.wave >= cfg.waves.totalWaves) return endGame(state, true);
    state.between = cfg.waves.betweenWaves;
    return [{ type: 'waveCleared', wave: state.wave }];
  }
  return [];
}

/** 波间隔倒计时；归零则开启下一波。 */
export function tickBetween(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  if (state.between > 0) {
    state.between -= dt;
    if (state.between <= 0) return startNextWave(state, config, rng);
  }
  return [];
}
