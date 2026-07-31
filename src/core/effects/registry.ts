// 效果原子注册表：34 个原子的通用实现。
// 原子只描述「做什么」，由 EffectCtx 决定「何时何地」：
//   - 装备态：触发器载荷（bullet/enemy/drop/merge）进入 ctx；
//   - 消耗态：origin=落点、radius/duration=档位参数、consume=true；
//   - 区域 tick：zoneTick=true + ctx.enemy 逐个结算。
// 纯修饰类原子（掉率乘数/反伤/换形等）在 interpreter.getModifiers 聚合，这里是 no-op。
import { cfg } from '../../config';
import type { AttackInstance, AttackRider, Bullet, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng, Summon, Zone } from '../types';
import type { AtomicEffectDef, AtomName, EffectDef, ForEachEffectDef, OriginSelector, ScaleByDef, Trigger } from './defs';
import {
  atomBooleanDefault, atomNumberDefault, atomRecordDefault, atomStringDefault, effectParams,
  type AtomDefaultOptions,
} from './atomContract';
import {
  applyBrand, applyDot, applyFreeze, applyKnockback, applySlow, applyStun, applyTaunt, applyVulnerable,
  controlBudgetDenies, isControlled,
} from './statusSystem';
import { dealDamage, tryExecute } from '../systems/damageSystem';
import { spawnGroundDrop } from '../systems/dropSystem';
import { recordCardDropShown, selectUniformCardType } from '../systems/dropTypePolicy';
import { spawnParticle } from '../systems/particleSystem';
import { reconcileMaxHp, totalRange } from '../stats';
import { resolveCardVisual } from '../../presentation/cardVisual';

export interface EffectCtx {
  state: GameState;
  config: Config;
  rng: Rng;
  events: GameEvent[];
  /** 空间锚点：消耗落点 / 命中点 / 击杀点 / 炮台。 */
  origin: { x: number; y: number };
  /** 触发器原始 point 载荷；用于区分“有载荷命中点”与普通 origin。 */
  triggerPoint?: { x: number; y: number };
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
  attack?: AttackInstance;
  /** 装备态绑定来源；存在时 summon 按(卡,绑定)维持单实例。 */
  sourceCardId?: number;
  /** Semantic source used by presentation entities to inherit the skill accent. */
  sourceCardType?: CardType;
  sourceBindingIndex?: number;
  sourceEffectIndex?: number;
  bullet?: Bullet;
  enemy?: Enemy;
  /** Event/member subject retained for scaleBy when spatial `at` clears direct targeting. */
  scaleEnemy?: Enemy;
  drop?: GroundDrop;
  merge?: { cardType: CardType; resultStar: number };
  /** Snapshot supplied by the interpreter so scaleBy never reaches back into card arbitration. */
  dynamic?: { thornsRatio: number; auraReduction: number };
  trigger?: Trigger;
  eventDamage?: number;
  eventSource?: string;
}

export type AtomHandler = (ctx: EffectCtx, params: Record<string, unknown>) => void;

const num = (p: Record<string, unknown>, k: string, d: number): number =>
  typeof p[k] === 'number' ? (p[k] as number) : d;
const str = (p: Record<string, unknown>, k: string, d: string): string =>
  typeof p[k] === 'string' ? (p[k] as string) : d;

// 兜底值一律取自 ATOM_CONTRACT——本文件不得再出现内联默认值字面量。
const cNum = (atom: AtomName, p: Record<string, unknown>, k: string, o?: AtomDefaultOptions): number =>
  num(p, k, atomNumberDefault(atom, k, o));
const cStr = (atom: AtomName, p: Record<string, unknown>, k: string, o?: AtomDefaultOptions): string =>
  str(p, k, atomStringDefault(atom, k, o));
const cBool = (atom: AtomName, p: Record<string, unknown>, k: string): boolean =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : atomBooleanDefault(atom, k);

// 非契约常量：不属于任何原子参数，只描述消耗态贯穿弹这一条实现路径的固有形态。
const PIERCE_CONSUME_LIFE_MUL = 1.6;
const PIERCE_CONSUME_LIMIT = 999;
/** 非契约常量：多只召唤物同时落地时的散布，避免重叠。 */
const SUMMON_GROUP_JITTER = 30;
/** 非契约常量：额外掉落的落点散布，避免堆叠在同一像素。 */
const EXTRA_DROP_SCATTER = 60;
/** line 沿用 radius 作为单一尺寸轴：长度 2r、宽度 r，避免新增未定标参数。 */
const LINE_ZONE_LENGTH_MUL = 2;
const LINE_ZONE_WIDTH_MUL = 1;

function enemiesInRadius(state: GameState, x: number, y: number, r: number): Enemy[] {
  return state.enemies.filter(e => Math.hypot(e.x - x, e.y - y) <= r + e.r);
}

