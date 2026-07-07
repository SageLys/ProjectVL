import type { Config, GameState } from '../core/types';
import { drawArena } from './drawArena';
import { drawParticles } from './drawParticles';
import { drawBullets } from './drawBullets';
import { drawEnemies } from './drawEnemies';
import { drawDrops } from './drawDrops';
import { drawTurret } from './drawTurret';

/** 建立渲染器：返回逐帧调用的 render(state, config)，绘制顺序与原 draw() 一致。 */
export function createRenderer(ctx: CanvasRenderingContext2D) {
  return function render(state: GameState, config: Config): void {
    drawArena(ctx, state, config);
    drawParticles(ctx, state);
    drawBullets(ctx, state);
    drawEnemies(ctx, state);
    drawDrops(ctx, state);
    drawTurret(ctx, state);
  };
}
