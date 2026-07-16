import type { Config, GameState } from '../core/types';
import { drawArena } from './drawArena';
import { drawParticles } from './drawParticles';
import { drawBullets } from './drawBullets';
import { drawEnemies } from './drawEnemies';
import { drawDrops } from './drawDrops';
import { drawTurret } from './drawTurret';
import { drawZones, drawSummonsAndShield } from './drawEffects';
import { drawBountyOffers } from './drawBountyOffers';
import { drawBountyEffects } from './drawBountyEffects';

/** 建立渲染器：返回逐帧调用的 render(state, config)。区域画在实体下，召唤物/护盾画在实体上。 */
export function createRenderer(ctx: CanvasRenderingContext2D) {
  return function render(state: GameState, config: Config): void {
    drawArena(ctx, state, config);
    drawBountyOffers(ctx, state);
    drawZones(ctx, state);
    drawParticles(ctx, state);
    drawBullets(ctx, state);
    drawEnemies(ctx, state);
    drawBountyEffects(ctx, state);
    drawDrops(ctx, state);
    drawSummonsAndShield(ctx, state);
    drawTurret(ctx, state);
  };
}