/** 目标解析：有敌人载荷 → 单体；否则 origin 半径圈内全部（ctx.radius 档位优先于 params.radius）。 */
function targets(ctx: EffectCtx, atom: AtomName, p: Record<string, unknown>): Enemy[] {
  if (ctx.enemy) return [ctx.enemy];
  const r = ctx.radius ?? cNum(atom, p, 'radius');
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

const clusterCache = new WeakMap<GameState, { time: number; point: { x: number; y: number } }>();

/** T1: deterministic 8×6 density grid, cached once for a state/time frame. */
function densestCluster(state: GameState): { x: number; y: number } {
  const cached = clusterCache.get(state);
  if (cached?.time === state.time) return cached.point;
  const { width, height } = cfg.combat.canvas;
  const cols = 8;
  const rows = 6;
  const cells = Array.from({ length: cols * rows }, () => ({ count: 0, x: 0, y: 0 }));
  for (const enemy of state.enemies) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor(enemy.x / width * cols)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(enemy.y / height * rows)));
    const cell = cells[row * cols + col];
    cell.count++;
    cell.x += enemy.x;
    cell.y += enemy.y;
  }
  const turret = cfg.combat.turret;
  let best = -1;
  let bestCount = -1;
  let bestDistance = Infinity;
  cells.forEach((cell, index) => {
    if (!cell.count) return;
    const x = cell.x / cell.count;
    const y = cell.y / cell.count;
    const distance = Math.hypot(x - turret.x, y - turret.y);
    if (cell.count > bestCount || (cell.count === bestCount && distance < bestDistance)) {
      best = index;
      bestCount = cell.count;
      bestDistance = distance;
    }
  });
  const cell = best >= 0 ? cells[best] : null;
  const point = cell ? { x: cell.x / cell.count, y: cell.y / cell.count } : { x: turret.x, y: turret.y };
  clusterCache.set(state, { time: state.time, point });
  return point;
}

export function selectEffectOrigin(ctx: EffectCtx, at: OriginSelector | undefined): { x: number; y: number } {
  if (!at) return ctx.origin;
  if (at === 'turret') return { x: cfg.combat.turret.x, y: cfg.combat.turret.y };
  if (at === 'point') return ctx.triggerPoint ?? ctx.origin;
  if (at === 'densestCluster') return densestCluster(ctx.state);
  const anchor = at === 'nearestToBreachLine' ? cfg.combat.turret : ctx.origin;
  const enemy = nearestEnemy(ctx.state, anchor.x, anchor.y, Infinity);
  return enemy ? { x: enemy.x, y: enemy.y } : ctx.origin;
}

function hasStatus(enemy: Enemy, status: string): boolean {
  switch (status) {
    case 'controlled': return isControlled(enemy);
    case 'frozen': return enemy.status.frozen > 0;
    case 'slow': return enemy.status.slow !== null;
    case 'stun': case 'stunned': return enemy.status.stunned > 0;
    case 'vulnerable': return enemy.status.vulnerable !== null;
    case 'dot': return enemy.status.dots.length > 0;
    case 'brand': return enemy.status.brand !== null;
    default: return false;
  }
}

function scaleUnits(ctx: EffectCtx, scale: ScaleByDef): number {
  const source = scale.source;
  if (source.startsWith('concurrentStatus:')) {
    const status = source.slice('concurrentStatus:'.length);
    return ctx.state.enemies.filter(enemy => hasStatus(enemy, status)).length;
  }
  switch (source) {
    case 'statusStacks': return (ctx.scaleEnemy ?? ctx.enemy)?.status.freezeStacks ?? 0;
    case 'shieldTier': return ctx.state.shield?.hits ?? 0;
    case 'thornsRatio': return ctx.dynamic?.thornsRatio ?? 0;
    case 'auraReduction': return ctx.dynamic?.auraReduction ?? 0;
    case 'enemiesOnField': return ctx.state.enemies.length;
    case 'enemiesInAura': {
      const radius = ctx.radius ?? totalRange(ctx.state, ctx.config);
      return enemiesInRadius(ctx.state, ctx.origin.x, ctx.origin.y, radius).length;
    }
    case 'controlledInAura': {
      const radius = ctx.radius ?? totalRange(ctx.state, ctx.config);
      return enemiesInRadius(ctx.state, ctx.origin.x, ctx.origin.y, radius).filter(isControlled).length;
    }
    case 'secondsSinceLastBreach': return Math.max(0, ctx.state.time - ctx.state.effectRuntime.lastBreachAt);
    case 'killsSinceLastRelease': return Math.max(0, ctx.state.kills - ctx.state.effectRuntime.killsAtLastRelease);
    case 'mergesThisRun': return ctx.state.merges;
    case 'pickupsThisWave': return ctx.state.effectRuntime.pickupsThisWave;
    case 'summonsAlive': return ctx.state.summons.length;
  }
  return 0;
}

function scaledParams(ctx: EffectCtx, effect: AtomicEffectDef): Record<string, unknown> {
  const params = effectParams(effect);
  if (!effect.scaleBy) return params;
  const base = params[effect.scaleBy.param];
  if (typeof base !== 'number') return params;
  const units = Math.min(effect.scaleBy.cap, scaleUnits(ctx, effect.scaleBy));
  return { ...params, [effect.scaleBy.param]: base + units * effect.scaleBy.perUnit };
}

