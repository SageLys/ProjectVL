import type { GameState, Summon } from '../core/types';

const TAU = Math.PI * 2;

function progress(remaining: number, duration: number): number {
  return 1 - Math.max(0, Math.min(1, remaining / duration));
}

function drawSpike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  ctx.lineTo(x + Math.cos(angle + 2.45) * size * 0.75, y + Math.sin(angle + 2.45) * size * 0.75);
  ctx.lineTo(x + Math.cos(angle - 2.45) * size * 0.75, y + Math.sin(angle - 2.45) * size * 0.75);
  ctx.closePath();
  ctx.fill();
}

function pulseTarget(state: GameState, enemyId: number): Summon | undefined {
  const enemy = state.enemies.find(item => item.id === enemyId);
  if (!enemy) return undefined;
  const explicit = enemy.status.taunt?.summonId;
  if (explicit != null) return state.summons.find(summon => summon.id === explicit);
  return state.summons
    .filter(summon => (summon.tauntRadius ?? 0) >= Math.hypot(summon.x - enemy.x, summon.y - enemy.y))
    .sort((a, b) => (b.priorityWeight ?? 1) - (a.priorityWeight ?? 1))[0];
}

/** Short-lived combat feedback. It consumes state.vfx but never affects simulation. */
export function drawVfx(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const effect of state.vfx) {
    ctx.save();
    if (effect.kind === 'mortarTarget') {
      ctx.globalAlpha = Math.min(0.75, 0.3 + effect.remaining * 0.2);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (effect.kind === 'mortarImpact') {
      const phase = progress(effect.remaining, 0.35);
      ctx.globalAlpha = Math.max(0, 0.9 - phase * 0.85);
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 5 - phase * 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (0.25 + phase * 0.75), 0, TAU);
      ctx.stroke();
    } else if (effect.kind === 'tauntPulse') {
      const enemy = state.enemies.find(item => item.id === effect.enemyId);
      const summon = pulseTarget(state, effect.enemyId);
      if (enemy && summon) {
        ctx.globalAlpha = Math.min(0.65, effect.remaining / 0.6);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y - enemy.r - 4);
        ctx.lineTo(summon.x, summon.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y - enemy.r - 7, 3 + effect.remaining * 2, 0, TAU);
        ctx.fill();
      }
    } else if (effect.kind === 'summonEvent') {
      const duration = effect.event === 'hit' ? 0.22 : effect.event === 'respawn' ? 0.55 : 0.4;
      const phase = progress(effect.remaining, duration);
      ctx.globalAlpha = Math.max(0, 0.9 - phase * 0.8);
      ctx.strokeStyle = effect.event === 'respawn' ? '#8cecff'
        : effect.event === 'destroyed' ? '#ff9f68' : '#fff3b0';
      ctx.lineWidth = effect.event === 'hit' ? 3 : 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 12 + phase * (effect.event === 'destroyed' ? 38 : 24), 0, TAU);
      ctx.stroke();
    } else if (effect.kind === 'shieldAbsorb') {
      const phase = progress(effect.remaining, 0.25);
      ctx.globalAlpha = Math.max(0, 0.95 * (1 - phase));
      ctx.strokeStyle = '#d9fbff';
      ctx.lineWidth = 5 - phase * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 46 + phase * 9, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.7;
      ctx.strokeStyle = '#8cecff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 42 + phase * 15, 0, TAU);
      ctx.stroke();
    } else if (effect.kind === 'shieldBreak') {
      const phase = progress(effect.remaining, 0.45);
      ctx.strokeStyle = '#8cecff';
      ctx.lineWidth = 6 - phase * 4.5;
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - phase));
      for (let i = 0; i < 3; i++) {
        const offset = i * TAU / 3 + phase * (i % 2 === 0 ? 0.24 : -0.24);
        const arcLength = 0.95 - phase * 0.28;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 46 + phase * 40 + i * 2.5, offset, offset + arcLength);
        ctx.stroke();
      }
    } else if (effect.kind === 'shieldRegen') {
      const phase = progress(effect.remaining, 0.5);
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - phase * 0.55));
      ctx.strokeStyle = phase > 0.65 ? '#d9fbff' : '#8cecff';
      ctx.lineWidth = 2.5 + phase * 2.5;
      ctx.setLineDash([8, Math.max(2, 9 - phase * 6)]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 70 - phase * 24, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (effect.kind === 'thornsReflect') {
      const phase = progress(effect.remaining, 0.35);
      const enemy = state.enemies.find(item => item.id === effect.enemyId);
      // Reflected kills remove their target immediately. enemyId supplies a stable, RNG-free
      // fallback direction so the feedback still reads as an outgoing spike instead of a generic flash.
      const fallbackAngle = (effect.enemyId * 2.399963229728653) % TAU;
      const targetX = enemy?.x ?? effect.x + Math.cos(fallbackAngle) * (58 + phase * 18);
      const targetY = enemy?.y ?? effect.y + Math.sin(fallbackAngle) * (58 + phase * 18);
      const dx = targetX - effect.x;
      const dy = targetY - effect.y;
      const length = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const normalX = -dy / length;
      const normalY = dx / length;
      ctx.globalAlpha = Math.max(0, 0.92 * (1 - phase));
      ctx.strokeStyle = '#ff8ed4';
      ctx.fillStyle = '#ff8ed4';
      ctx.lineWidth = 4 - phase * 2;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.quadraticCurveTo(
        effect.x + dx * 0.5 + normalX * 16,
        effect.y + dy * 0.5 + normalY * 16,
        targetX,
        targetY,
      );
      ctx.stroke();
      drawSpike(ctx, effect.x + dx * 0.58, effect.y + dy * 0.58, angle, 6);
      drawSpike(ctx, effect.x + dx * 0.82, effect.y + dy * 0.82, angle, 7);
      if (!enemy) {
        ctx.globalAlpha *= 0.55;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 12 + phase * 22, 0, TAU);
        ctx.stroke();
      }
    } else if (effect.kind === 'retaliationNova') {
      const phase = progress(effect.remaining, 0.4);
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - phase));
      ctx.strokeStyle = '#ff9de2';
      ctx.lineWidth = 6 - phase * 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (0.25 + phase * 0.75), 0, TAU);
      ctx.stroke();
    } else if (effect.kind === 'breachMitigated') {
      const phase = progress(effect.remaining, 0.3);
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - phase));
      ctx.strokeStyle = '#8cecff';
      ctx.lineWidth = 3 - phase;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 42 - phase * 8, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
