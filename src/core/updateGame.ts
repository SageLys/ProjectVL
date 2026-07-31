import type { Config, GameEvent, GameState, Rng } from './types';
import { updateTurret, updateBullets } from './systems/combatSystem';
import { moveEnemies } from './systems/enemySystem';
import { tickBountySystem } from './systems/bountySystem';
import { tickSpawns, tickValidationDirector, advanceWavePhase, tickBetween } from './systems/waveSystem';
import { tickDrops, tickOrdinaryDropBudget } from './systems/dropSystem';
import { updateParticles } from './systems/particleSystem';
import { tickEffects } from './effects/runtime';
import { updateRecipeDirector } from './systems/recipeEvolutionSystem';
import { tickValidationRewardSettle } from './systems/intermissionSystem';

/**
 * 单帧推进：纯函数，只接收 state + config + dt + 注入的 rng，就地推进状态并返回语义事件。
 * 效果运行时（区域/光环/召唤物/护盾/状态/interval 绑定）在实体推进后统一 tick。
 */
export function updateGame(state: GameState, config: Config, rng: Rng, dt: number, beforeWaveStart?: () => void): GameEvent[] {
  if (
    state.mode !== 'playing'
    || state.paused
    || state.decisions.current !== null
    || state.decisions.pending.length > 0
  ) return [];
  if (state.intermission.active) {
    state.time += dt;
    return [
      ...tickBetween(state, config, rng, dt, beforeWaveStart),
      ...updateRecipeDirector(state),
    ];
  }
  const events: GameEvent[] = [];
  state.time += dt;
  tickValidationRewardSettle(state, dt);
  tickOrdinaryDropBudget(state, dt);

  events.push(...updateTurret(state, config, rng, dt));
  tickSpawns(state, rng, dt);
  events.push(...tickValidationDirector(state, config, rng, dt));
  events.push(...updateBullets(state, config, rng, dt));
  events.push(...moveEnemies(state, config, rng, dt));
  events.push(...tickBountySystem(state, config, rng, dt));
  events.push(...tickEffects(state, config, rng, dt));
  events.push(...tickDrops(state, config, rng, dt));
  updateParticles(state, dt);
  events.push(...advanceWavePhase(state, config, rng));
  events.push(...updateRecipeDirector(state));

  return events;
}
