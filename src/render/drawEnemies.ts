import { cfg } from '../config';
import type { GameState } from '../core/types';

const TAU = Math.PI * 2;

/** 敌人多边形（高速3/普通4/重装6/boss8 边）+ 血条 + 状态可视化（占位）。 */
export function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.hit > 0) ctx.globalAlpha = 0.55;
    ctx.shadowBlur = 18;
    ctx.shadowColor = e.color;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    const sides = cfg.enemies.types[e.type].sides;
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * TAU) / sides;
      const r = e.r * (i % 2 ? 0.82 : 1);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(2,8,17,.86)';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.38, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 状态可视化（占位）：冻结=实线蓝圈；减速=虚线蓝圈；烙印=金圈。
    if (e.status.frozen > 0 || e.status.slow || e.status.brand) {
      ctx.save();
      ctx.lineWidth = 2;
      if (e.status.frozen > 0) {
        ctx.strokeStyle = 'rgba(140,236,255,.9)';
      } else if (e.status.slow) {
        ctx.strokeStyle = 'rgba(140,236,255,.5)';
        ctx.setLineDash([4, 4]);
      }
      if (e.status.frozen > 0 || e.status.slow) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
        ctx.stroke();
      }
      if (e.status.brand) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,209,102,.85)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 9, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2, 4);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
  }
}
