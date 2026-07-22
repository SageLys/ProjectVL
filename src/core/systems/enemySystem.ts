import { cfg } from '../../config';
import type { CardType, Config, Enemy, EnemyType, GameEvent, GameState, Rng, Summon } from '../types';
import type { ValidationRewardSpec } from '../../config/types';
import { endGame } from '../endGame';
import { spawnParticle } from './particleSystem';
import { killEnemy } from './damageSystem';
import { emptyStatus, isImmobile, speedMultiplier } from '../effects/statusSystem';
import { absorbBreach } from '../effects/runtime';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { notifyBountyMemberBreached, notifyBountyMemberKilled } from './bountySystem';
import { difficultyMultipliersFor } from '../difficulty';
import { totalRange } from '../stats';

/**
 * 敌人类型判定：roll < tankBase + wave*tankPerWave → 重装；
 * roll < fastThreshold → 高速；否则普通。每个指定 Boss 波的最后一个出怪名额强制生成 Boss。
 */
export function determineType(wave: number, roll: number, _spawnLeft: number): EnemyType {
  const tr = cfg.waves.typeRoll;
  return roll < tr.tankBase + wave * tr.tankPerWave ? 'tank' : roll < tr.fastThreshold ? 'fast' : 'normal';
}

export interface EnemyModifiers {
  hpMul?: number;
  speedMul?: number;
  damageMul?: number;
  bountyEncounterId?: number;
  bountyRewardType?: CardType;
  spawnKind?: Enemy['spawnKind'];
  ccResistOverride?: number;
  knockbackResistOverride?: number;
  validationReward?: ValidationRewardSpec;
}

/** Shared enemy construction path for normal waves and independent Bounty encounters. */
export function createEnemy(
  state: GameState,
  type: EnemyType,
  wave: number,
  position: { x: number; y: number },
  modifiers: EnemyModifiers = {},
): Enemy {
  const def = cfg.enemies.types[type];
  const dm = difficultyMultipliersFor(state.difficultyId, type, wave);
  const hp = (def.hpBase + wave * def.hpPerWave) * dm.hp * (modifiers.hpMul ?? 1);
  const speed = (def.speedBase + wave * def.speedPerWave) * dm.speed * (modifiers.speedMul ?? 1);
  const enemy: Enemy = {
    id: state.nextEnemyId++,
    x: position.x,
    y: position.y,
    type,
    spawnKind: modifiers.spawnKind ?? 'regular',
    label: def.label,
    hp,
    maxHp: hp,
    speed,
    r: def.r,
    color: def.color,
    damage: def.damage * dm.damage * (modifiers.damageMul ?? 1),
    contactDps: def.contactDps === undefined
      ? undefined
      : def.contactDps * dm.damage * (modifiers.damageMul ?? 1),
    xp: def.xp,
    hit: 0,
    status: emptyStatus(),
  };
  const statMods = {
    hpMul: modifiers.hpMul ?? 1,
    speedMul: modifiers.speedMul ?? 1,
    damageMul: modifiers.damageMul ?? 1,
  };
  if (statMods.hpMul !== 1 || statMods.speedMul !== 1 || statMods.damageMul !== 1) enemy.statMods = statMods;
  if (modifiers.bountyEncounterId !== undefined) enemy.bountyEncounterId = modifiers.bountyEncounterId;
  if (modifiers.bountyRewardType !== undefined) enemy.bountyRewardType = modifiers.bountyRewardType;
  if (modifiers.ccResistOverride !== undefined) enemy.ccResistOverride = modifiers.ccResistOverride;
  if (modifiers.knockbackResistOverride !== undefined) enemy.knockbackResistOverride = modifiers.knockbackResistOverride;
  if (modifiers.validationReward !== undefined) enemy.validationReward = { ...modifiers.validationReward };
  return enemy;
}

export type EnemyStatConfigKey = 'hpBase' | 'hpPerWave' | 'speedBase' | 'speedPerWave' | 'damage' | 'r' | 'xp';

