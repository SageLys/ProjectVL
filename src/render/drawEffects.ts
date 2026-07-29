// 效果运行时实体的最小可视化：区域 / 召唤物 / 护盾。
// P3 占位画法（可玩验证用），正式表现随 P5 内容实装再做。
import { cfg } from '../config';
import type { GameState } from '../core/types';

const TAU = Math.PI * 2;

/** 地面区域（敌人脚下的效果圈）：在实体层之下绘制。 */
export function drawZones(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const zone of state.zones) {
    const alpha = Math.min(0.35, 0.15 + zone.remaining * 0.05);
    const color = zone.color ?? '#67e8f9';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (zone.shape === 'line') {
      const startX = zone.lineStartX ?? zone.x;
      const startY = zone.lineStartY ?? zone.y;
      const length = zone.lineLength ?? zone.radius * 2;
      const endX = startX + (zone.lineDirX ?? 1) * length;
      const endY = startY + (zone.lineDirY ?? 0) * length;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = (zone.lineWidth ?? zone.radius) + 4;
      ctx.globalAlpha = Math.min(0.8, alpha * 2);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.lineWidth = zone.lineWidth ?? zone.radius;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, TAU);
    if (zone.shape === 'ring') {
      ctx.arc(zone.x, zone.y, zone.innerRadius ?? zone.radius * 0.5, 0, TAU, true);
    }
    ctx.fill();
    ctx.globalAlpha = Math.min(0.8, alpha * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Taunt ranges are a ground-layer affordance: zones below, combat entities above. */
export function drawTauntRanges(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const summon of state.summons) {
    if (!summon.tauntRadius || summon.tauntRadius <= 0) continue;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(summon.x, summon.y, summon.tauntRadius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(summon.x, summon.y, summon.tauntRadius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** 召唤物与炮台护盾：在实体层之上绘制。 */
export function drawSummonsAndShield(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const s of state.summons) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.shadowBlur = 14;
    if (s.kind === 'decoy') {
      ctx.shadowColor = '#ffd166';
      ctx.fillStyle = '#3d2f1a';
      ctx.strokeStyle = '#ffd166';
    } else if (s.kind === 'mirrorTurret') {
      ctx.shadowColor = '#c58aff';
      ctx.fillStyle = '#241a3d';
      ctx.strokeStyle = '#c58aff';
    } else {
      ctx.shadowColor = '#8cecff';
      ctx.fillStyle = '#12324a';
      ctx.strokeStyle = '#8cecff';
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.kind === 'orbital' ? 9 : 14, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (s.maxHp > 0 && s.kind !== 'orbital') {
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(-16, -24, 32, 4);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-16, -24, 32 * Math.max(0, s.hp / s.maxHp), 4);
    }
    ctx.restore();
  }

  const shield = state.shield;
  if (!shield) return;

  const t = cfg.combat.turret;
  const radius = 46;
  const maxHits = Math.max(1, Math.round(shield.maxHits));
  const hits = Math.max(0, Math.min(maxHits, Math.round(shield.hits)));
  ctx.save();
  ctx.strokeStyle = '#8cecff';
  ctx.lineCap = 'round';

  if (hits > 0) {
    const ratio = hits / maxHits;
    const segmentAngle = TAU / maxHits;
    const gap = Math.min(0.14, segmentAngle * 0.22);
    for (let i = 0; i < maxHits; i++) {
      const start = -Math.PI / 2 + i * segmentAngle + gap / 2;
      const end = -Math.PI / 2 + (i + 1) * segmentAngle - gap / 2;
      ctx.globalAlpha = i < hits ? 0.42 + ratio * 0.38 : 0.09;
      ctx.lineWidth = i < hits ? 3 + ratio * 2 : 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, start, end);
      ctx.stroke();
    }

    // The top remaining segment breathes so a full/strong shield reads at a glance.
    const top = hits - 1;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 4.5);
    const start = -Math.PI / 2 + top * segmentAngle + gap / 2;
    const end = -Math.PI / 2 + (top + 1) * segmentAngle - gap / 2;
    ctx.globalAlpha = 0.22 + pulse * 0.28;
    ctx.lineWidth = 5 + pulse * 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, radius + 1.5, start, end);
    ctx.stroke();
  } else if (shield.regenRemaining != null) {
    const regenSeconds = Math.max(0.001, shield.regenSeconds ?? shield.regenRemaining);
    const progress = Math.max(0, Math.min(1, 1 - shield.regenRemaining / regenSeconds));
    ctx.setLineDash([5, 7]);
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, radius, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = 0.42 + progress * 0.32;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
