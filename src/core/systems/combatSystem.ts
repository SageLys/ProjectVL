import { cfg } from '../../config';
import type {
  AttackDelivery, AttackInstance, BeamEntity, Bullet, Config, Enemy, GameEvent, GameState, Rng, WeaponImpactSpec,
} from '../types';
import { totalDamage, totalFireRate, totalMulti, totalRange } from '../stats';
import { spawnParticle } from './particleSystem';
import { dealDamage, killEnemy, tryExecute } from './damageSystem';
import { composeWeaponForm, fireTrigger, getModifiers } from '../effects/interpreter';
import { damageTakenMultiplier, isControlled } from '../effects/statusSystem';
import { ATOMS, type EffectCtx } from '../effects/registry';
import { controlledDamageTakenBonus } from './buildModifierSystem';
import {
  recordCardImpact, recordCardTrigger, recordFusionSuppression, totalEnemyHp,
} from '../../telemetry/combatCounters';

function equippedCardId(state: GameState, type?: string): number | undefined {
  return type == null ? undefined : state.equipment.find(card => card?.type === type)?.id;
}

/**
 * 统一攻击管线：每次开火/每道光束创建一个 attack；onFire 把 riders 挂到 attack；
 * 所有 delivery 最终进入 resolveImpact。pierce/ricochet 仅属于 projectile 实体弹轨迹，
 * line/lob 下明确 no-op；状态、冲击与分裂 riders 对所有 delivery 生效。
 */
export function beginAttack(
  state: GameState,
  config: Config,
  rng: Rng,
  delivery: AttackDelivery,
  damage: number,
  sourceStar: number,
  impacts: WeaponImpactSpec[] = [],
  bullet?: Bullet,
  sourceCardId?: number,
): { attack: AttackInstance; events: GameEvent[] } {
  const hitIds = bullet?.hitIds ?? [];
  const riders = bullet?.riders ?? [];
  const attack: AttackInstance = {
    attackId: state.nextAttackId++, delivery, damage, baseDamage: totalDamage(state, config),
    riders, hitIds, impacts: impacts.map(impact => ({ ...impact })), sourceStar,
    sourceCardId: sourceCardId ?? bullet?.sourceCardId,
  };
  recordCardTrigger(state, attack.sourceCardId);
  if (bullet) {
    bullet.attack = attack;
    bullet.hitIds = attack.hitIds;
    bullet.riders = attack.riders;
  }
  const events = fireTrigger(state, config, rng, 'onFire', { attack, bullet });
  return { attack, events };
}

/** 索敌：紧急距离内最近 > 活跃 Bounty 成员最近 > 烙印权重降序 > 射程内最近。 */
export function findTarget(state: GameState, config: Config): Enemy | null {
  const range = totalRange(state, config);
  const t = cfg.combat.turret;
  const activeBountyIds = new Set(state.bountyEncounters
    .filter(encounter => encounter.status === 'spawning' || encounter.status === 'active')
    .map(encounter => encounter.id));
  let emergencyBest: Enemy | null = null;
  let emergencyDist = Infinity;
  let bountyBest: Enemy | null = null;
  let bountyDist = Infinity;
  let best: Enemy | null = null;
  let bestWeight = -Infinity;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - t.x, enemy.y - t.y);
    if (dist > range) continue;
    if (dist <= cfg.bounty.encounter.emergencyOverrideDistance && dist < emergencyDist) {
      emergencyBest = enemy;
      emergencyDist = dist;
    }
    if (enemy.bountyEncounterId !== undefined && activeBountyIds.has(enemy.bountyEncounterId) && dist < bountyDist) {
      bountyBest = enemy;
      bountyDist = dist;
    }
    const weight = enemy.status.brand?.weight ?? 0;
    if (weight > bestWeight || (weight === bestWeight && dist < bestDist)) {
      best = enemy;
      bestWeight = weight;
      bestDist = dist;
    }
  }
  return emergencyBest ?? bountyBest ?? best;
}

