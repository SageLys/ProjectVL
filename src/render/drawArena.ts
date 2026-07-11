import { cfg } from '../config';
import type { Config, GameState } from '../core/types';
import { totalRange } from '../core/stats';

const TAU = Math.PI * 2;

/** 背景网格、内圈与当前射程虚线圈。 */
export function drawArena(ctx: CanvasRenderingContext2D, state: GameState, config: Config): void {
  const T = cfg.combat.turret;
  const W = cfg.combat.canvas.width;
  const H = cfg.combat.canvas.height;
  ctx.fillStyle = '#06101d';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(29,79,112,.18)');
  g.addColorStop(1, 'rgba(3,9,18,.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(103,232,249,.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(197,138,255,.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(T.x, T.y, 62, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([7, 9]);
  ctx.strokeStyle = 'rgba(103,232,249,.13)';
  ctx.beginPath();
  ctx.arc(T.x, T.y, totalRange(state, config), 0, TAU);
  ctx.stroke();
  ctx.restore();
}
