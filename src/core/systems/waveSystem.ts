import { waves as wavesData } from '../../data';
import type { GameEvent, GameState, Rng } from '../types';
import { endGame } from '../endGame';
import { clearTempCards } from './equipmentSystem';
import { spawnEnemy } from './enemySystem';

/** 第 wave 波的敌人数量：base + wave*perWave（即 5 + 3N）。 */
export function enemyCountFor(wave: number): number {
  return wavesData.enemyCountBase + wave * wavesData.enemyCountPerWave;
}

/**
 * 进入下一波：先清空临时栏（从第 2 波起），再推进波数并排定生成节奏。
 * 返回 [tempCleared?, waveStart] 事件。
 */
export function startNextWave(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.wave > 0) events.push(...clearTempCards(state));
  state.wave++;
  state.spawnLeft = enemyCountFor(state.wave);
  state.spawnTimer = wavesData.firstSpawnDelay;
  state.waveClearPending = false;
  state.between = 0;
  events.push({ type: 'waveStart', wave: state.wave });
  return events;
}

/** 按节奏生成敌人：间隔 max(min, base - wave*perWave)。 */
export function tickSpawns(state: GameState, rng: Rng, dt: number): void {
  if (state.spawnLeft <= 0) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, rng);
    state.spawnLeft--;
    const si = wavesData.spawnInterval;
    state.spawnTimer = Math.max(si.min, si.base - state.wave * si.perWave);
  }
}

/**
 * 波次清空判定：本波敌人生成完且场上清空时，最后一波→胜利结束，
 * 否则进入 betweenWaves 间隔并产出 waveCleared。
 */
export function checkWaveClear(state: GameState): GameEvent[] {
  if (state.spawnLeft === 0 && state.enemies.length === 0 && !state.waveClearPending && state.mode === 'playing') {
    state.waveClearPending = true;
    if (state.wave >= wavesData.totalWaves) return endGame(state, true);
    state.between = wavesData.betweenWaves;
    return [{ type: 'waveCleared', wave: state.wave }];
  }
  return [];
}

/** 波间隔倒计时；归零则开启下一波。 */
export function tickBetween(state: GameState, dt: number): GameEvent[] {
  if (state.between > 0) {
    state.between -= dt;
    if (state.between <= 0) return startNextWave(state);
  }
  return [];
}