function runImpactRiders(
  state: GameState, config: Config, rng: Rng, attack: AttackInstance, enemy: Enemy,
  point: { x: number; y: number }, events: GameEvent[], bullet?: Bullet,
): void {
  for (const rider of attack.riders) {
    // 结构轨迹原子不会进入 riders；保留此闸门防 fixture/旧存档手工注入。
    if (attack.delivery !== 'projectile' && (rider.atom === 'pierce' || rider.atom === 'ricochet')) continue;
    const handler = ATOMS[rider.atom];
    if (!handler) continue;
    const ctx: EffectCtx = {
      state, config, rng, events, origin: point, star: attack.sourceStar,
      baseDamage: attack.baseDamage, attack, bullet, enemy,
    };
    const hpBefore = totalEnemyHp(state);
    handler(ctx, rider.params ?? {});
    const attributedDamage = Math.max(0, hpBefore - totalEnemyHp(state));
    recordCardImpact(state, rider.sourceCardId, attributedDamage, 1);
  }
}

function resolveAreaImpact(
  state: GameState, config: Config, rng: Rng, attack: AttackInstance,
  point: { x: number; y: number }, impact: WeaponImpactSpec, events: GameEvent[], bullet?: Bullet,
): void {
  state.vfx.push({ kind: 'mortarImpact', x: point.x, y: point.y, radius: impact.radius, remaining: 0.35 });
  for (const enemy of [...state.enemies]) {
    const distance = Math.hypot(enemy.x - point.x, enemy.y - point.y);
    if (distance > impact.radius + enemy.r) continue;
    const damage = attack.baseDamage * impact.damageRatio
      * (1 - impact.falloff * Math.min(1, distance / impact.radius));
    resolveImpact(
      state, config, rng, attack, enemy, damage, point, events, bullet, false,
      equippedCardId(state, impact.sourceCardType),
    );
  }
  for (let i = 0; i < 10; i++) spawnParticle(state, rng, point.x, point.y, '#ffb347', 140);
}

/**
 * 统一命中：扣血 → riders（致命命中也运行）→ 每 attack/敌人一次 onHit → 形态 impact → execute → death。
 * 已被同一 attack 命中过的敌人后续只承受伤害，用于持续光束 tick 与重叠爆炸去重触发。
 */
export function resolveImpact(
  state: GameState,
  config: Config,
  rng: Rng,
  attack: AttackInstance,
  enemy: Enemy,
  damage: number,
  point: { x: number; y: number },
  events: GameEvent[],
  bullet?: Bullet,
  applyFormImpacts = true,
  damageSourceCardId: number | undefined = attack.sourceCardId,
): boolean {
  if (!state.enemies.includes(enemy)) return enemy.hp <= 0;
  if (attack.hitIds.includes(enemy.id)) {
    const hpBefore = Math.max(0, enemy.hp);
    events.push(...dealDamage(state, config, rng, enemy, damage, 'weapon'));
    recordCardImpact(state, damageSourceCardId, hpBefore - Math.max(0, enemy.hp));
    return enemy.hp <= 0;
  }

  attack.hitIds.push(enemy.id);
  const controlledMul = isControlled(enemy) ? 1 + controlledDamageTakenBonus(state) : 1;
  const hpBefore = Math.max(0, enemy.hp);
  enemy.hp -= damage * damageTakenMultiplier(enemy) * controlledMul;
  recordCardImpact(state, damageSourceCardId, hpBefore - Math.max(0, enemy.hp));
  enemy.hit = 0.08;
  spawnParticle(state, rng, point.x, point.y, '#d8fbff', 50);

  // 不以 hp>0 为门：致命命中仍须展开 split/aoeOnHit，并施加状态/击退 riders。
  runImpactRiders(state, config, rng, attack, enemy, point, events, bullet);
  events.push(...fireTrigger(state, config, rng, 'onHit', { attack, bullet, enemy, point }));

  if (applyFormImpacts) {
    for (const impact of attack.impacts) resolveAreaImpact(state, config, rng, attack, point, impact, events, bullet);
  }

  const mods = getModifiers(state);
  if (mods.executeThreshold > 0 && state.enemies.includes(enemy) && enemy.hp > 0) {
    events.push(...tryExecute(state, config, rng, enemy, mods.executeThreshold));
  }
  if (enemy.hp <= 0 && state.enemies.includes(enemy)) {
    state.enemies.splice(state.enemies.indexOf(enemy), 1);
    events.push(...killEnemy(state, config, rng, enemy, 'weapon'));
  }
  return enemy.hp <= 0;
}