function forEachMembers(ctx: EffectCtx, effect: ForEachEffectDef): Array<{ x: number; y: number; enemy?: Enemy }> {
  const set = effect.forEach.set;
  let members: Array<{ x: number; y: number; enemy?: Enemy }> = [];
  if (set.kind === 'enemiesWithStatus') {
    const statuses = Array.isArray(set.status) ? set.status : [set.status];
    members = ctx.state.enemies.filter(enemy => statuses.every(status => hasStatus(enemy, status)))
      .map(enemy => ({ x: enemy.x, y: enemy.y, enemy }));
  } else if (set.kind === 'enemiesWithoutStatus') {
    members = ctx.state.enemies.filter(enemy => !hasStatus(enemy, set.status))
      .map(enemy => ({ x: enemy.x, y: enemy.y, enemy }));
  } else if (set.kind === 'ownZones') {
    members = ctx.state.zones.filter(zone => zone.sourceCardId === ctx.sourceCardId
      && zone.sourceBindingIndex === ctx.sourceBindingIndex).map(zone => ({ x: zone.x, y: zone.y }));
  } else {
    members = ctx.state.summons.filter(summon => summon.sourceCardId === ctx.sourceCardId
      && summon.sourceBindingIndex === ctx.sourceBindingIndex
      && (!set.summonKind || summon.kind === set.summonKind)).map(summon => ({ x: summon.x, y: summon.y }));
  }
  const direction = effect.forEach.order === 'farthest' ? -1 : 1;
  return members.sort((a, b) => direction * (Math.hypot(a.x - ctx.origin.x, a.y - ctx.origin.y)
    - Math.hypot(b.x - ctx.origin.x, b.y - ctx.origin.y))).slice(0, effect.forEach.maxTargets);
}

/** 消耗态持续时长（R4：≤5s）。 */
function cappedDuration(ctx: EffectCtx, want: number): number {
  return ctx.consume ? Math.min(5, want) : want;
}

function lineZoneDirection(ctx: EffectCtx, lineFrom?: 'turretToPoint' | 'bulletPath'): { x: number; y: number } {
  const turret = cfg.combat.turret;
  if (lineFrom === 'bulletPath' && ctx.bullet) {
    const length = Math.hypot(ctx.bullet.vx, ctx.bullet.vy);
    if (length > 1e-9) return { x: ctx.bullet.vx / length, y: ctx.bullet.vy / length };
  }
  if (ctx.triggerPoint) {
    const dx = ctx.triggerPoint.x - turret.x;
    const dy = ctx.triggerPoint.y - turret.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-9) return { x: dx / length, y: dy / length };
  }
  const target = nearestEnemy(ctx.state, ctx.origin.x, ctx.origin.y, Infinity);
  if (target) {
    const dx = target.x - ctx.origin.x;
    const dy = target.y - ctx.origin.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-9) return { x: dx / length, y: dy / length };
  }
  return { x: 1, y: 0 };
}

function makeZone(ctx: EffectCtx, atom: 'aura' | 'groundZone', p: Record<string, unknown>): Zone {
  const radiusOverTime = p.radiusOverTime as Zone['radiusOverTime'] | undefined;
  const radius = radiusOverTime?.from ?? num(p, 'radius', ctx.radius ?? atomNumberDefault(atom, 'radius'));
  const shape = cStr(atom, p, 'shape') as Zone['shape'];
  const lineFrom = typeof p.lineFrom === 'string' ? p.lineFrom as Zone['lineFrom'] : undefined;
  const direction = shape === 'line' ? lineZoneDirection(ctx, lineFrom) : null;
  const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault(atom, 'duration')));
  const zone: Zone = {
    id: ctx.state.nextZoneId++,
    x: ctx.origin.x,
    y: ctx.origin.y,
    radius,
    initialRadius: radius,
    radiusOverTime,
    totalDuration: duration,
    innerRadius: typeof p.innerRadius === 'number' ? (p.innerRadius as number) : undefined,
    shape,
    lineStartX: direction ? ctx.origin.x : undefined,
    lineStartY: direction ? ctx.origin.y : undefined,
    lineDirX: direction?.x,
    lineDirY: direction?.y,
    lineLength: direction ? radius * LINE_ZONE_LENGTH_MUL : undefined,
    lineWidth: direction ? radius * LINE_ZONE_WIDTH_MUL : undefined,
    lineFrom,
    remaining: duration,
    tickInterval: cNum(atom, p, 'tickInterval'),
    tickTimer: 0,
    effects: (Array.isArray(p.effects) ? (p.effects as EffectDef[]) : []),
    sourceCardId: ctx.sourceCardId,
    sourceCardType: ctx.sourceCardType,
    sourceBindingIndex: ctx.sourceBindingIndex,
    baseDamage: ctx.baseDamage,
    color: typeof p.color === 'string'
      ? (p.color as string)
      : ctx.sourceCardType ? resolveCardVisual(ctx.sourceCardType).accent : undefined,
  };
  ctx.state.zones.push(zone);
  return zone;
}

/** 连锁放电：从 start 起跳 bounces 次，每跳伤害 ×retention。 */
function chainFrom(ctx: EffectCtx, p: Record<string, unknown>, start: Enemy, initialHit: boolean): void {
  const searchRange = cNum('chain', p, 'searchRange');
  const retention = cNum('chain', p, 'damageRetention');
  const relayCount = p.preferRelay === true
    ? ctx.state.summons.filter(s => s.chainRelay && Math.hypot(s.x - start.x, s.y - start.y) <= searchRange).length
    : 0;
  const relayBonus = Math.min(cNum('chain', p, 'relayBonusCap'), relayCount * cNum('chain', p, 'relayDamageBonus'));
  let dmg = (ctx.attack?.damage ?? (ctx.bullet ? ctx.bullet.damage : ctx.baseDamage * cNum('chain', p, 'damageMul'))) * (1 + relayBonus);
  const visited = new Set<number>([start.id]);
  let current = start;
  if (initialHit) {
    ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, start, dmg, 'chain'));
    spreadChainStatus(ctx, p, start);
  }
  for (let i = 0; i < cNum('chain', p, 'bounces'); i++) {
    const next = nearestEnemy(ctx.state, current.x, current.y, searchRange, visited);
    if (!next) break;
    dmg *= retention;
    spawnParticle(ctx.state, ctx.rng, (current.x + next.x) / 2, (current.y + next.y) / 2, '#8cecff', 90);
    visited.add(next.id);
    ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, next, dmg, 'chain'));
    spreadChainStatus(ctx, p, next);
    current = next;
  }
}

