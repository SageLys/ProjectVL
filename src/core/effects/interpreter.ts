// 通用效果解释器：触发器 → 装备态绑定 → 效果原子；消耗态 → 落点释放。
// GameEvent 流是触发器总线（P2 §3），本模块把 8 个触发器接到各系统的结算点上。
// 卡 = 数据（CardDef JSON）。本模块不认识任何具体卡，禁止每卡硬编码 if。
import { cfg } from '../../config';
import type { Bullet, Card, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng } from '../types';
import type { BindingDef, CardDef, EffectDef, Trigger } from './defs';
import { ATOMS, runEffects, type EffectCtx } from './registry';
import { totalDamage } from '../stats';

// —— 技能定义注册表（启动时由配置注入；测试可注入 fixture）——
let DEFS = new Map<string, CardDef>();

export function registerSkillDefs(defs: CardDef[]): void {
  DEFS = new Map(defs.map(d => [d.id, d]));
}

export function getSkillDef(type: string): CardDef | undefined {
  return DEFS.get(type);
}

/** 生效装备集：方案 A 独立装备栏。 */
export function effectiveEquipment(state: GameState): Card[] {
  return state.equipment.filter((c): c is Card => !!c);
}

function clone<T>(value: T): T { return structuredClone(value); }

function applyAmplify(value: unknown, axes: Record<string, string>, key = ''): unknown {
  if (typeof value === 'number' && axes[key]) {
    const expr = axes[key].trim();
    const n = Number(expr.replace(/^\+/, '').replace(/%$/, ''));
    if (!Number.isFinite(n)) throw new Error(`[skills] 非法 amplifyAxis: ${key}=${expr}`);
    return expr.endsWith('%') ? value * (1 + n / 100) : value + n;
  }
  if (Array.isArray(value)) return value.map(v => applyAmplify(v, axes, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyAmplify(v, axes, k)]));
  }
  return value;
}

/** 解析装备态：3/5/6 为锚点；4★ 只能对 3★ 作同构数值放大。 */
export function resolveEquipBindings(def: CardDef, star: number): BindingDef[] {
  if (star < 3) return [];
  if (star === 4) return applyAmplify(clone(def.stars['3'].equip), def.amplifyAxis.params) as BindingDef[];
  return clone(def.stars[star >= 6 ? '6' : star >= 5 ? '5' : '3'].equip);
}

/** 遍历生效装备的全部绑定。 */
function* equippedBindings(state: GameState): Generator<{ card: Card; def: CardDef; binding: BindingDef; bindingIndex: number }> {
  for (const card of effectiveEquipment(state)) {
    const def = DEFS.get(card.type);
    if (!def) continue; // 旧数值卡：装备加成走 legacy 路径（stats/bonusFromCards）
    const bindings = resolveEquipBindings(def, card.star);
    for (let i = 0; i < bindings.length; i++) yield { card, def, binding: bindings[i], bindingIndex: i };
  }
}

export interface TriggerPayload {
  bullet?: Bullet;
  enemy?: Enemy;
  drop?: GroundDrop;
  wave?: number;
  damage?: number;
  merge?: { cardType: CardType; resultStar: number };
  /** 空间锚点（命中点/击杀点）；缺省 = 炮台。 */
  point?: { x: number; y: number };
  /** 击杀来源标签（如 'chain'），供 onKill 绑定的 triggerParams.requiresSource 过滤。 */
  source?: string;
}

/** 敌人身上是否处于某个状态（用于 triggerParams.requiresStatus 过滤，值域先开放这两种）。 */
function enemyHasStatus(enemy: Enemy | undefined, status: string): boolean {
  if (!enemy) return false;
  if (status === 'frozen') return enemy.status.frozen > 0;
  if (status === 'dot') return enemy.status.dots.length > 0;
  return false;
}

/** 绑定的 triggerParams 条件是否满足（requiresSource / requiresStatus）；两者都是通用过滤，非任何卡专属。 */
function bindingConditionMet(binding: BindingDef, payload: TriggerPayload): boolean {
  const tp = binding.triggerParams as { requiresSource?: string; requiresStatus?: string } | undefined;
  if (!tp) return true;
  if (tp.requiresSource && tp.requiresSource !== payload.source) return false;
  if (tp.requiresStatus && !enemyHasStatus(payload.enemy, tp.requiresStatus)) return false;
  return true;
}

