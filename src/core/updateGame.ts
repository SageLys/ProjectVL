import type { Config, GameEvent, GameState, Rng } from './types';
import { updateTurret, updateBullets } from './systems/combatSystem';
import { moveEnemies } from './systems/enemySystem';
import { tickSpawns, checkWaveClear, tickBetween } from './systems/waveSystem';
import { tickDrops } from './systems/dropSystem';
import { updateParticles } from './systems/particleSystem';
import { tickEffects } from './effects/runtime';

/**
 * 单帧推进：纯函数，只接收 state + config + dt + 注入的 rng，就地推进状态并返回语义事件。
 * 效果运行时（区域/光环/召唤物/护盾/状态/interval 绑定）在实体推进后统一 tick。
 */
export function updateGame(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  if (state.mode !== 'playing' || state.paused) return [];
  const events: GameEvent[] = [];
  state.time += dt;

  events.push(...updateTurret(state, config, rng, dt));
  events.push(...tickSpawns(state, rng, dt));
  events.push(...updateBullets(state, config, rng, dt));
  events.push(...moveEnemies(state, config, rng, dt));
  events.push(...tickEffects(state, config, rng, dt));
  events.push(...tickDrops(state, config, rng, dt));
  updateParticles(state, dt);
  events.push(...checkWaveClear(state));
  events.push(...tickBetween(state, config, rng, dt));

  return events;
}