/** chain 专用状态传播：直接走 statusSystem，不经 fireTrigger('onHit')。 */
function spreadChainStatus(ctx: EffectCtx, p: Record<string, unknown>, enemy: Enemy): void {
  const status = p.spreadStatus;
  if (status !== 'vulnerable' && status !== 'slow' && status !== 'dot' && status !== 'brand') return;
  const raw = p.spreadParams;
  const params = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const ratio = typeof params.ratio === 'number' ? params.ratio : status === 'dot' ? 0.12 : 0.15;
  const duration = typeof params.duration === 'number' ? params.duration : 2;
  if (status === 'vulnerable') applyVulnerable(enemy, ratio, duration);
  else if (status === 'slow') applySlow(enemy, ratio, duration);
  else if (status === 'dot') applyDot(enemy, ctx.baseDamage * ratio, duration);
  else applyBrand(enemy, ratio, duration);
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
  const width = cNum('beamMorph', p, 'width');
  const dmg = ctx.baseDamage * cNum('beamMorph', p, 'damageRatio');
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

/** Data-audit contract: these handlers intentionally do nothing at trigger time. */
export const NOOP_MODIFIER_ATOMS = [
  'dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert',
  'mergeMaterialRefund', 'wildcardRewardBonus',
  'thorns', 'breachReduction', 'novaOnBreak',
] as const satisfies readonly AtomName[];

/** riders 属于 attack；projectile bullet 保留同一数组引用以兼容渲染/旧测试。 */
function attachRider(ctx: EffectCtx, atom: AtomName, params: Record<string, unknown>): boolean {
  if (ctx.enemy) return false;
  const riders = ctx.attack?.riders ?? (ctx.bullet ? (ctx.bullet.riders ??= []) : undefined);
  if (!riders) return false;
  // rider 是「原子 + 松散参数」的延迟调用记录；此处是判别联合的边界，按运行时原子名装配。
  riders.push({ atom, params, sourceCardId: ctx.sourceCardId } as AttackRider);
  if (ctx.bullet && ctx.attack) ctx.bullet.riders = ctx.attack.riders;
  return true;
}

export function effectSourceKey(ctx: EffectCtx): string {
  if (ctx.consume || (ctx.sourceCardType != null && ctx.sourceCardId == null)) {
    return `consume/${ctx.sourceCardType ?? 'anonymous'}`;
  }
  if (ctx.sourceCardType != null && ctx.sourceCardId != null && ctx.sourceBindingIndex != null) {
    return `${ctx.sourceCardType}/${ctx.sourceCardId}/${ctx.sourceBindingIndex}/${ctx.sourceEffectIndex ?? 0}`;
  }
  return `anonymous/${ctx.sourceEffectIndex ?? 0}`;
}

/** FNV-1a：只用于把稳定来源键映射到确定方位，不参与随机流。 */
function stableSourceHash(sourceKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sourceKey.length; i++) {
    hash ^= sourceKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 装备召唤物外围放置：优先朝 1/dist 加权威胁方向，无敌人时按稳定来源键确定方位。 */
export function threatDirectionSummonPosition(
  state: GameState, sourceKey: string, distanceFromTurret: number,
): { x: number; y: number } {
  const turret = cfg.combat.turret;
  let vx = 0;
  let vy = 0;
  for (const enemy of state.enemies) {
    const dx = enemy.x - turret.x;
    const dy = enemy.y - turret.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const weight = 1 / distance;
    vx += (dx / distance) * weight;
    vy += (dy / distance) * weight;
  }
  let angle: number;
  if (Math.hypot(vx, vy) > 1e-9) {
    angle = Math.atan2(vy, vx);
  } else {
    angle = stableSourceHash(sourceKey) / 0x1_0000_0000 * Math.PI * 2;
  }
  return {
    x: turret.x + Math.cos(angle) * distanceFromTurret,
    y: turret.y + Math.sin(angle) * distanceFromTurret,
  };
}

export function equipmentSummonPosition(ctx: EffectCtx, p: Record<string, unknown>): { x: number; y: number } {
  if (p.placement !== 'threatDirection' || ctx.sourceCardId == null) return ctx.origin;
  return threatDirectionSummonPosition(ctx.state, effectSourceKey(ctx), cNum('summon', p, 'distanceFromTurret'));
}

function configureSummon(summon: Summon, ctx: EffectCtx, p: Record<string, unknown>, position: { x: number; y: number }): void {
  const kind = cStr('summon', p, 'kind') as Summon['kind'];
  const hp = cNum('summon', p, 'hp');
  summon.kind = kind;
  summon.sourceCardType = ctx.sourceCardType;
  summon.sourceEffectIndex = ctx.sourceEffectIndex;
  summon.x = position.x;
  summon.y = position.y;
  summon.hp = hp;
  summon.maxHp = hp;
  summon.remaining = ctx.sourceCardId != null
    ? undefined
    : (cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault('summon', 'duration'))) || undefined);
  summon.placement = ctx.sourceCardId != null && (p.placement === 'threatDirection' || p.placement === 'ring') ? p.placement : undefined;
  summon.distanceFromTurret = summon.placement ? cNum('summon', p, 'distanceFromTurret') : undefined;
  summon.tauntRadius = cNum('summon', p, 'tauntRadius', { variant: kind });
  summon.priorityWeight = cNum('summon', p, 'priorityWeight');
  summon.damageRatio = cNum('summon', p, 'damageRatio');
  summon.fireInterval = cNum('summon', p, 'fireInterval', { variant: kind });
  summon.fireCd = 0;
  summon.angle = ctx.rng() * Math.PI * 2;
  summon.explodeOnDeath = cBool('summon', p, 'explode')
    ? {
      damage: ctx.baseDamage * cNum('summon', p, 'explodeDamageMul'),
      knockbackDistance: cNum('summon', p, 'knockbackDistance'),
    }
    : null;
  summon.respawnOnce = cBool('summon', p, 'respawnOnce');
  summon.respawned = false;
  summon.chainRelay = cBool('summon', p, 'chainRelay');
  summon.onDeathEffects = Array.isArray(p.onDeathEffects) ? structuredClone(p.onDeathEffects as EffectDef[]) : undefined;
  summon.intervalEffects = Array.isArray(p.intervalEffects) ? structuredClone(p.intervalEffects as EffectDef[]) : undefined;
  summon.intervalSeconds = cNum('summon', p, 'intervalSeconds');
  summon.intervalTimer = summon.intervalSeconds;
  summon.auraRadius = cNum('summon', p, 'auraRadius');
  summon.auraEffects = Array.isArray(p.auraEffects) ? structuredClone(p.auraEffects as EffectDef[]) : undefined;
  summon.buffLevel ??= 0;
  summon.baseDamage = ctx.baseDamage;
}

