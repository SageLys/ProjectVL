import type { GameState } from '../core/types';
import { resolveCardMeta } from '../ui/cardMeta';

const TAU = Math.PI * 2;

/** 地面掉落：发光圆牌 + 图标 + 倒计时圆环 + 剩余秒数。 */
export function drawDrops(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const drop of state.groundDrops) {
    const meta = resolveCardMeta(drop.type, drop.star);
    const ratio = Math.max(0, drop.life / drop.maxLife);
    const bob = Math.sin(drop.pulse) * 3;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.shadowBlur = 18;
    ctx.shadowColor = meta.color;
    ctx.fillStyle = 'rgba(5,13,24,.92)';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = meta.color;
    ctx.font = 'bold 17px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.icon, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 27, -Math.PI / 2, TAU - Math.PI / 2);
    ctx.stroke();
    ctx.strokeStyle = ratio > 0.35 ? '#67e8f9' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 10px Microsoft YaHei';
    ctx.fillText(`${drop.life.toFixed(1)}s`, 0, 36);
    ctx.restore();
  }
}
