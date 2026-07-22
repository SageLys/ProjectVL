import type { GameState } from '../core/types';

const TAU = Math.PI * 2;

export function drawBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.bullets) {
    const mortar = b.kind === 'mortar';
    const fragment = b.kind === 'fragment';
    const arcScale = mortar ? 1 + Math.sin(Math.PI * (b.flightProgress ?? 0)) * 0.9 : 1;
    ctx.shadowBlur = mortar ? 20 : fragment ? 8 : 14;
    ctx.shadowColor = mortar ? '#ff9f43' : '#70ecff';
    ctx.fillStyle = mortar ? '#ffb347' : fragment ? '#dffcff' : '#c7f8ff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * arcScale * (fragment ? 0.75 : 1), 0, TAU);
    ctx.fill();
    if (mortar) {
      ctx.fillStyle = '#fff0c2';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35 * arcScale, 0, TAU);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}