export const ATOMS: Record<AtomName, AtomHandler> = {
  // —— 弹道 ——
  pierce(ctx, p) {
    // pierce/ricochet 只描述实体弹轨迹；line/lob 下明确 no-op，不属于被动丢失。
    if (ctx.bullet && (!ctx.attack || ctx.attack.delivery === 'projectile')) {
      ctx.bullet.pierceLeft = cNum('pierce', p, 'count');
      ctx.bullet.damageRetention = cNum('pierce', p, 'damageRetention');
      ctx.bullet.rampPerPierce = cNum('pierce', p, 'rampPerPierce');
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
      r: cNum('pierce', p, 'width'),
      life: cfg.combat.bullet.life * PIERCE_CONSUME_LIFE_MUL,
      damage: ctx.baseDamage * cNum('pierce', p, 'damageMul'),
      pierceLeft: PIERCE_CONSUME_LIMIT,
      damageRetention: cNum('pierce', p, 'damageRetention', { scope: 'consume' }),
      hitIds: [],
    });
  },
  chain(ctx, p) {
    if (attachRider(ctx, 'chain', p)) return;
    if (ctx.enemy) { chainFrom(ctx, p, ctx.enemy, !ctx.attack && !ctx.bullet); return; }
    // 无敌人载荷（interval 3★ / 消耗落点）：取 origin 附近至多 targets 个起点。
    const count = cNum('chain', p, 'targets');
    const picked = new Set<number>();
    for (let i = 0; i < count; i++) {
      const start = nearestEnemy(ctx.state, ctx.origin.x, ctx.origin.y, ctx.radius ?? totalRange(ctx.state, ctx.config), picked);
      if (!start) break;
      picked.add(start.id);
      chainFrom(ctx, p, start, true);
    }
  },
  split(ctx, p) {
    if (attachRider(ctx, 'split', p)) return;
    // 命中即触发 onHit（含子弹片自身命中），maxDepth 防止子弹片再分裂形成指数级增殖（默认 1=只裂一代）。
    const depth = ctx.bullet?.splitDepth ?? 0;
    if (depth >= cNum('split', p, 'maxDepth')) return;
    const origin = ctx.enemy ? { x: ctx.enemy.x, y: ctx.enemy.y } : ctx.origin;
    const count = cNum('split', p, 'count');
    const dmg = (ctx.attack?.damage ?? (ctx.bullet ? ctx.bullet.damage : ctx.baseDamage)) * cNum('split', p, 'damageRatio');
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
        pendingOnFire: true,
      });
    }
  },
  ricochet(ctx, p) {
    if (ctx.bullet && (!ctx.attack || ctx.attack.delivery === 'projectile')) ctx.bullet.ricochetLeft = cNum('ricochet', p, 'bounces');
  },
  aoeOnHit(ctx, p) {
    if (attachRider(ctx, 'aoeOnHit', p)) return;
    const at = ctx.enemy ? { x: ctx.enemy.x, y: ctx.enemy.y } : ctx.origin;
    explode(ctx, at.x, at.y, num(p, 'radius', ctx.radius ?? atomNumberDefault('aoeOnHit', 'radius')),
      (ctx.attack?.damage ?? (ctx.bullet ? ctx.bullet.damage : ctx.baseDamage)) * cNum('aoeOnHit', p, 'damageRatio'),
      cNum('aoeOnHit', p, 'falloff'));
  },
  beamMorph(ctx, p) {
    // 装备态换形由 getModifiers 聚合；触发式调用（interval 绑定）= 立即发射一道光束。
    beam(ctx, p);
  },
  mortarMorph(ctx, p) {
    // 装备态换形由 getModifiers 聚合；触发式调用 = 落点即时榴弹爆炸。
    explode(ctx, ctx.origin.x, ctx.origin.y, num(p, 'radius', ctx.radius ?? atomNumberDefault('mortarMorph', 'radius')),
      ctx.baseDamage * cNum('mortarMorph', p, 'damageRatio'), cNum('mortarMorph', p, 'falloff'));
  },

  // —— 控制 ——
  slow(ctx, p) {
    if (attachRider(ctx, 'slow', p)) return;
    for (const e of targets(ctx, 'slow', p)) applySlow(e, cNum('slow', p, 'ratio'), cNum('slow', p, 'duration'));
  },
  freeze(ctx, p) {
    if (attachRider(ctx, 'freeze', p)) return;
    const stacks = typeof p.stacksToTrigger === 'number' ? (p.stacksToTrigger as number) : undefined;
    for (const e of targets(ctx, 'freeze', p)) {
      if (controlBudgetDenies(ctx.state, e)) continue;
      applyFreeze(e, cNum('freeze', p, 'duration'), stacks);
    }
  },
  stun(ctx, p) {
    if (attachRider(ctx, 'stun', p)) return;
    const chance = cNum('stun', p, 'chance');
    for (const e of targets(ctx, 'stun', p)) {
      if (controlBudgetDenies(ctx.state, e)) continue;
      if (ctx.rng() < chance) applyStun(e, cNum('stun', p, 'duration'));
    }
  },
  knockback(ctx, p) {
    if (attachRider(ctx, 'knockback', p)) return;
    const from = ctx.bullet ? { x: ctx.bullet.x, y: ctx.bullet.y } : ctx.origin;
    const collision = cNum('knockback', p, 'collisionDamage');
    const maxRange = totalRange(ctx.state, ctx.config);
    for (const e of targets(ctx, 'knockback', p)) {
      if (controlBudgetDenies(ctx.state, e)) continue;
      if (!applyKnockback(e, from.x, from.y, cNum('knockback', p, 'distance'), maxRange)) continue;
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
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault('taunt', 'duration')));
    const summonId = typeof p.summonId === 'number' ? (p.summonId as number) : undefined;
    const priorityWeight = cNum('taunt', p, 'priorityWeight');
    const sourceKey = effectSourceKey(ctx);
    for (const e of targets(ctx, 'taunt', p)) {
      applyTaunt(e, sourceKey, priorityWeight, ctx.origin.x, ctx.origin.y, duration, summonId);
    }
  },
  vulnerable(ctx, p) {
    if (attachRider(ctx, 'vulnerable', p)) return;
    const maxStacks = Math.max(1, Math.trunc(cNum('vulnerable', p, 'maxStacks')));
    for (const e of targets(ctx, 'vulnerable', p)) {
      applyVulnerable(e, cNum('vulnerable', p, 'ratio'), cNum('vulnerable', p, 'duration'), maxStacks);
    }
  },

  // —— 领域 ——
  aura(ctx, p) {
    // passive 常驻光环由 getModifiers 聚合；触发态/消耗态均创建临时区域。
    if (ctx.zoneTick) return;
    makeZone(ctx, 'aura', p);
  },
  groundZone(ctx, p) {
    makeZone(ctx, 'groundZone', p);
  },
  dot(ctx, p) {
    const tickInterval = cNum('dot', p, 'tickInterval');
    const perTick = typeof p.damageRatio === 'number'
      ? ctx.baseDamage * (p.damageRatio as number)
      : cNum('dot', p, 'damagePerTick');
    if (ctx.zoneTick && ctx.enemy) {
      // 区域周期结算：每 tick 直接掉血，不叠状态。
      ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, ctx.enemy, perTick, 'dot'));
      return;
    }
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault('dot', 'duration')));
    for (const e of targets(ctx, 'dot', p)) applyDot(e, perTick / tickInterval, duration);
  },
  summon(ctx, p) {
    const kind = cStr('summon', p, 'kind') as Summon['kind'];
    if (ctx.sourceCardId != null && ctx.sourceBindingIndex != null) {
      if (p.replacesEarlier === true) {
        for (let i = ctx.state.summons.length - 1; i >= 0; i--) {
          const existing = ctx.state.summons[i];
          if (existing.sourceCardId === ctx.sourceCardId
            && existing.sourceBindingIndex !== ctx.sourceBindingIndex) {
            ctx.state.summons.splice(i, 1);
          }
        }
      }
      // Equipment-triggered summons share one cap per source card and summon kind.
      // This lets independent bindings (pickup/interval/wave start) replenish the
      // same formation without exceeding the configured ceiling.
      const matches = ctx.state.summons.filter(s =>
        s.sourceCardId === ctx.sourceCardId && s.kind === kind);
      const maxCount = cNum('summon', p, 'maxCount');
      const createCount = Math.min(cNum('summon', p, 'count'), Math.max(0, maxCount - matches.length));
      for (let i = 0; i < createCount; i++) {
        const formationIndex = matches.length + i;
        const summon: Summon = {
          id: ctx.state.nextSummonId++, kind, x: ctx.origin.x, y: ctx.origin.y,
          hp: 0, maxHp: 0, fireInterval: 0,
          sourceCardId: ctx.sourceCardId, sourceCardType: ctx.sourceCardType,
          sourceBindingIndex: ctx.sourceBindingIndex, sourceEffectIndex: ctx.sourceEffectIndex,
        };
        let position = equipmentSummonPosition(ctx, p);
        if (p.placement === 'ring') {
          const angle = formationIndex / Math.max(1, maxCount) * Math.PI * 2;
          position = { x: cfg.combat.turret.x + Math.cos(angle) * cNum('summon', p, 'distanceFromTurret'), y: cfg.combat.turret.y + Math.sin(angle) * cNum('summon', p, 'distanceFromTurret') };
        }
        configureSummon(summon, ctx, p, position);
        ctx.state.summons.push(summon);
      }
      return;
    }
    const count = cNum('summon', p, 'count');
    for (let i = 0; i < count; i++) {
      const jitter = count > 1 ? SUMMON_GROUP_JITTER : 0;
      const summon: Summon = {
        id: ctx.state.nextSummonId++,
        kind,
        x: ctx.origin.x + (ctx.rng() - 0.5) * jitter,
        y: ctx.origin.y + (ctx.rng() - 0.5) * jitter,
        hp: 0,
        maxHp: 0,
        fireInterval: 0,
      };
      configureSummon(summon, ctx, p, { x: summon.x, y: summon.y });
      ctx.state.summons.push(summon);
    }
  },

  // —— 经济 ——
  dropRateMul: noopModifier,
  dropLifetimeMul: noopModifier,
  xpMul: noopModifier,
  extraDrop(ctx, p) {
    const at = cStr('extraDrop', p, 'at');
    const base = at === 'turret' ? cfg.combat.turret : ctx.origin;
    const weights = (p.starWeights ?? atomRecordDefault('extraDrop', 'starWeights')) as Record<string, number>;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < cNum('extraDrop', p, 'count'); i++) {
      let roll = ctx.rng() * total;
      let star = 1;
      for (const [s, w] of Object.entries(weights)) {
        roll -= w;
        if (roll <= 0) { star = Number(s); break; }
      }
      star = Math.min(star, cfg.economy.dropStarPolicy.bountyBossMax);
      const x = base.x + (ctx.rng() - 0.5) * EXTRA_DROP_SCATTER;
      const y = base.y + (ctx.rng() - 0.5) * EXTRA_DROP_SCATTER;
      const type = selectUniformCardType(ctx.state, ctx.rng);
      spawnGroundDrop(ctx.state, ctx.config, ctx.rng, x, y, type, star, 'skillExtra');
      recordCardDropShown(ctx.state, type, 'skillExtra');
      if (p.secure === true) ctx.state.groundDrops[ctx.state.groundDrops.length - 1].secure = true;
    }
  },
  expiryConvert: noopModifier,
  mergeMaterialRefund: noopModifier,
  wildcardRewardBonus: noopModifier,
  mergePulse(ctx, p) {
    const dmg = cNum('mergePulse', p, 'damagePerMergeCount') * (ctx.merge?.resultStar ?? 1);
    const t = cfg.combat.turret;
    const all = p.radius === 'all';
    const r = all ? Infinity : cNum('mergePulse', p, 'radius');
    for (const e of [...ctx.state.enemies]) {
      if (all || Math.hypot(e.x - t.x, e.y - t.y) <= r) {
        ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, dmg));
      }
    }
  },

  // —— 防御 ——
  shield(ctx, p) {
    const hits = cNum('shield', p, 'absorbHits');
    const regen = typeof p.regenSeconds === 'number' ? (p.regenSeconds as number) : null;
    const cur = ctx.state.shield;
    // 融合契约：容量取最大；所有声明了再生的来源中，间隔取最小。
    if (cur) {
      cur.maxHits = Math.max(cur.maxHits, hits);
      cur.hits = Math.max(cur.hits, hits);
      if (regen != null) cur.regenSeconds = cur.regenSeconds == null ? regen : Math.min(cur.regenSeconds, regen);
      return;
    }
    ctx.state.shield = { hits, maxHits: hits, regenRemaining: null, regenSeconds: regen };
  },
  thorns: noopModifier,
  breachReduction: noopModifier,
  novaOnBreak: noopModifier,
  execute(ctx, p) {
    const threshold = cNum('execute', p, 'hpThresholdRatio');
    for (const e of targets(ctx, 'execute', p)) ctx.events.push(...tryExecute(ctx.state, ctx.config, ctx.rng, e, threshold));
  },

  // —— 共用 ——
  burstDamage(ctx, p) {
    const dmg = ctx.baseDamage * cNum('burstDamage', p, 'damageMul');
    const radius = num(p, 'radius', ctx.radius ?? atomNumberDefault('burstDamage', 'radius'));
    for (const e of targets(ctx, 'burstDamage', p)) {
      ctx.events.push(...dealDamage(ctx.state, ctx.config, ctx.rng, e, dmg));
    }
    for (let i = 0; i < 10; i++) spawnParticle(ctx.state, ctx.rng, ctx.origin.x, ctx.origin.y, '#ff9de2', 140);
    ctx.state.vfx.push({
      kind: 'retaliationNova',
      x: ctx.origin.x,
      y: ctx.origin.y,
      radius,
      remaining: 0.4,
    });
  },
  focusPriority(ctx, p) {
    const weight = cNum('focusPriority', p, 'priorityWeight');
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault('focusPriority', 'duration')));
    // hpThresholdRatio 可选：只标记血量比例低于该阈值的目标（如圣域 5★ 处刑印记：只烙印濒死敌人）。
    const hpThreshold = typeof p.hpThresholdRatio === 'number' ? (p.hpThresholdRatio as number) : null;
    for (const e of targets(ctx, 'focusPriority', p)) {
      if (hpThreshold != null && e.hp / e.maxHp > hpThreshold) continue;
      applyBrand(e, weight, duration);
    }
  },
  restore(ctx, p) {
    const amount = cNum('restore', p, 'amount');
    const amountRatio = cNum('restore', p, 'amountRatio');
    ctx.state.hp = Math.min(ctx.state.maxHp, ctx.state.hp + amount + ctx.state.maxHp * amountRatio);
  },
  statBuff(ctx, p) {
    const stat = cStr('statBuff', p, 'stat');
    const operation = cStr('statBuff', p, 'operation') as 'add' | 'mul';
    const value = cNum('statBuff', p, 'value', { variant: operation });
    const duration = cappedDuration(ctx, num(p, 'duration', ctx.duration ?? atomNumberDefault('statBuff', 'duration')));
    const maxStacks = Math.max(1, Math.trunc(cNum('statBuff', p, 'maxStacks')));
    const sourceId = `statBuff:${ctx.sourceCardId ?? ctx.sourceCardType ?? 'anonymous'}:${stat}:${operation}`;
    const matching = ctx.state.statModifiers.filter(modifier => modifier.sourceId === sourceId);
    if (matching.length >= maxStacks) {
      const refresh = matching.reduce((shortest, modifier) =>
        (modifier.remaining ?? Infinity) < (shortest.remaining ?? Infinity) ? modifier : shortest);
      refresh.value = value;
      refresh.remaining = duration;
      if (stat === 'maxHpAdd' || stat === 'maxHpMul') reconcileMaxHp(ctx.state);
      return;
    }
    ctx.state.statModifiers.push({
      sourceId,
      stat: stat as GameState['statModifiers'][number]['stat'],
      operation,
      value,
      remaining: duration,
    });
    if (stat === 'maxHpAdd' || stat === 'maxHpMul') reconcileMaxHp(ctx.state);
  },
  charge(ctx, p) {
    const key = `charge:${ctx.sourceCardId ?? 'consume'}:${cStr('charge', p, 'chargeKey')}`;
    const current = ctx.state.effectRuntime.charges[key] ?? 0;
    const by = cStr('charge', p, 'by');
    const triggerMatches = (by === 'breach' && ctx.trigger === 'onBreach')
      || (by === 'shieldAbsorb' && ctx.trigger === 'onBreach' && ctx.eventDamage === 0)
      || (by === 'killWithSource:dot' && ctx.trigger === 'onKill' && ctx.eventSource === 'dot')
      || (by === 'thornsDamage' && ctx.eventSource === 'thorns');
    let next = current;
    if (triggerMatches) next = Math.min(cNum('charge', p, 'max'), next + cNum('charge', p, 'perEvent'));
    const releaseAt = cStr('charge', p, 'releaseAt');
    const release = (releaseAt === 'full' && next >= cNum('charge', p, 'max'))
      || (releaseAt === 'interval' && ctx.trigger === 'interval' && next > 0);
    ctx.state.effectRuntime.charges[key] = release ? 0 : next;
    if (release && Array.isArray(p.effects)) runEffects(ctx, p.effects as EffectDef[]);
  },
  summonBuff(ctx, p) {
    // `kind` is required by validation, so it intentionally has no contract
    // default. Avoid asking the default resolver for a value that cannot exist.
    const kind = String(p.kind);
    let candidates = ctx.state.summons.filter(s => s.kind === kind && s.sourceCardId === ctx.sourceCardId);
    candidates.sort((a, b) => Math.hypot(a.x - ctx.origin.x, a.y - ctx.origin.y) - Math.hypot(b.x - ctx.origin.x, b.y - ctx.origin.y) || a.id - b.id);
    if (cStr('summonBuff', p, 'target') !== 'all') candidates = candidates.slice(0, 1);
    for (const summon of candidates) {
      if ((summon.buffLevel ?? 0) >= cNum('summonBuff', p, 'capLevels')) continue;
      summon.buffLevel = (summon.buffLevel ?? 0) + 1;
      summon.damageRatio = (summon.damageRatio ?? 0) * cNum('summonBuff', p, 'damageMul');
      summon.auraRadius = (summon.auraRadius ?? 0) + cNum('summonBuff', p, 'radiusAdd');
    }
  },
};

