import type { Config, GameState } from '../core/types';
import { drawArena } from './drawArena';
import { drawParticles } from './drawParticles';
import { drawBullets } from './drawBullets';
import { drawEnemies } from './drawEnemies';
import { drawDrops } from './drawDrops';
import { drawTurret } from './drawTurret';
import { drawZones, drawTauntRanges, drawSummonsAndShield } from './drawEffects';
import { drawBeams } from './drawBeams';
import { drawVfx } from './drawVfx';
import { drawBountyOffers } from './drawBountyOffers';
import { drawBountyEffects } from './drawBountyEffects';
import { applyLogicalCanvasTransform } from './renderMetrics';

/** 建立渲染器：返回逐帧调用的 render(state, config)。区域画在实体下，召唤物/护盾画在实体上。 */
export function createRenderer(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement = ctx.canvas) {
  return function render(state: GameState, config: Config): void {
    applyLogicalCanvasTransform(ctx, canvas);
    drawArena(ctx, state, config);
    drawBountyOffers(ctx, state);
    drawZones(ctx, state);
    drawTauntRanges(ctx, state);
    drawParticles(ctx, state);
    drawBullets(ctx, state);
    drawEnemies(ctx, state);
    drawBeams(ctx, state);
    drawVfx(ctx, state);
    drawBountyEffects(ctx, state);
    drawDrops(ctx, state);
    drawSummonsAndShield(ctx, state);
    drawTurret(ctx, state);
  };
}