/** Recompute a live enemy after DEV tuning while preserving difficulty, encounter modifiers and HP ratio. */
export function resyncEnemyStats(enemy: Enemy, state: GameState, key: EnemyStatConfigKey): void {
  const def = cfg.enemies.types[enemy.type];
  const dm = difficultyMultipliersFor(state.difficultyId, enemy.type, state.wave);
  const ext = enemy.statMods ?? { hpMul: 1, speedMul: 1, damageMul: 1 };
  if (key === 'hpBase' || key === 'hpPerWave') {
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
    enemy.maxHp = (def.hpBase + state.wave * def.hpPerWave) * dm.hp * ext.hpMul;
    enemy.hp = enemy.maxHp * ratio;
  } else if (key === 'speedBase' || key === 'speedPerWave') {
    enemy.speed = (def.speedBase + state.wave * def.speedPerWave) * dm.speed * ext.speedMul;
  } else if (key === 'damage') {
    enemy.damage = def.damage * dm.damage * ext.damageMul;
    if (def.contactDps !== undefined) enemy.contactDps = def.contactDps * dm.damage * ext.damageMul;
  }
  else if (key === 'r') enemy.r = def.r;
  else if (key === 'xp') enemy.xp = def.xp;
}

/** 生成一只敌人：类型判定 → 取基础值+每波成长 → 四边随机出生（边缘外 spawnMargin）。 */
export function randomEdgeSpawnPosition(rng: Rng): { x: number; y: number } {
  const { width, height } = cfg.combat.canvas;
  const side = Math.floor(rng() * 4);
  const margin = cfg.waves.spawnMargin;
  return side === 0 ? { x: 35 + rng() * (width - 70), y: -margin }
    : side === 1 ? { x: width + margin, y: 35 + rng() * (height - 70) }
    : side === 2 ? { x: 35 + rng() * (width - 70), y: height + margin }
    : { x: -margin, y: 35 + rng() * (height - 70) };
}

export function spawnEnemy(state: GameState, rng: Rng): void {
  const roll = rng();
  const type = determineType(state.wave, roll, state.spawnLeft);
  const spawn = randomEdgeSpawnPosition(rng);
  state.enemies.push(createEnemy(state, type, state.wave, spawn));
}

/** Spawn the explicit end-of-wave Boss without consuming the regular quota. */
export function spawnWaveBoss(state: GameState, rng: Rng): Enemy {
  const spawn = randomEdgeSpawnPosition(rng);
  const boss = createEnemy(state, 'boss', state.wave, spawn, { spawnKind: 'waveBoss' });
  boss.bossRuntime = {
    phase: 'approach',
    orbitDirection: boss.id % 2 === 0 ? 1 : -1,
    contactTickRemaining: cfg.enemies.bossBehavior.contactWarmup,
    contactAngle: 0,
  };
  state.enemies.push(boss);
  return boss;
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

function ensureBossRuntime(boss: Enemy): NonNullable<Enemy['bossRuntime']> {
  if (!boss.bossRuntime) {
    boss.bossRuntime = {
      phase: 'approach',
      orbitDirection: boss.id % 2 === 0 ? 1 : -1,
      contactTickRemaining: cfg.enemies.bossBehavior.contactWarmup,
      contactAngle: 0,
    };
  }
  return boss.bossRuntime;
}

function enterBossContact(
  state: GameState,
  config: Config,
  rng: Rng,
  boss: Enemy,
  events: GameEvent[],
): void {
  const runtime = ensureBossRuntime(boss);
  const t = cfg.combat.turret;
  const bb = cfg.enemies.bossBehavior;
  const dx = boss.x - t.x;
  const dy = boss.y - t.y;
  runtime.phase = 'contact';
  runtime.contactAngle = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) : runtime.contactAngle;
  runtime.contactTickRemaining = bb.contactWarmup;
  boss.x = t.x + Math.cos(runtime.contactAngle) * bb.contactDistance;
  boss.y = t.y + Math.sin(runtime.contactAngle) * bb.contactDistance;
  events.push(...fireTrigger(state, config, rng, 'onBreach', {
    enemy: boss,
    damage: 0,
    point: { x: boss.x, y: boss.y },
  }));
  events.push({ type: 'bossContactStarted', enemyId: boss.id });
}

function leaveBossContact(boss: Enemy, events: GameEvent[]): void {
  ensureBossRuntime(boss).phase = 'approach';
  events.push({ type: 'bossContactEnded', enemyId: boss.id });
}

