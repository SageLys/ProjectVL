// 效果原子注册表：31 个原子的通用实现。
// 原子只描述「做什么」，由 EffectCtx 决定「何时何地」：
//   - 装备态：触发器载荷（bullet/enemy/drop/merge）进入 ctx；
//   - 消耗态：origin=落点、radius/duration=档位参数、consume=true；
//   - 区域 tick：zoneTick=true + ctx.enemy 逐个结算。
// 纯修饰类原子（掉率乘数/反伤/换形等）在 interpreter.getModifiers 聚合，这里是 no-op。
import { cfg } from '../../config';
import type { Bullet, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng, Zone } from '../types';
import type { AtomName, EffectDef } from './defs';
import {
  applyBrand, applyDot, applyFreeze, applyKnockback, applySlow, applyStun, applyTaunt, applyVulnerable,
} from './statusSystem';
import { dealDamage, tryExecute } from '../systems/damageSystem';
import { spawnGroundDrop } from '../systems/dropSystem';
import { recordCardDropShown, selectUniformCardType } from '../systems/dropTypePolicy';
import { spawnParticle } from '../systems/particleSystem';
import { totalRange } from '../stats';

export interface EffectCtx {
  state: GameState;
  config: Config;
  rng: Rng;
  events: GameEvent[];
  /** 空间锚点：消耗落点 / 命中点 / 击杀点 / 炮台。 */
  origin: { x: number; y: number };
  /** 消耗态档位半径（原子无 radius 参数时的兜底）。 */
  radius?: number;
  /** 消耗态档位时长。 */
  duration?: number;
  star: number;
  /** 伤害基准 = 结算时的炮台总伤。 */
  baseDamage: number;
  /** 消耗态（R4：持续 ≤5s 在此强制）。 */
  consume?: boolean;
  /** 区域周期结算（dot 直接掉血而非叠状态）。 */
  zoneTick?: boolean;
  bullet?: Bullet;
  enemy?: Enemy;
  drop?: GroundDrop;
  merge?: { cardType: CardType; resultStar: number };
}

export type AtomHandler = (ctx: EffectCtx, params: Record<string, unknown>) => void;

const num = (p: Record<string, unknown>, k: string, d: number): number =>
  typeof p[k] === 'number' ? (p[k] as number) : d;
const str = (p: Record<string, unknown>, k: string, d: string): string =>
  typeof p[k] === 'string' ? (p[k] as string) : d;

function enemiesInRadius(state: GameState, x: number, y: number, r: number): Enemy[] {
  return state.enemies.filter(e => Math.hypot(e.x - x, e.y - y) <= r + e.r);
}

/** 目标解析：有敌人载荷 → 单体；否则 origin 半径圈内全部。 */
function targets(ctx: EffectCtx, p: Record<string, unknown>, fallbackRadius = 120): Enemy[] {
  if (ctx.enemy) return [ctx.enemy];
  const r = ctx.radius ?? num(p, 'radius', fallbackRadius);
  return enemiesInRadius(ctx.state, ctx.origin.x, ctx.origin.y, r);
}

function nearestEnemy(state: GameState, x: number, y: number, maxDist: number, exclude?: Set<number>): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (exclude?.has(e.id)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= maxDist && d < bestDist) { best = e; bestDist = d; }
  }
  return best;
}

/** 消耗态持续时长（R4：≤5s）。 */
function cappedDuration(ctx: EffectCtx, want: number): number {
  return ctx.consume ? Math.min(5, want) : want;
}