/** 朝目标开火：projectile/lob 走 shotCd；line 由 updateTurret 的独立节奏创建 BeamEntity。 */
export function shoot(state: GameState, config: Config, rng: Rng, target: Enemy): GameEvent[] {
  const events: GameEvent[] = [];
  const t = cfg.combat.turret;
  const B = cfg.combat.bullet;
  const angle = Math.atan2(target.y - t.y, target.x - t.x);
  state.turretAngle = angle;
  const baseDamage = totalDamage(state, config);
  const form = composeWeaponForm(getModifiers(state).weaponForms);

  if (form.delivery === 'lob') {
    const primaryImpact = form.impacts[0];
    const bullet: Bullet = {
      x: t.x + Math.cos(angle) * B.muzzleOffset,
      y: t.y + Math.sin(angle) * B.muzzleOffset,
      vx: Math.cos(angle) * B.speed * 0.6,
      vy: Math.sin(angle) * B.speed * 0.6,
      r: B.radius * 1.6,
      life: 3,
      damage: baseDamage * (primaryImpact?.damageRatio ?? 1),
      kind: 'mortar',
      targetX: target.x,
      targetY: target.y,
      aoeRadius: primaryImpact?.radius ?? 90,
      aoeFalloff: primaryImpact?.falloff ?? 0.5,
      flightProgress: 0,
    };
    const begun = beginAttack(
      state, config, rng, 'lob', bullet.damage, form.sourceStar, form.impacts, bullet,
      equippedCardId(state, form.sourceCardType),
    );
    state.bullets.push(bullet);
    const flightSeconds = Math.hypot(target.x - bullet.x, target.y - bullet.y)
      / Math.max(1, Math.hypot(bullet.vx, bullet.vy));
    state.vfx.push({
      kind: 'mortarTarget', x: target.x, y: target.y,
      radius: bullet.aoeRadius ?? 90, remaining: flightSeconds,
    });
    for (const type of form.suppressedSourceCardTypes) recordFusionSuppression(state, equippedCardId(state, type));
    events.push(...begun.events);
  } else if (form.delivery === 'projectile') {
    const multi = totalMulti(state);
    for (let i = 0; i < multi; i++) {
      const offset = (i - (multi - 1) / 2) * B.spread;
      const bullet: Bullet = {
        x: t.x + Math.cos(angle) * B.muzzleOffset,
        y: t.y + Math.sin(angle) * B.muzzleOffset,
        vx: Math.cos(angle + offset) * B.speed,
        vy: Math.sin(angle + offset) * B.speed,
        r: B.radius,
        life: B.life,
        damage: baseDamage,
      };
      const begun = beginAttack(state, config, rng, 'projectile', bullet.damage, 0, [], bullet);
      state.bullets.push(bullet);
      events.push(...begun.events);
    }
  }
  for (let i = 0; i < cfg.combat.vfx.shootParticles; i++) {
    spawnParticle(state, rng, t.x + Math.cos(angle) * 26, t.y + Math.sin(angle) * 26, '#8cecff', 55);
  }
  return events;
}