function baseCtx(state: GameState, config: Config, rng: Rng, star: number, payload: TriggerPayload = {}): EffectCtx {
  return {
    state, config, rng,
    events: [],
    origin: payload.point ?? { x: cfg.combat.turret.x, y: cfg.combat.turret.y },
    star,
    baseDamage: totalDamage(state, config),
    bullet: payload.bullet,
    enemy: payload.enemy,
    drop: payload.drop,
    merge: payload.merge,
  };
}

/**
 * onKill 递归深度守卫（P2 §11 开放问题）：onKill 绑定的效果（如连锁再引/灼烧扩散）可能同步
 * 击杀另一个敌人并再次触发 onKill，理论上可深至"场上敌人数"层。加一个硬顶防止极端密集场景
 * 下的超深同步递归；绝大多数正常战斗（<4 层链式击杀）不受影响。
 */
const ON_KILL_MAX_DEPTH = 4;
let onKillDepth = 0;

/**
 * 触发器总线入口：各系统在结算点调用（onFire/onHit/onKill/onWaveStart/onBreach/onPickup/onMerge）。
 * interval 与 passive 不经此处（分别走 tick 与 getModifiers）。
 */
export function fireTrigger(state: GameState, config: Config, rng: Rng, trigger: Trigger, payload: TriggerPayload = {}): GameEvent[] {
  if (trigger === 'onKill') {
    if (onKillDepth >= ON_KILL_MAX_DEPTH) return [];
    onKillDepth++;
    try {
      return fireTriggerBindings(state, config, rng, trigger, payload);
    } finally {
      onKillDepth--;
    }
  }
  return fireTriggerBindings(state, config, rng, trigger, payload);
}

function fireTriggerBindings(state: GameState, config: Config, rng: Rng, trigger: Trigger, payload: TriggerPayload): GameEvent[] {
  const events: GameEvent[] = [];
  for (const { card, binding } of equippedBindings(state)) {
    if (binding.trigger !== trigger) continue;
    if (!bindingConditionMet(binding, payload)) continue;
    const ctx = baseCtx(state, config, rng, card.star, payload);
    runEffects(ctx, binding.effects);
    events.push(...ctx.events);
  }
  return events;
}

/** interval 装备态绑定推进：每卡每绑定独立时钟（key = 卡id:绑定序号）。 */
export function tickIntervalBindings(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const liveKeys = new Set<string>();
  for (const { card, binding, bindingIndex } of equippedBindings(state)) {
    if (binding.trigger !== 'interval') continue;
    const seconds = binding.triggerParams?.seconds ?? 1;
    const key = `${card.id}:${bindingIndex}`;
    liveKeys.add(key);
    const clock = (state.intervalClocks[key] ?? seconds) - dt;
    if (clock <= 0) {
      const ctx = baseCtx(state, config, rng, card.star);
      runEffects(ctx, binding.effects);
      events.push(...ctx.events);
      state.intervalClocks[key] = seconds;
    } else {
      state.intervalClocks[key] = clock;
    }
  }
  for (const key of Object.keys(state.intervalClocks)) {
    if (!liveKeys.has(key) && !key.startsWith('aura:') && !key.startsWith('morph:')) delete state.intervalClocks[key];
  }
  return events;
}

/** 常驻修饰聚合（passive 绑定 + 任意绑定中的换形/光环原子）。 */
export interface Modifiers {
  dropRateMul: number;
  dropLifetimeMul: number;
  xpMul: number;
  thornsRatio: number;
  breachReduction: number;
  executeThreshold: number;
  novaOnBreak: { damage: number; knockbackDistance: number } | null;
  mergeRules: { rule: string; value: number }[];
  expiryConvert: { ratio: number } | null;
  morph: 'none' | 'beam' | 'mortar';
  morphParams: Record<string, unknown>;
  auras: { key: string; radius: number | null; radiusRatioOfRange: number | null; tickInterval: number; effects: EffectDef[]; star: number }[];
}

const num = (p: Record<string, unknown> | undefined, k: string, d: number): number =>
  p && typeof p[k] === 'number' ? (p[k] as number) : d;

