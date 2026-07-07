import type { GameState } from '../core/types';

const TAU = Math.PI * 2;

export function drawBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.bullets) {
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#70ecff';
    ctx.fillStyle = '#c7f8ff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}
