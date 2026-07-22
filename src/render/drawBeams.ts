import { cfg } from '../config';
import type { GameState } from '../core/types';

/** Runtime beam geometry is rendered above enemies so damage never feels invisible. */
export function drawBeams(ctx: CanvasRenderingContext2D, state: GameState): void {
  const turret = cfg.combat.turret;
  for (const beam of state.beams) {
    const alpha = Math.max(0, Math.min(1, beam.remaining / Math.max(0.001, beam.duration)));
    const endX = turret.x + Math.cos(beam.angle) * beam.range;
    const endY = turret.y + Math.sin(beam.angle) * beam.range;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.16 + alpha * 0.34;
    ctx.strokeStyle = '#70ecff';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#70ecff';
    ctx.lineWidth = beam.width;
    ctx.beginPath();
    ctx.moveTo(turret.x, turret.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.globalAlpha = 0.55 + alpha * 0.4;
    ctx.strokeStyle = '#efffff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = Math.max(2, beam.width * 0.16);
    ctx.stroke();
    ctx.restore();
  }
}
