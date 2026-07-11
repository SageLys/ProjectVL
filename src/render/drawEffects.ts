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
  if (shield && shield.hits > 0) {
    const t = cfg.combat.turret;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * (shield.hits / shield.maxHits);
    ctx.strokeStyle = '#8cecff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 46, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
