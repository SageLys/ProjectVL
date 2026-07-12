import { cfg } from '../config';
import type { Enemy, GameEvent, GameState } from '../core/types';
import { emptyStatus } from '../core/effects/statusSystem';

/** DEV/浏览器测试专用：在指定画布坐标生成一只确定性的 offered Bounty。 */
export function offerDebugBounty(state: GameState, x: number, y: number): GameEvent[] {
  if (state.mode !== 'playing' || state.paused) return [];
  const def = cfg.enemies.types.normal;
  const wave = Math.max(1, state.wave);
  const hp = def.hpBase + wave * def.hpPerWave;
  const enemy: Enemy = {
    id: state.nextEnemyId++,
    x,
    y,
    type: 'normal',
    label: def.label,
    hp,
    maxHp: hp,
    speed: def.speedBase + wave * def.speedPerWave,
    r: def.r,
    color: def.color,
    damage: def.damage,
    xp: def.xp,
    hit: 0,
    status: emptyStatus(),
    bounty: { phase: 'offered', remaining: cfg.skills.mechanisms.bounty.markWindowSeconds },
  };
  state.enemies.push(enemy);
  state.bountyOffered++;
  return [{ type: 'bountyOffered', enemyId: enemy.id, windowSeconds: cfg.skills.mechanisms.bounty.markWindowSeconds }];
}
