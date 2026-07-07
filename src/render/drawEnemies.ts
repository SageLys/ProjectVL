import { enemies as enemiesData } from '../data';
import type { GameState } from '../core/types';

const TAU = Math.PI * 2;

/** 敌人多边形（高速3/普通4/重装6/boss8 边，边数取自 enemies.json）+ 血条。 */
export function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.hit > 0) ctx.globalAlpha = 0.55;
    ctx.shadowBlur = 18;
    ctx.shadowColor = e.color;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    const sides = enemiesData[e.type].sides;
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
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2, 4);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
  }
}
