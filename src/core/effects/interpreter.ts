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

/** 卡的当前装备态星层（入装门槛 2★，3★ 封顶）。 */
function starTierOf(def: CardDef, star: number): BindingDef[] {
  if (!def.stars) return [];
  const key = star >= 3 ? '3' : star >= 2 ? '2' : null;
  return key ? def.stars[key].equip : [];
}

/** 遍历生效装备的全部绑定。 */
function* equippedBindings(state: GameState): Generator<{ card: Card; def: CardDef; binding: BindingDef; bindingIndex: number }> {
  for (const card of effectiveEquipment(state)) {
    const def = DEFS.get(card.type);
    if (!def) continue; // 旧数值卡：装备加成走 legacy 路径（stats/bonusFromCards）
    const bindings = starTierOf(def, card.star);
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
 * 触发器总线入口：各系统在结算点调用（onFire/onHit/onKill/onWaveStart/onBreach/onPickup/onMerge）。
 * interval 与 passive 不经此处（分别走 tick 与 getModifiers）。
 */
export function fireTrigger(state: GameState, config: Config, rng: Rng, trigger: Trigger, payload: TriggerPayload = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (const { card, binding } of equippedBindings(state)) {
    if (binding.trigger !== trigger) continue;
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
  const key = String(Math.min(Math.max(star, 1), 3)) as '1' | '2' | '3';
  const tier = def.consumable.byStar[key];
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

/** 直接运行一组效果（zone tick 等内部复用；导出供测试）。 */
export { ATOMS, runEffects };
export type { EffectCtx };
