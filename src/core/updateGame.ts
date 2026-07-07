import type { Config, GameEvent, GameState, Rng } from './types';
import { updateTurret, updateBullets } from './systems/combatSystem';
import { moveEnemies } from './systems/enemySystem';
import { tickSpawns, checkWaveClear, tickBetween } from './systems/waveSystem';
import { tickDrops } from './systems/dropSystem';
import { updateParticles } from './systems/particleSystem';

/**
 * 单帧推进：纯函数，只接收 state + config + dt + 注入的 rng，就地推进状态并返回语义事件。
 * 事件顺序与原 update() 保持一致，供表现层驱动 toast / 弹窗 / UI 刷新。
 */
export function updateGame(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  if (state.mode !== 'playing' || state.paused) return [];
  const events: GameEvent[] = [];
  state.time += dt;

  updateTurret(state, config, rng, dt);
  tickSpawns(state, rng, dt);
  events.push(...updateBullets(state, config, rng, dt));
  events.push(...moveEnemies(state, config, rng, dt));
  tickDrops(state, dt);
  updateParticles(state, dt);
  events.push(...checkWaveClear(state));
  events.push(...tickBetween(state, dt));

  return events;
}