function makeZone(ctx: EffectCtx, p: Record<string, unknown>, fallbackRadius: number): Zone {
  const zone: Zone = {
    id: ctx.state.nextZoneId++,
    x: ctx.origin.x,
    y: ctx.origin.y,
    radius: num(p, 'radius', ctx.radius ?? fallbackRadius),
    innerRadius: typeof p.innerRadius === 'number' ? (p.innerRadius as number) : undefined,
    shape: str(p, 'shape', 'circle') as Zone['shape'],
    remaining: cappedDuration(ctx, num(p, 'duration', ctx.duration ?? 3)),
    tickInterval: num(p, 'tickInterval', 0.5),
    tickTimer: 0,
    effects: (Array.isArray(p.effects) ? (p.effects as EffectDef[]) : []),
    baseDamage: ctx.baseDamage,
    color: typeof p.color === 'string' ? (p.color as string) : undefined,
  };
  ctx.state.zones.push(zone);
  return zone;
}

/** 连锁放电：从 start 起跳 bounces 次，每跳伤害 ×retention。 */
function chainFrom(ctx: EffectCtx, p: Record<string, unknown>, start: Enemy, initialHit: boolean): void {
  const searchRange = num(p, 'searchRange', 130);
  const retention = num(p, 'damageRetention', 0.7);
  let dmg = ctx.bullet ? ctx.bullet.damage : ctx.baseDamage * num(p, 'damageMul', 1);
  const visited = new Set<number>([start.id]);
  let current = start;
  if (initialHit) ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, start, dmg, 'chain'));
  for (let i = 0; i < num(p, 'bounces', 2); i++) {
    const next = nearestEnemy(ctx.state, current.x, current.y, searchRange, visited);
    if (!next) break;
    dmg *= retention;
    spawnParticle(ctx.state, ctx.rng, (current.x + next.x) / 2, (current.y + next.y) / 2, '#8cecff', 90);
    visited.add(next.id);
    ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, next, dmg, 'chain'));
    current = next;
  }
}

/** 命中点爆炸（aoeOnHit / mortar 落点共用）。 */
function explode(ctx: EffectCtx, x: number, y: number, radius: number, damage: number, falloff: number): void {
  for (const e of enemiesInRadius(ctx.state, x, y, radius)) {
    const d = Math.hypot(e.x - x, e.y - y);
    const mul = 1 - falloff * Math.min(1, d / radius);
    ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, damage * mul));
  }
  for (let i = 0; i < 8; i++) spawnParticle(ctx.state, ctx.rng, x, y, '#ffb347', 130);
}

/** 贯穿光束：沿 origin→方向轴，命中带宽内全部敌人。 */
function beam(ctx: EffectCtx, p: Record<string, unknown>): void {
  const range = totalRange(ctx.state, ctx.config);
  const aim = ctx.enemy ?? nearestEnemy(ctx.state, ctx.origin.x, ctx.origin.y, range);
  if (!aim) return;
  const angle = Math.atan2(aim.y - ctx.origin.y, aim.x - ctx.origin.x);
  ctx.state.turretAngle = angle;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const width = num(p, 'width', 26);
  const dmg = ctx.baseDamage * num(p, 'damageRatio', 1);
  for (const e of [...ctx.state.enemies]) {
    const relX = e.x - ctx.origin.x;
    const relY = e.y - ctx.origin.y;
    const along = relX * dirX + relY * dirY;
    if (along < 0 || along > range) continue;
    const perp = Math.abs(relX * dirY - relY * dirX);
    if (perp <= width / 2 + e.r) ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, dmg));
  }
  for (let i = 0; i < 10; i++) {
    const t = ctx.rng() * range;
    spawnParticle(ctx.state, ctx.rng, ctx.origin.x + dirX * t, ctx.origin.y + dirY * t, '#d8fbff', 40);
  }
}

const noopModifier: AtomHandler = () => {
  // 纯修饰原子：由 interpreter.getModifiers 聚合读取，触发式调用无动作。
};

