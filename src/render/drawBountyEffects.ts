import { cfg } from '../config';
import type { BountyEncounter, GameState } from '../core/types';
import { resolveCardVisual } from '../presentation/cardVisual';
import { glyphGeometry, traceGeometryToCanvas } from '../presentation/skillGeometry';

const TAU = Math.PI * 2;

function drawSpawnWarning(ctx: CanvasRenderingContext2D, encounter: BountyEncounter): void {
  const visual = resolveCardVisual(encounter.rewardCardType);
  const { width, height } = cfg.combat.canvas;
  const half = cfg.bounty.encounter.spawnSpread / 2;
  ctx.save();
  ctx.strokeStyle = visual.accent;
  ctx.shadowColor = visual.accent;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (encounter.side === 'top' || encounter.side === 'bottom') {
    const y = encounter.side === 'top' ? 4 : height - 4;
    ctx.moveTo(Math.max(4, encounter.lastKillX - half), y);
    ctx.lineTo(Math.min(width - 4, encounter.lastKillX + half), y);
  } else {
    const x = encounter.side === 'left' ? 4 : width - 4;
    ctx.moveTo(x, Math.max(4, encounter.lastKillY - half));
    ctx.lineTo(x, Math.min(height - 4, encounter.lastKillY + half));
  }
  ctx.stroke();
  ctx.restore();
}

/** Bounty-only overlay: pulsing reward-colored halo, shared crosshair badge, and spawn warning edge. */
export function drawBountyEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const encounter of state.bountyEncounters) {
    if (encounter.status === 'spawning') drawSpawnWarning(ctx, encounter);
  }
  for (const enemy of state.enemies) {
    if (!enemy.bountyRewardType) continue;
    const visual = resolveCardVisual(enemy.bountyRewardType);
    const pulse = (Math.sin(state.time * cfg.bounty.visual.enemyPulseSpeed + enemy.id * 0.7) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = visual.accent;
    ctx.shadowColor = visual.accent;
    ctx.shadowBlur = 8 + pulse * 9;
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.lineWidth = 2 + pulse;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.r + cfg.bounty.visual.enemyGlowRadius + pulse * 3, 0, TAU);
    ctx.stroke();

    ctx.translate(enemy.x, enemy.y - enemy.r - 17);
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(5,13,24,.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    traceGeometryToCanvas(ctx, glyphGeometry('crosshair'), 13);
    ctx.stroke();
    ctx.restore();
  }
}
