import type { GameState } from '../core/types';
import { resolveCardVisual } from '../presentation/cardVisual';
import { glyphGeometry, shapeGeometry, traceGeometryToCanvas } from '../presentation/skillGeometry';

const TAU = Math.PI * 2;

/** 地面掉落：发光圆牌 + 图标 + 倒计时圆环 + 剩余秒数。 */
export function drawDrops(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const drop of state.groundDrops) {
    const visual = resolveCardVisual(drop.type);
    const ratio = Math.max(0, drop.life / drop.maxLife);
    const bob = Math.sin(drop.pulse) * 3;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.shadowBlur = 11;
    ctx.shadowColor = visual.accent;
    ctx.fillStyle = 'rgba(5,13,24,.92)';
    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    traceGeometryToCanvas(ctx, shapeGeometry(visual.shape), 40);
    ctx.fill('evenodd');
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    traceGeometryToCanvas(ctx, glyphGeometry(visual.glyph), 25);
    ctx.stroke();
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${drop.life.toFixed(1)}s`, 0, 36);
    ctx.restore();
  }
}