export const ATOMS: Record<AtomName, AtomHandler> = {
  // —— 弹道 ——
  pierce(ctx, p) {
    if (ctx.bullet) {
      ctx.bullet.pierceLeft = num(p, 'count', 1);
      ctx.bullet.damageRetention = num(p, 'damageRetention', 0.8);
      ctx.bullet.rampPerPierce = num(p, 'rampPerPierce', 0);
      ctx.bullet.hitIds = ctx.bullet.hitIds ?? [];
      return;
    }
    // 消耗态：沿 炮台→落点 轴发射巨型贯穿弹。
    const t = cfg.combat.turret;
    const angle = Math.atan2(ctx.origin.y - t.y, ctx.origin.x - t.x);
    const speed = cfg.combat.bullet.speed;
    ctx.state.bullets.push({
      x: t.x, y: t.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: num(p, 'width', 10),
      life: cfg.combat.bullet.life * 1.6,
      damage: ctx.baseDamage * num(p, 'damageMul', 3),
      pierceLeft: 999,
      damageRetention: num(p, 'damageRetention', 1),
      hitIds: [],
    });
  },
  chain(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'chain', params: p }); return; }
    if (ctx.enemy) { chainFrom(ctx, p, ctx.enemy, !ctx.bullet); return; }
    // 无敌人载荷（interval 3★ / 消耗落点）：取 origin 附近至多 targets 个起点。
    const count = num(p, 'targets', 1);
    const picked = new Set<number>();
    for (let i = 0; i < count; i++) {
      const start = nearestEnemy(ctx.state, ctx.origin.x, ctx.origin.y, ctx.radius ?? totalRange(ctx.state, ctx.config), picked);
      if (!start) break;
      picked.add(start.id);
      chainFrom(ctx, p, start, true);
    }
  },
  split(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'split', params: p }); return; }
    // 命中即触发 onHit（含子弹片自身命中），maxDepth 防止子弹片再分裂形成指数级增殖（默认 1=只裂一代）。
    const depth = ctx.bullet?.splitDepth ?? 0;
    if (depth >= num(p, 'maxDepth', 1)) return;
    const origin = ctx.enemy ? { x: ctx.enemy.x, y: ctx.enemy.y } : ctx.origin;
    const count = num(p, 'count', 2);
    const dmg = (ctx.bullet ? ctx.bullet.damage : ctx.baseDamage) * num(p, 'damageRatio', 0.5);
    for (let i = 0; i < count; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const speed = cfg.combat.bullet.speed * 0.8;
      ctx.state.bullets.push({
        x: origin.x, y: origin.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: cfg.combat.bullet.radius * 0.8,
        life: 0.5,
        damage: dmg,
        kind: 'fragment',
        hitIds: ctx.enemy ? [ctx.enemy.id] : [],
        splitDepth: depth + 1,
      });
    }
  },
  ricochet(ctx, p) {
    if (ctx.bullet) ctx.bullet.ricochetLeft = num(p, 'bounces', 1);
  },
  aoeOnHit(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'aoeOnHit', params: p }); return; }
    const at = ctx.enemy ? { x: ctx.enemy.x, y: ctx.enemy.y } : ctx.origin;
    explode(ctx, at.x, at.y, num(p, 'radius', ctx.radius ?? 70),
      (ctx.bullet ? ctx.bullet.damage : ctx.baseDamage) * num(p, 'damageRatio', 0.6), num(p, 'falloff', 0.5));
  },
  beamMorph(ctx, p) {
    // 装备态换形由 getModifiers 聚合；触发式调用（interval 绑定）= 立即发射一道光束。
    beam(ctx, p);
  },
  mortarMorph(ctx, p) {
    // 装备态换形由 getModifiers 聚合；触发式调用 = 落点即时榴弹爆炸。
    explode(ctx, ctx.origin.x, ctx.origin.y, num(p, 'radius', ctx.radius ?? 90),
      ctx.baseDamage * num(p, 'damageRatio', 1.2), num(p, 'falloff', 0.5));
  },

  // —— 控制 ——
  slow(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'slow', params: p }); return; }
    for (const e of targets(ctx, p)) applySlow(e, num(p, 'ratio', 0.3), num(p, 'duration', 1.5));
  },
  freeze(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'freeze', params: p }); return; }
    const stacks = typeof p.stacksToTrigger === 'number' ? (p.stacksToTrigger as number) : undefined;
    for (const e of targets(ctx, p)) applyFreeze(e, num(p, 'duration', 1), stacks);
  },
  stun(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'stun', params: p }); return; }
    const chance = num(p, 'chance', 1);
    for (const e of targets(ctx, p)) if (ctx.rng() < chance) applyStun(e, num(p, 'duration', 0.5));
  },
  knockback(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'knockback', params: p }); return; }
    const from = ctx.bullet ? { x: ctx.bullet.x, y: ctx.bullet.y } : ctx.origin;
    const collision = num(p, 'collisionDamage', 0);
    for (const e of targets(ctx, p)) {
      if (!applyKnockback(e, from.x, from.y, num(p, 'distance', 60))) continue;
      if (collision > 0) {
        for (const other of ctx.state.enemies) {
          if (other === e) continue;
          if (Math.hypot(other.x - e.x, other.y - e.y) < other.r + e.r) {
            ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, other, ctx.baseDamage * collision));
            ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, ctx.baseDamage * collision));
            break;
          }
        }
      }
    }
  },
  taunt(ctx, p) {
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? 3));
    const summonId = typeof p.summonId === 'number' ? (p.summonId as number) : undefined;
    for (const e of targets(ctx, p, num(p, 'radius', 120))) applyTaunt(e, ctx.origin.x, ctx.origin.y, duration, summonId);
  },
  vulnerable(ctx, p) {
    if (ctx.bullet && !ctx.enemy) { (ctx.bullet.riders ??= []).push({ atom: 'vulnerable', params: p }); return; }
    for (const e of targets(ctx, p)) applyVulnerable(e, num(p, 'ratio', 0.2), num(p, 'duration', 2));
  },

  // —— 领域 ——
  aura(ctx, p) {
    // 装备态常驻光环由 getModifiers 聚合 + runtime 周期脉冲；消耗态 = 落点临时区域。
    if (!ctx.consume && !ctx.zoneTick) return;
    makeZone(ctx, { tickInterval: num(p, 'tickInterval', 0.8), ...p }, 120);
  },
  groundZone(ctx, p) {
    makeZone(ctx, p, 100);
  },
  dot(ctx, p) {
    const tickInterval = num(p, 'tickInterval', 0.5);
    const perTick = typeof p.damageRatio === 'number'
      ? ctx.baseDamage * (p.damageRatio as number)
      : num(p, 'damagePerTick', 5);
    if (ctx.zoneTick && ctx.enemy) {
      // 区域周期结算：每 tick 直接掉血，不叠状态。
      ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, ctx.enemy, perTick));
      return;
    }
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? 2));
    for (const e of targets(ctx, p)) applyDot(e, perTick / tickInterval, duration);
  },
  summon(ctx, p) {
    const kind = str(p, 'kind', 'decoy') as 'decoy' | 'mirrorTurret' | 'orbital';
    const count = num(p, 'count', 1);
    for (let i = 0; i < count; i++) {
      const jitter = count > 1 ? 30 : 0;
      const duration = num(p, 'duration', ctx.duration ?? 4);
      ctx.state.summons.push({
        id: ctx.state.nextSummonId++,
        kind,
        x: ctx.origin.x + (ctx.rng() - 0.5) * jitter,
        y: ctx.origin.y + (ctx.rng() - 0.5) * jitter,
        hp: num(p, 'hp', 40),
        maxHp: num(p, 'hp', 40),
        remaining: cappedDuration(ctx, duration) || undefined,
        tauntRadius: num(p, 'tauntRadius', kind === 'orbital' ? 0 : 140),
        priorityWeight: num(p, 'priorityWeight', 1),
        damageRatio: num(p, 'damageRatio', 0.3),
        fireCd: 0,
        angle: ctx.rng() * Math.PI * 2,
        explodeOnDeath: p.explode
          ? { damage: ctx.baseDamage * num(p, 'explodeDamageMul', 1.5), knockbackDistance: num(p, 'knockbackDistance', 80) }
          : null,
        respawnOnce: p.respawnOnce === true,
        respawned: false,
      });
    }
  },

  // —— 经济 ——
  dropRateMul: noopModifier,
  dropLifetimeMul: noopModifier,
  xpMul: noopModifier,
  extraDrop(ctx, p) {
    const at = str(p, 'at', 'point');
    const base = at === 'turret' ? cfg.combat.turret : ctx.origin;
    const weights = (p.starWeights ?? { '1': 1 }) as Record<string, number>;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < num(p, 'count', 1); i++) {
      let roll = ctx.rng() * total;
      let star = 1;
      for (const [s, w] of Object.entries(weights)) {
        roll -= w;
        if (roll <= 0) { star = Number(s); break; }
      }
      star = Math.min(star, cfg.economy.dropStarPolicy.bountyBossMax);
      const x = base.x + (ctx.rng() - 0.5) * 60;
      const y = base.y + (ctx.rng() - 0.5) * 60;
      const type = selectUniformCardType(ctx.rng);
      spawnGroundDrop(ctx.state, ctx.config, ctx.rng, x, y, type, star, 'skillExtra');
      recordCardDropShown(ctx.state, type, 'skillExtra');
    }
  },
  expiryConvert: noopModifier,
  mergeRule: noopModifier,
  mergePulse(ctx, p) {
    const dmg = num(p, 'damagePerMergeCount', 4) * (ctx.merge?.resultStar ?? 1);
    const t = cfg.combat.turret;
    const all = p.radius === 'all';
    const r = all ? Infinity : num(p, 'radius', 200);
    for (const e of [...ctx.state.enemies]) {
      if (all || Math.hypot(e.x - t.x, e.y - t.y) <= r) {
        ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, dmg));
      }
    }
  },

  // —— 防御 ——
  shield(ctx, p) {
    const hits = num(p, 'absorbHits', 2);
    const regen = typeof p.regenSeconds === 'number' ? (p.regenSeconds as number) : null;
    const cur = ctx.state.shield;
    if (cur && cur.hits >= hits) { cur.regenSeconds = regen ?? cur.regenSeconds; return; }
    ctx.state.shield = { hits, maxHits: hits, regenRemaining: null, regenSeconds: regen };
  },
  thorns: noopModifier,
  breachReduction: noopModifier,
  novaOnBreak: noopModifier,
  execute(ctx, p) {
    const threshold = num(p, 'hpThresholdRatio', 0.15);
    for (const e of targets(ctx, p)) ctx.events.push(...tryExecute(ctx.state, ctx.config, ctx.rng, e, threshold));
  },

  // —— 共用 ——
  burstDamage(ctx, p) {
    const dmg = ctx.baseDamage * num(p, 'damageMul', 3);
    for (const e of targets(ctx, p, num(p, 'radius', ctx.radius ?? 100))) {
      ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, dmg));
    }
    for (let i = 0; i < 10; i++) spawnParticle(ctx.state, ctx.rng, ctx.origin.x, ctx.origin.y, '#ff9de2', 140);
  },
  focusPriority(ctx, p) {
    const weight = num(p, 'priorityWeight', 1);
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? 4));
    // hpThresholdRatio 可选：只标记血量比例低于该阈值的目标（如圣域 5★ 处刑印记：只烙印濒死敌人）。
    const hpThreshold = typeof p.hpThresholdRatio === 'number' ? (p.hpThresholdRatio as number) : null;
    for (const e of targets(ctx, p)) {
      if (hpThreshold != null && e.hp / e.maxHp > hpThreshold) continue;
      applyBrand(e, weight, duration);
    }
  },
};

/** 依序执行一组效果。 */
export function runEffects(ctx: EffectCtx, effects: EffectDef[]): void {
  for (const ef of effects) {
    const handler = ATOMS[ef.atom];
    if (!handler) continue;
    handler(ctx, ef.params ?? {});
  }
}
