import { cfg } from '../../config';
import type { Config, Enemy, EnemyType, GameEvent, GameState, Rng, Summon } from '../types';
import { endGame } from '../endGame';
import { spawnParticle } from './particleSystem';
import { killEnemy } from './damageSystem';
import { emptyStatus, speedMultiplier } from '../effects/statusSystem';
import { absorbBreach } from '../effects/runtime';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { offerPendingBounty, settleRemovedBounty, tickBountyOffers } from './bountySystem';

/**
 * 敌人类型判定：roll < tankBase + wave*tankPerWave → 重装；
 * roll < fastThreshold → 高速；否则普通。第 bossWave 波最后一只强制 boss。
 */
export function determineType(wave: number, roll: number, spawnLeft: number): EnemyType {
  const tr = cfg.waves.typeRoll;
  let type: EnemyType = roll < tr.tankBase + wave * tr.tankPerWave ? 'tank' : roll < tr.fastThreshold ? 'fast' : 'normal';
  if (wave === cfg.waves.bossWave && spawnLeft === 1) type = 'boss';
  return type;
}

/** 生成一只敌人：类型判定 → 取基础值+每波成长 → 四边随机出生（边缘外 spawnMargin）。 */
export function spawnEnemy(state: GameState, rng: Rng): GameEvent[] {
  const roll = rng();
  const rolledType = determineType(state.wave, roll, state.spawnLeft);
  // 命中本波 bounty 时强制由下一只非 Boss 槽位生成普通载体，保证每次判定都有可读的 opt-in 目标。
  const type = state.bountyWavePending && rolledType !== 'boss' ? 'normal' : rolledType;
  const def = cfg.enemies.types[type];
  const { width, height } = cfg.combat.canvas;
  const hp = def.hpBase + state.wave * def.hpPerWave;
  const speed = def.speedBase + state.wave * def.speedPerWave;
  const side = Math.floor(rng() * 4);
  const margin = cfg.waves.spawnMargin;
  const spawn = side === 0 ? { x: 35 + rng() * (width - 70), y: -margin }
    : side === 1 ? { x: width + margin, y: 35 + rng() * (height - 70) }
    : side === 2 ? { x: 35 + rng() * (width - 70), y: height + margin }
    : { x: -margin, y: 35 + rng() * (height - 70) };
  const enemy: Enemy = {
    id: state.nextEnemyId++,
    x: spawn.x, y: spawn.y, type, label: def.label,
    hp, maxHp: hp, speed, r: def.r, color: def.color, damage: def.damage, xp: def.xp, hit: 0,
    status: emptyStatus(),
  };
  state.enemies.push(enemy);
  return offerPendingBounty(state, enemy);
}

/** 移动目标解析（仲裁规则 6）：嘲讽（点/召唤物）> 嘲讽半径内的召唤物 > 炮台。 */
function moveTargetFor(state: GameState, e: Enemy): { x: number; y: number; summon: Summon | null } {
  if (e.status.taunt) {
    const summon = e.status.taunt.summonId != null
      ? state.summons.find(s => s.id === e.status.taunt!.summonId) ?? null
      : null;
    if (summon) return { x: summon.x, y: summon.y, summon };
    return { x: e.status.taunt.x, y: e.status.taunt.y, summon: null };
  }
  let best: Summon | null = null;
  let bestWeight = 0;
  for (const s of state.summons) {
    if (!s.tauntRadius || s.tauntRadius <= 0) continue;
    if (Math.hypot(s.x - e.x, s.y - e.y) > s.tauntRadius) continue;
    const w = s.priorityWeight ?? 1;
    if (w > bestWeight) { best = s; bestWeight = w; }
  }
  if (best) return { x: best.x, y: best.y, summon: best };
  return { x: cfg.combat.turret.x, y: cfg.combat.turret.y, summon: null };
}

/**
 * 推进敌人：向目标移动（状态仲裁后的速度），触及召唤物 → 自爆伤图腾；
 * 触及炮台 → 护盾吸收/减免/反伤 → 扣血、breakthrough 事件、onBreach 触发；HP 归零判负。
 */
export function moveEnemies(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = tickBountyOffers(state, dt);
  const t = cfg.combat.turret;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const target = moveTargetFor(state, e);
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speedMul = speedMultiplier(e) * config.enemySpeed;
    e.x += (dx / len) * e.speed * speedMul * dt;
    e.y += (dy / len) * e.speed * speedMul * dt;
    e.hit -= dt;

    // 撞上嘲讽召唤物：召唤物掉血，敌人消散（不给击杀奖励）。
    if (target.summon && Math.hypot(target.x - e.x, target.y - e.y) < 16 + e.r) {
      target.summon.hp -= e.damage;
      for (let k = 0; k < 6; k++) spawnParticle(state, rng, e.x, e.y, e.color, 120);
      state.enemies.splice(i, 1);
      events.push(...settleRemovedBounty(state, e, 'summon'));
      continue;
    }

    if (Math.hypot(t.x - e.x, t.y - e.y) < cfg.combat.breakthroughDist) {
      const mods = getModifiers(state);
      // 反伤（thorns）：反噬若致死，按击杀结算（有奖励）后不再造成突破。
      if (mods.thornsRatio > 0 && e.damage * mods.thornsRatio >= e.hp) {
        state.enemies.splice(i, 1);
        events.push(...killEnemy(state, config, rng, e));
        continue;
      }
      const damage = absorbBreach(state, config, rng, e.damage, events);
      state.enemies.splice(i, 1);
      events.push(...settleRemovedBounty(state, e, 'breach'));
      for (let k = 0; k < cfg.combat.vfx.breakthroughParticles; k++) spawnParticle(state, rng, t.x, t.y, '#ff6677', 170);
      if (damage != null) {
        state.hp -= damage;
        events.push({ type: 'breakthrough', damage });
      }
      events.push(...fireTrigger(state, config, rng, 'onBreach', { enemy: e, damage: damage ?? 0, point: { x: e.x, y: e.y } }));
      if (state.hp <= 0) events.push(...endGame(state, false));
    }
  }
  return events;
}