export function getModifiers(state: GameState): Modifiers {
  const m: Modifiers = {
    dropRateMul: 1, dropLifetimeMul: 1, xpMul: 1,
    thornsRatio: 0, breachReduction: 0, executeThreshold: 0,
    novaOnBreak: null, mergeRules: [], expiryConvert: null,
    morph: 'none', morphParams: {},
    auras: [],
  };
  for (const { card, binding, bindingIndex } of equippedBindings(state)) {
    for (const ef of binding.effects) {
      const p = ef.params ?? {};
      switch (ef.atom) {
        case 'dropRateMul': m.dropRateMul *= num(p, 'mul', 1); break;
        case 'dropLifetimeMul': m.dropLifetimeMul *= num(p, 'mul', 1); break;
        case 'xpMul': m.xpMul *= num(p, 'mul', 1); break;
        case 'thorns': m.thornsRatio += num(p, 'ratio', 0); break;
        case 'breachReduction': m.breachReduction = Math.min(0.9, m.breachReduction + num(p, 'ratio', 0)); break;
        case 'execute': m.executeThreshold = Math.max(m.executeThreshold, num(p, 'hpThresholdRatio', 0)); break;
        case 'novaOnBreak':
          m.novaOnBreak = { damage: num(p, 'damage', 20), knockbackDistance: num(p, 'knockbackDistance', 80) };
          break;
        case 'mergeRule':
          m.mergeRules.push({ rule: String(p.rule ?? ''), value: num(p, 'value', 0) });
          break;
        case 'expiryConvert':
          m.expiryConvert = { ratio: num(p, 'ratio', 0.5) };
          break;
        case 'beamMorph':
          if (binding.trigger === 'passive') { m.morph = 'beam'; m.morphParams = p; }
          break;
        case 'mortarMorph':
          if (binding.trigger === 'passive') { m.morph = 'mortar'; m.morphParams = p; }
          break;
        case 'aura':
          if (binding.trigger === 'passive') {
            m.auras.push({
              key: `aura:${card.id}:${bindingIndex}`,
              radius: typeof p.radius === 'number' ? (p.radius as number) : null,
              radiusRatioOfRange: typeof p.radiusRatioOfRange === 'number' ? (p.radiusRatioOfRange as number) : null,
              tickInterval: num(p, 'tickInterval', 1),
              effects: Array.isArray(p.effects) ? (p.effects as EffectDef[]) : [],
              star: card.star,
            });
          }
          break;
        default: break;
      }
    }
  }
  return m;
}

/**
 * 消耗释放：R1–R4——失去该卡、落点=效果空间锚点、即时或 ≤5s。
 * 由 equipmentSystem.consumeCard 调用（含锁定校验/移除卡牌），本函数只做效果结算。
 */
export function releaseConsumable(state: GameState, config: Config, rng: Rng, cardType: string, star: number, x: number, y: number): GameEvent[] {
  const def = DEFS.get(cardType);
  if (!def) return [];
  const tier = resolveConsumableTier(def, star);
  const ctx: EffectCtx = {
    state, config, rng,
    events: [],
    origin: { x, y },
    radius: tier.radius,
    duration: tier.duration,
    star,
    baseDamage: totalDamage(state, config),
    consume: true,
  };
  runEffects(ctx, tier.effects);
  return ctx.events;
}

function interpolate(lower: unknown, upper: unknown, t: number): unknown {
  if (typeof lower === 'number' && typeof upper === 'number') return lower + (upper - lower) * t;
  if (Array.isArray(lower)) return lower.map((v, i) => interpolate(v, Array.isArray(upper) ? upper[i] : undefined, t));
  if (lower && typeof lower === 'object') {
    return Object.fromEntries(Object.entries(lower).map(([k, v]) => [k, interpolate(v, upper && typeof upper === 'object' ? (upper as Record<string, unknown>)[k] : undefined, t)]));
  }
  return lower;
}

/** 1/3/6 为消耗态锚点；2/4/5 在相邻锚点间线性插值。 */
export function resolveConsumableTier(def: CardDef, star: number) {
  const s = Math.min(6, Math.max(1, Math.trunc(star)));
  const anchors = def.consumable.anchors;
  if (s === 1 || s === 3 || s === 6) return clone(anchors[String(s) as '1' | '3' | '6']);
  const [lo, hi] = s < 3 ? [1, 3] : [3, 6];
  return interpolate(anchors[String(lo) as '1' | '3'], anchors[String(hi) as '3' | '6'], (s - lo) / (hi - lo)) as typeof anchors['1'];
}

/** 直接运行一组效果（zone tick 等内部复用；导出供测试）。 */
export { ATOMS, runEffects };
export type { EffectCtx };