function tickBeam(state: GameState, config: Config, rng: Rng, beam: BeamEntity, events: GameEvent[]): void {
  beam.angle = state.turretAngle; // 每 tick 跟随当前瞄准，形成横扫。
  const dirX = Math.cos(beam.angle);
  const dirY = Math.sin(beam.angle);
  const t = cfg.combat.turret;
  for (const enemy of [...state.enemies]) {
    const relX = enemy.x - t.x;
    const relY = enemy.y - t.y;
    const along = relX * dirX + relY * dirY;
    if (along < 0 || along > beam.range) continue;
    const perpendicular = Math.abs(relX * dirY - relY * dirX);
    if (perpendicular > beam.width / 2 + enemy.r) continue;
    resolveImpact(state, config, rng, beam, enemy, beam.damagePerTick,
      { x: enemy.x, y: enemy.y }, events);
  }
}

/** 推进当前所有持续光束；duration 内按固定 tickInterval 结算，结束后移除。 */
export function updateBeams(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.beams.length - 1; i >= 0; i--) {
    const beam = state.beams[i];
    const activeDt = Math.min(Math.max(0, dt), Math.max(0, beam.remaining));
    beam.remaining -= dt;
    beam.tickTimer -= activeDt;
    while (beam.tickTimer <= 1e-9 && activeDt > 0) {
      tickBeam(state, config, rng, beam, events);
      beam.tickTimer += beam.tickInterval;
    }
    if (beam.remaining <= 0) state.beams.splice(i, 1);
  }
  return events;
}

/** 转向 + 主炮节奏分派；line 使用自身 interval/duration，其他 delivery 使用 shotCd。 */
export function updateTurret(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const t = cfg.combat.turret;
  state.shotCd -= dt;
  let target = findTarget(state, config);
  if (target) state.turretAngle = Math.atan2(target.y - t.y, target.x - t.x);
  // 先更新当前瞄准，再让存量光束 tick，确保横扫角度使用本帧目标。
  const events = updateBeams(state, config, rng, dt);
  if (target && !state.enemies.includes(target)) {
    target = findTarget(state, config);
    if (target) state.turretAngle = Math.atan2(target.y - t.y, target.x - t.x);
  }

  const form = composeWeaponForm(getModifiers(state).weaponForms);
  if (form.delivery === 'line') {
    const key = 'weapon:line';
    const clock = (state.intervalClocks[key] ?? form.interval) - dt;
    if (target && clock <= 0) {
      const duration = Math.max(form.tickInterval, form.duration);
      const tickCount = Math.max(1, Math.round(duration / form.tickInterval));
      const damagePerTick = totalDamage(state, config) * form.deliveryDamageRatio / tickCount;
      const begun = beginAttack(
        state, config, rng, 'line', damagePerTick, form.sourceStar, form.impacts, undefined,
        equippedCardId(state, form.sourceCardType),
      );
      const beam: BeamEntity = {
        ...begun.attack,
        angle: state.turretAngle,
        width: form.width,
        range: totalRange(state, config),
        remaining: duration,
        duration,
        tickTimer: form.tickInterval,
        tickInterval: form.tickInterval,
        damagePerTick,
      };
      state.beams.push(beam);
      for (const type of form.suppressedSourceCardTypes) recordFusionSuppression(state, equippedCardId(state, type));
      events.push(...begun.events);
      state.intervalClocks[key] = form.interval;
    } else {
      state.intervalClocks[key] = Math.max(clock, 0);
    }
    return events;
  }

  if (target && state.shotCd <= 0) {
    events.push(...shoot(state, config, rng, target));
    state.shotCd = 1 / totalFireRate(state, config);
  }
  return events;
}

function ensureBulletAttack(state: GameState, config: Config, rng: Rng, bullet: Bullet, events: GameEvent[]): AttackInstance {
  if (bullet.attack) return bullet.attack;
  const begun = beginAttack(state, config, rng, 'projectile', bullet.damage, 0, [], bullet, bullet.sourceCardId);
  if (bullet.pendingOnFire) events.push(...begun.events);
  bullet.pendingOnFire = false;
  return begun.attack;
}

