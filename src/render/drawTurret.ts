import { gameConfig } from '../data';
import type { GameState } from '../core/types';

const TAU = Math.PI * 2;
const T = gameConfig.turret;

/** 中央清醒炮台：本体 + 恶魔角 + ♥，并按 turretAngle 旋转炮管。 */
export function drawTurret(ctx: CanvasRenderingContext2D, state: GameState): void {
  const a = state.turretAngle;
  ctx.save();
  ctx.translate(T.x, T.y);
  ctx.fillStyle = '#241a3d';
  ctx.strokeStyle = '#d59bff';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(197,138,255,.65)';
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff8ed4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-19, -21);
  ctx.quadraticCurveTo(-31, -38, -9, -30);
  ctx.moveTo(19, -21);
  ctx.quadraticCurveTo(31, -38, 9, -30);
  ctx.stroke();
  ctx.fillStyle = '#ff8ed4';
  ctx.font = 'bold 15px Microsoft YaHei';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♥', 0, 1);
  ctx.rotate(a);
  ctx.fillStyle = '#68e8fa';
  ctx.fillRect(3, -7, 42, 14);
  ctx.fillStyle = '#d9fbff';
  ctx.fillRect(34, -4, 18, 8);
  ctx.restore();
  ctx.shadowBlur = 0;
}