/** 依序执行一组效果。 */
export function runEffects(ctx: EffectCtx, effects: EffectDef[], effectIndexOffset = 0): void {
  for (let effectIndex = 0; effectIndex < effects.length; effectIndex++) {
    const executable = effects[effectIndex] as EffectDef | ForEachEffectDef;
    ctx.sourceEffectIndex = effectIndexOffset + effectIndex;
    if ('forEach' in executable && executable.forEach) {
      const fanoutEffect = executable as ForEachEffectDef;
      for (const member of forEachMembers(ctx, fanoutEffect)) {
        const nestedCtx: EffectCtx = {
          ...ctx,
          origin: { x: member.x, y: member.y },
          enemy: member.enemy,
          scaleEnemy: member.enemy,
        };
        runEffects(nestedCtx, fanoutEffect.forEach.effects);
      }
      continue;
    }
    if (!('atom' in executable)) continue;
    const ef = executable as AtomicEffectDef;
    const handler = ATOMS[ef.atom];
    if (!handler) continue;
    const effectCtx: EffectCtx = {
      ...ctx,
      origin: selectEffectOrigin(ctx, ef.at),
      enemy: ef.at ? undefined : ctx.enemy,
    };
    const params = scaledParams(effectCtx, ef);
    if (ef.atom !== 'stun' && typeof params.chance === 'number' && ctx.rng() >= params.chance) continue;
    handler(effectCtx, params);
  }
}