/** 榴弹落点按融合后的 impact 列表结算，每个圈内敌人均进入 resolveImpact。 */
function explodeMortar(state: GameState, config: Config, rng: Rng, bullet: Bullet, events: GameEvent[]): void {
  const attack = ensureBulletAttack(state, config, rng, bullet, events);
  const point = { x: bullet.x, y: bullet.y };
  const impacts = attack.impacts.length ? attack.impacts : [{
    kind: 'aoe' as const, sourceCardType: 'legacyMortar', sourceStar: attack.sourceStar,
    sourceCardId: attack.sourceCardId,
    damageRatio: bullet.damage / Math.max(1e-9, attack.baseDamage),
    radius: bullet.aoeRadius ?? 90, falloff: bullet.aoeFalloff ?? 0.5,
  }];
  for (const impact of impacts) resolveAreaImpact(state, config, rng, attack, point, impact, events, bullet);
}

/** 推进子弹：普通弹/分裂片命中与榴弹爆炸最终都进入统一 resolveImpact。 */
export function updateBullets(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const { width, height } = cfg.combat.canvas;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    const attack = ensureBulletAttack(state, config, rng, bullet, events);

    if (bullet.kind === 'mortar' && bullet.targetX != null && bullet.targetY != null) {
      const dx = bullet.targetX - bullet.x;
      const dy = bullet.targetY - bullet.y;
      const remainingDistance = Math.hypot(dx, dy);
      const travelDistance = Math.hypot(bullet.vx, bullet.vy) * dt;
      const passedTarget = dx * bullet.vx + dy * bullet.vy <= 0;
      bullet.life -= dt;
      if (passedTarget || travelDistance >= remainingDistance || bullet.life <= 0) {
        // 夹取到真实落点，避免大 dt 跨过目标后永不满足像素距离阈值。
        bullet.x = bullet.targetX;
        bullet.y = bullet.targetY;
        explodeMortar(state, config, rng, bullet, events);
        state.bullets.splice(i, 1);
      } else {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        const totalDistance = Math.hypot((bullet.targetX ?? bullet.x) - cfg.combat.turret.x,
          (bullet.targetY ?? bullet.y) - cfg.combat.turret.y);
        bullet.flightProgress = Math.min(1, Math.max(
          0, 1 - Math.max(0, remainingDistance - travelDistance) / Math.max(1, totalDistance),
        ));
      }
      continue;
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.ricochetLeft && bullet.ricochetLeft > 0) {
      if ((bullet.x < 0 && bullet.vx < 0) || (bullet.x > width && bullet.vx > 0)) { bullet.vx = -bullet.vx; bullet.ricochetLeft--; }
      if ((bullet.y < 0 && bullet.vy < 0) || (bullet.y > height && bullet.vy > 0)) { bullet.vy = -bullet.vy; bullet.ricochetLeft--; }
    }

    let consumed = false;
    for (const enemy of [...state.enemies]) {
      if (attack.hitIds.includes(enemy.id)) continue;
      if ((bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2 >= (bullet.r + enemy.r) ** 2) continue;
      resolveImpact(state, config, rng, attack, enemy, bullet.damage,
        { x: bullet.x, y: bullet.y }, events, bullet);
      if (bullet.pierceLeft && bullet.pierceLeft > 0) {
        bullet.pierceLeft--;
        bullet.damage *= (bullet.damageRetention ?? 0.8) * (1 + (bullet.rampPerPierce ?? 0));
        attack.damage = bullet.damage;
        continue;
      }
      consumed = true;
      break;
    }
    if (consumed || bullet.life <= 0 || bullet.x < -20 || bullet.x > width + 20 || bullet.y < -20 || bullet.y > height + 20) {
      state.bullets.splice(i, 1);
    }
  }
  return events;
}