/** Returns true when either combatant died and no more pulses should be resolved. */
function resolveBossContactPulse(
  state: GameState,
  config: Config,
  rng: Rng,
  boss: Enemy,
  events: GameEvent[],
): boolean {
  const interval = cfg.enemies.bossBehavior.contactTickInterval;
  const fallbackDps = (cfg.enemies.types.boss.contactDps ?? 0)
    * difficultyMultipliersFor(state.difficultyId, 'boss', state.wave).damage;
  const pulseDamage = (boss.contactDps ?? fallbackDps) * interval;
  const mods = getModifiers(state);
  if (mods.thornsRatio > 0 && pulseDamage * mods.thornsRatio >= boss.hp) {
    const index = state.enemies.indexOf(boss);
    if (index >= 0) state.enemies.splice(index, 1);
    events.push(...killEnemy(state, config, rng, boss));
    return true;
  }

  const damage = absorbBreach(state, config, rng, pulseDamage, events);
  if (!state.enemies.includes(boss)) return true;
  if (damage != null) {
    state.hp -= damage;
    state.bountyDirector.lastHpLossAt = state.time;
    events.push({ type: 'bossContactDamage', enemyId: boss.id, damage });
  }
  if (state.hp <= 0) {
    events.push(...endGame(state, false));
    return true;
  }
  return false;
}

function tickBossContact(
  state: GameState,
  config: Config,
  rng: Rng,
  boss: Enemy,
  dt: number,
  events: GameEvent[],
): void {
  const runtime = ensureBossRuntime(boss);
  const bb = cfg.enemies.bossBehavior;
  const t = cfg.combat.turret;
  const dx = boss.x - t.x;
  const dy = boss.y - t.y;
  const dist = Math.hypot(dx, dy);
  if (dist > bb.contactExitDistance) {
    leaveBossContact(boss, events);
    return;
  }

  if (dist > 0) runtime.contactAngle = Math.atan2(dy, dx);
  boss.x = t.x + Math.cos(runtime.contactAngle) * bb.contactDistance;
  boss.y = t.y + Math.sin(runtime.contactAngle) * bb.contactDistance;
  if (bb.hardControlPausesDamage && isImmobile(boss)) return;

  runtime.contactTickRemaining -= dt;
  while (runtime.contactTickRemaining <= 0) {
    runtime.contactTickRemaining += bb.contactTickInterval;
    if (resolveBossContactPulse(state, config, rng, boss, events)) return;
  }
}

function moveBossApproach(
  state: GameState,
  config: Config,
  rng: Rng,
  boss: Enemy,
  target: { x: number; y: number; summon: Summon | null },
  dt: number,
  events: GameEvent[],
): void {
  const t = cfg.combat.turret;
  const bb = cfg.enemies.bossBehavior;
  const turretDx = t.x - boss.x;
  const turretDy = t.y - boss.y;
  const turretDist = Math.hypot(turretDx, turretDy);
  if (!target.summon && turretDist <= bb.contactDistance) {
    enterBossContact(state, config, rng, boss, events);
    return;
  }

  const targetDx = target.x - boss.x;
  const targetDy = target.y - boss.y;
  const targetDist = Math.hypot(targetDx, targetDy) || 1;
  let dirX = targetDx / targetDist;
  let dirY = targetDy / targetDist;
  if (!target.summon && !boss.status.taunt) {
    const orbitStart = Math.min(
      totalRange(state, config) * bb.orbitStartRangeRatio,
      bb.orbitStartMaxDistance,
    );
    const curveSpan = orbitStart - bb.contactDistance;
    if (turretDist <= orbitStart && curveSpan > 0 && turretDist > 0) {
      const radialX = turretDx / turretDist;
      const radialY = turretDy / turretDist;
      const progress = Math.max(0, Math.min(1, (turretDist - bb.contactDistance) / curveSpan));
      const curveWeight = Math.sin(Math.PI * progress) * bb.curveStrength;
      const tangentX = -radialY * ensureBossRuntime(boss).orbitDirection;
      const tangentY = radialX * ensureBossRuntime(boss).orbitDirection;
      const mixedX = radialX + tangentX * curveWeight;
      const mixedY = radialY + tangentY * curveWeight;
      const mixedLen = Math.hypot(mixedX, mixedY) || 1;
      dirX = mixedX / mixedLen;
      dirY = mixedY / mixedLen;
    }
  }

  const rawStep = boss.speed * speedMultiplier(boss) * config.enemySpeed * dt;
  const contactGap = turretDist - bb.contactDistance;
  if (!target.summon && !boss.status.taunt && rawStep + 1e-6 >= contactGap) {
    boss.x = t.x - (turretDx / turretDist) * bb.contactDistance;
    boss.y = t.y - (turretDy / turretDist) * bb.contactDistance;
    enterBossContact(state, config, rng, boss, events);
    return;
  }
  boss.x += dirX * rawStep;
  boss.y += dirY * rawStep;

  if (target.summon && Math.hypot(target.x - boss.x, target.y - boss.y) < 16 + boss.r) {
    target.summon.hp -= boss.damage;
    state.vfx.push({
      kind: 'summonEvent', x: target.summon.x, y: target.summon.y,
      event: 'hit', remaining: 0.22,
    });
    for (let k = 0; k < 6; k++) spawnParticle(state, rng, boss.x, boss.y, '#8793a3', 120);
    boss.status.taunt = null;
    return;
  }

  const postDx = boss.x - t.x;
  const postDy = boss.y - t.y;
  const postDist = Math.hypot(postDx, postDy);
  if (!target.summon && postDist <= bb.contactDistance) {
    if (postDist > 0) {
      boss.x = t.x + (postDx / postDist) * bb.contactDistance;
      boss.y = t.y + (postDy / postDist) * bb.contactDistance;
    }
    enterBossContact(state, config, rng, boss, events);
  }
}

