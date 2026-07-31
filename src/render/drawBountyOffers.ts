import { cfg } from '../config';
import type { BountySide, GameState } from '../core/types';
import { resolveCardVisual } from '../presentation/cardVisual';
import { glyphGeometry, shapeGeometry, traceGeometryToCanvas } from '../presentation/skillGeometry';
import { cardDisplayName } from '../ui/cardMeta';
import { currentArenaCssScale, logicalFontPx } from './renderMetrics';

const TAU = Math.PI * 2;

function inwardAngle(side: BountySide): number {
  if (side === 'top') return Math.PI / 2;
  if (side === 'right') return Math.PI;
  if (side === 'bottom') return -Math.PI / 2;
  return 0;
}

/** Edge Offer marker: promised reward identity, threat direction, and acceptance countdown. */
export function drawBountyOffers(ctx: CanvasRenderingContext2D, state: GameState): void {
  const fontPx = logicalFontPx(11, currentArenaCssScale(ctx));
  for (const offer of state.bountyOffers) {
    const visual = resolveCardVisual(offer.rewardCardType);
    const radius = cfg.bounty.visual.offerRadius;
    const ratio = Math.max(0, offer.remaining / Math.max(Number.EPSILON, cfg.bounty.offer.markWindowSeconds));
    ctx.save();
    ctx.translate(offer.x, offer.y);

    ctx.shadowBlur = 14;
    ctx.shadowColor = visual.accent;
    ctx.fillStyle = 'rgba(5,13,24,.94)';
    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    traceGeometryToCanvas(ctx, shapeGeometry(visual.shape), radius * 1.35);
    ctx.fill('evenodd');
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    traceGeometryToCanvas(ctx, glyphGeometry(visual.glyph), radius * 0.82);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, TAU - Math.PI / 2);
    ctx.stroke();
    ctx.strokeStyle = ratio > 0.35 ? visual.accent : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    if (offer.guaranteed) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5, 0, TAU);
      ctx.stroke();
    }

    ctx.rotate(inwardAngle(offer.side));
    ctx.fillStyle = visual.accent;
    ctx.beginPath();
    ctx.moveTo(radius + 4, 0);
    ctx.lineTo(radius + 12, -6);
    ctx.lineTo(radius + 12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (cfg.bounty.visual.showRewardName) {
      ctx.save();
      ctx.fillStyle = '#e8f2ff';
      ctx.font = `bold ${fontPx}px Microsoft YaHei`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = Math.min(cfg.combat.canvas.height - 13, offer.y + radius + 6);
      const lines = [
        `${cardDisplayName(offer.rewardCardType)} ${offer.rewardCardStar}★×${offer.rewardCardCount}`,
        `万能${offer.wildcardStar}★×${offer.wildcardCount}`,
      ];
      const maxWidth = Math.min(220, cfg.combat.canvas.width - 20);
      const x = Math.max(maxWidth / 2 + 10, Math.min(cfg.combat.canvas.width - maxWidth / 2 - 10, offer.x));
      lines.forEach((line, index) => ctx.fillText(line, x, labelY + index * fontPx * 1.15, maxWidth));
      ctx.restore();
    }
  }
}
