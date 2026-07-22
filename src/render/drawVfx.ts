import type { GameState, Summon } from '../core/types';

const TAU = Math.PI * 2;

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
      const progress = 1 - Math.min(1, effect.remaining / 0.35);
      ctx.globalAlpha = Math.max(0, 0.9 - progress * 0.85);
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 5 - progress * 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (0.25 + progress * 0.75), 0, TAU);
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
    } else {
      const duration = effect.event === 'hit' ? 0.22 : effect.event === 'respawn' ? 0.55 : 0.4;
      const progress = 1 - Math.min(1, effect.remaining / duration);
      ctx.globalAlpha = Math.max(0, 0.9 - progress * 0.8);
      ctx.strokeStyle = effect.event === 'respawn' ? '#8cecff'
        : effect.event === 'destroyed' ? '#ff9f68' : '#fff3b0';
      ctx.lineWidth = effect.event === 'hit' ? 3 : 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 12 + progress * (effect.event === 'destroyed' ? 38 : 24), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