function moveWaveBoss(
  state: GameState,
  config: Config,
  rng: Rng,
  boss: Enemy,
  target: { x: number; y: number; summon: Summon | null },
  dt: number,
  events: GameEvent[],
): void {
  boss.hit -= dt;
  if (ensureBossRuntime(boss).phase === 'contact') {
    tickBossContact(state, config, rng, boss, dt, events);
  } else {
    moveBossApproach(state, config, rng, boss, target, dt, events);
  }
}

function isWaveBoss(enemy: Enemy): boolean {
  return enemy.spawnKind === 'waveBoss';
}

/**
 * 推进敌人：向目标移动（状态仲裁后的速度），触及召唤物 → 自爆伤图腾；
 * 触及炮台 → 护盾吸收/减免/反伤 → 扣血、breakthrough 事件、onBreach 触发；HP 归零判负。
 */
export function moveEnemies(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const t = cfg.combat.turret;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const target = moveTargetFor(state, e);
    const targetId = target.summon?.id;
    if (targetId !== e.tauntVfxTargetId) {
      if (targetId != null) state.vfx.push({ kind: 'tauntPulse', enemyId: e.id, remaining: 0.6 });
      e.tauntVfxTargetId = targetId;
    }
    if (isWaveBoss(e)) {
      moveWaveBoss(state, config, rng, e, target, dt, events);
      continue;
    }
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speedMul = speedMultiplier(e) * config.enemySpeed;
    e.x += (dx / len) * e.speed * speedMul * dt;
    e.y += (dy / len) * e.speed * speedMul * dt;
    e.hit -= dt;

    // 撞上嘲讽召唤物：召唤物掉血，敌人消散（刻意不给击杀奖励）；waveBoss 清嘲讽后继续推进。
    if (target.summon && Math.hypot(target.x - e.x, target.y - e.y) < 16 + e.r) {
      target.summon.hp -= e.damage;
      state.vfx.push({
        kind: 'summonEvent', x: target.summon.x, y: target.summon.y,
        event: 'hit', remaining: 0.22,
      });
      for (let k = 0; k < 6; k++) spawnParticle(state, rng, e.x, e.y, '#8793a3', 120);
      if (e.spawnKind === 'waveBoss') {
        e.status.taunt = null;
        continue;
      }
      state.enemies.splice(i, 1);
      if (e.bountyEncounterId !== undefined) events.push(...notifyBountyMemberKilled(state, e, config, rng));
      continue;
    }

    if (Math.hypot(t.x - e.x, t.y - e.y) < cfg.combat.breakthroughDist) {
      if (e.bountyEncounterId !== undefined) events.push(...notifyBountyMemberBreached(state, e));
      const mods = getModifiers(state);
      // 反伤（thorns）：反噬若致死，按击杀结算（有奖励）后不再造成突破。
      if (mods.thornsRatio > 0 && e.damage * mods.thornsRatio >= e.hp) {
        state.enemies.splice(i, 1);
        events.push(...killEnemy(state, config, rng, e));
        continue;
      }
      const damage = absorbBreach(state, config, rng, e.damage, events);
      if (e.spawnKind !== 'waveBoss') state.enemies.splice(i, 1);
      for (let k = 0; k < cfg.combat.vfx.breakthroughParticles; k++) spawnParticle(state, rng, t.x, t.y, '#ff6677', 170);
      if (damage != null) {
        state.hp -= damage;
        state.bountyDirector.lastHpLossAt = state.time;
        events.push({ type: 'breakthrough', damage });
      }
      events.push(...fireTrigger(state, config, rng, 'onBreach', { enemy: e, damage: damage ?? 0, point: { x: e.x, y: e.y } }));
      if (state.hp <= 0) events.push(...endGame(state, false));
    }
  }
  return events;
}
