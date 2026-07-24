// 通用效果解释器：触发器 → 装备态绑定 → 效果原子；消耗态 → 落点释放。
// GameEvent 流是触发器总线（P2 §3），本模块把 8 个触发器接到各系统的结算点上。
// 卡 = 数据（CardDef JSON）。本模块不认识任何具体卡，禁止每卡硬编码 if。
//
// 被动融合契约（与装备槽顺序无关）：
//   数值乘数乘法叠加；加法数值相加（breachReduction 封顶 0.9）；阈值取最高；
//   slow/vulnerable/freeze/stun 交给 statusSystem 取最强并延长；aura 按来源并行；
//   所有触发绑定独立触发且所有攻击形态必须经过统一攻击管线；summon 每(卡,绑定)单实例（B2）；
//   shield 的 absorbHits 取最大、regenSeconds 取最小；weaponForm 按正交轴确定性融合。
import { cfg } from '../../config';
import type { AttackInstance, Bullet, Card, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng, Summon, WeaponImpactSpec } from '../types';
import type { BindingDef, CardDef, EffectDef, Trigger } from './defs';
import { ATOMS, runEffects, type EffectCtx } from './registry';
import { totalDamage } from '../stats';
import { applyBuildScalingToBindings, applyBuildScalingToTier } from '../systems/buildModifierSystem';
import { recordCardImpact, recordCardTrigger, totalEnemyHp } from '../../telemetry/combatCounters';

export const FUSION_RULES = [
  '数值乘数(dropRateMul/dropLifetimeMul/xpMul): 乘法叠加',
  '加法数值(thorns/breachReduction): 加法，breachReduction 上限 0.9',
  '阈值(execute): 取最高',
  '状态(slow/vulnerable/freeze/stun): statusSystem 取最强，时长取最大',
  '光环/领域(aura): 按来源独立并行',
  '触发绑定: 所有装备独立触发，所有攻击形态经过统一攻击管线',
  '召唤物(summon): 每个(卡,绑定)单实例（B2）',
  '护盾(shield): absorbHits 取最大，regenSeconds 取最小',
  '主炮形态(weaponForm): delivery/impact/cadence 正交轴确定性融合',
] as const;

/** Passive no-op atoms wired into getModifiers; kept explicit for config audits. */
export const MODIFIER_ATOMS_HANDLED = [
  'dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert', 'mergeRule',
  'thorns', 'breachReduction', 'novaOnBreak',
] as const;

export interface WeaponFormContribution {
  sourceCardId: number;
  sourceCardType: CardType;
  star: number;
  kind: 'beam' | 'mortar';
  params: Record<string, unknown>;
}

export interface WeaponFormSpec {
  delivery: 'projectile' | 'line' | 'lob';
  deliveryDamageRatio: number;
  interval: number;
  duration: number;
  tickInterval: number;
  width: number;
  sourceStar: number;
  sourceCardType?: CardType;
  suppressedSourceCardTypes: CardType[];
  impacts: WeaponImpactSpec[];
}

const formNumber = (p: Record<string, unknown>, key: string, fallback: number): number =>
  typeof p[key] === 'number' ? (p[key] as number) : fallback;

/**
 * 主炮形态正交融合：先按 cardType（再按 id）排序，再独立选择 delivery 与叠加 impact。
 * line > lob > projectile；第 2 个及之后贡献应用统一衰减，因此装备槽互换不改变输出。
 */
export function composeWeaponForm(forms: WeaponFormContribution[]): WeaponFormSpec {
  const sorted = [...forms].sort((a, b) =>
    a.sourceCardType.localeCompare(b.sourceCardType) || a.sourceCardId - b.sourceCardId);
  let delivery: WeaponFormSpec['delivery'] = 'projectile';
  let deliveryDamageRatio = 1;
  let interval = 0.9;
  let duration = 0.6;
  let tickInterval = 0.1;
  let width = 26;
  let sourceStar = 0;
  let sourceCardType: CardType | undefined;
  const suppressedSourceCardTypes: CardType[] = [];
  const impacts: WeaponImpactSpec[] = [];

  sorted.forEach((form, index) => {
    const damping = index === 0 ? 1 : cfg.combat.weaponFusion.damping;
    if (index > 0) suppressedSourceCardTypes.push(form.sourceCardType);
    if (form.kind === 'beam') {
      // line 的 delivery 优先级最高；其 damageRatio 属于投递轴本体。
      delivery = 'line';
      deliveryDamageRatio = formNumber(form.params, 'damageRatio', 1) * damping;
      interval = formNumber(form.params, 'interval', 0.9);
      duration = formNumber(form.params, 'duration', 0.6);
      tickInterval = formNumber(form.params, 'tickInterval', 0.1);
      width = formNumber(form.params, 'width', 26);
      sourceStar = form.star;
      sourceCardType = form.sourceCardType;
    } else {
      // mortar 的核心轴是 aoe；没有 line 时才用 lob 作为默认包装。
      if (delivery !== 'line') {
        delivery = 'lob';
        sourceStar = form.star;
        sourceCardType = form.sourceCardType;
      }
      impacts.push({
        kind: 'aoe',
        sourceCardType: form.sourceCardType,
        sourceStar: form.star,
        damageRatio: formNumber(form.params, 'damageRatio', 1.2) * damping,
        radius: formNumber(form.params, 'radius', 90) * (index === 0 ? 1 : cfg.combat.weaponFusion.radiusMul),
        falloff: formNumber(form.params, 'falloff', 0.5),
      });
    }
  });

  return {
    delivery, deliveryDamageRatio, interval, duration, tickInterval, width,
    sourceStar, sourceCardType, suppressedSourceCardTypes, impacts,
  };
}

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
  return state.equipment.filter((c): c is Card => !!c && !c.provisional);
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
export function legacyResolveEquipBindings(def: CardDef, star: number): BindingDef[] {
  if (star < 3) return [];
  if (star === 4) return applyAmplify(clone(def.stars['3'].equip), def.amplifyAxis.params) as BindingDef[];
  return clone(def.stars[star >= 6 ? '6' : star >= 5 ? '5' : '3'].equip);
}

/** Backward-compatible public name for callers that explicitly need legacy anchors. */
export function resolveEquipBindings(def: CardDef, star: number): BindingDef[] {
  return legacyResolveEquipBindings(def, star);
}

function selectedEvolutionOption(def: CardDef, checkpointStar: number, evolutionPath: string[]) {
  const prefix = `${checkpointStar}:`;
  const optionId = evolutionPath.find(entry => entry.startsWith(prefix))?.slice(prefix.length);
  return def.evolutionTree?.checkpoints
    .find(checkpoint => checkpoint.star === checkpointStar)
    ?.options.find(option => option.id === optionId);
}

/**
 * Resolves a migrated card cumulatively: branch 3, shared 4, independent branch
 * 5, then shared 6. Shared 4 amplification remains active at stars 5 and 6.
 */
export function resolveCardBindings(def: CardDef, evolutionPath: string[], star: number): BindingDef[] {
  if (star < 3) return [];
  if (!def.evolutionTree) return legacyResolveEquipBindings(def, star);
  // Compatibility for pre-C5 saves and test/debug cards created without the
  // factory. Newly upgraded migrated cards always receive a locked path.
  if (evolutionPath.length === 0) return legacyResolveEquipBindings(def, star);

  const bindings: BindingDef[] = [];
  const option3 = selectedEvolutionOption(def, 3, evolutionPath);
  const shared4 = def.evolutionTree.sharedNodes.find(node => node.star === 4);
  if (option3) {
    const branch3 = clone(option3.equip);
    bindings.push(...(star >= 4 && shared4?.amplify
      ? applyAmplify(branch3, shared4.amplify) as BindingDef[]
      : branch3));
  }
  if (star >= 4 && shared4?.equip) bindings.push(...clone(shared4.equip));

  const option5 = selectedEvolutionOption(def, 5, evolutionPath);
  if (star >= 5 && option5) bindings.push(...clone(option5.equip));

  const shared6 = def.evolutionTree.sharedNodes.find(node => node.star === 6);
  if (star >= 6 && shared6?.equip) bindings.push(...clone(shared6.equip));
  return bindings;
}

/** 遍历生效装备的全部绑定。 */
function* equippedBindings(state: GameState): Generator<{ card: Card; def: CardDef; binding: BindingDef; bindingIndex: number }> {
  for (const card of effectiveEquipment(state)) {
    const def = DEFS.get(card.type);
    if (!def) continue;
    const bindings = applyBuildScalingToBindings(state, def, resolveCardBindings(def, card.evolutionPath ?? [], card.star));
    for (let i = 0; i < bindings.length; i++) yield { card, def, binding: bindings[i], bindingIndex: i };
  }
}

export interface TriggerPayload {
  attack?: AttackInstance;
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

function baseCtx(
  state: GameState, config: Config, rng: Rng, star: number, payload: TriggerPayload = {},
  source?: { cardId: number; cardType: CardType; bindingIndex: number },
): EffectCtx {
  return {
    state, config, rng,
    events: [],
    origin: payload.point ?? { x: cfg.combat.turret.x, y: cfg.combat.turret.y },
    star,
    baseDamage: totalDamage(state, config),
    attack: payload.attack,
    sourceCardId: source?.cardId,
    sourceCardType: source?.cardType,
    sourceBindingIndex: source?.bindingIndex,
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

/** 冷却闸门：triggerParams.cooldownSeconds 通用于任意触发器，限制该绑定的最短再触发间隔（state.time 基准）。 */
function cooldownReady(state: GameState, cardId: number, bindingIndex: number, binding: BindingDef): boolean {
  const seconds = binding.triggerParams?.cooldownSeconds;
  if (!seconds) return true;
  const key = `cd:${cardId}:${bindingIndex}`;
  if ((state.cooldowns[key] ?? 0) > state.time) return false;
  state.cooldowns[key] = state.time + seconds;
  return true;
}

function fireTriggerBindings(state: GameState, config: Config, rng: Rng, trigger: Trigger, payload: TriggerPayload): GameEvent[] {
  const events: GameEvent[] = [];
  for (const { card, binding, bindingIndex } of equippedBindings(state)) {
    if (binding.trigger !== trigger) continue;
    if (!bindingConditionMet(binding, payload)) continue;
    if (!cooldownReady(state, card.id, bindingIndex, binding)) continue;
    const ctx = baseCtx(state, config, rng, card.star, payload, { cardId: card.id, cardType: card.type, bindingIndex });
    const hpBefore = totalEnemyHp(state);
    recordCardTrigger(state, card.id);
    runEffects(ctx, binding.effects);
    const attributedDamage = Math.max(0, hpBefore - totalEnemyHp(state));
    if (attributedDamage > 0 || trigger === 'onHit') {
      recordCardImpact(state, card.id, attributedDamage, trigger === 'onHit' ? 1 : 0);
    }
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
      const ctx = baseCtx(state, config, rng, card.star, {}, { cardId: card.id, cardType: card.type, bindingIndex });
      const hpBefore = totalEnemyHp(state);
      recordCardTrigger(state, card.id);
      runEffects(ctx, binding.effects);
      const attributedDamage = Math.max(0, hpBefore - totalEnemyHp(state));
      if (attributedDamage > 0) recordCardImpact(state, card.id, attributedDamage);
      events.push(...ctx.events);
      state.intervalClocks[key] = seconds;
    } else {
      state.intervalClocks[key] = clock;
    }
  }
  for (const key of Object.keys(state.intervalClocks)) {
    if (!liveKeys.has(key) && !key.startsWith('aura:') && !key.startsWith('weapon:')) delete state.intervalClocks[key];
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
  weaponForms: WeaponFormContribution[];
  auras: { key: string; sourceCardType: CardType; radius: number | null; radiusRatioOfRange: number | null; tickInterval: number; effects: EffectDef[]; star: number }[];
}

const num = (p: Record<string, unknown> | undefined, k: string, d: number): number =>
  p && typeof p[k] === 'number' ? (p[k] as number) : d;

export function getModifiers(state: GameState): Modifiers {
  const m: Modifiers = {
    dropRateMul: 1, dropLifetimeMul: 1, xpMul: 1,
    thornsRatio: 0, breachReduction: 0, executeThreshold: 0,
    novaOnBreak: null, mergeRules: [], expiryConvert: null,
    weaponForms: [],
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
          if (binding.trigger === 'passive') m.weaponForms.push({
            sourceCardId: card.id, sourceCardType: card.type, star: card.star, kind: 'beam', params: p,
          });
          break;
        case 'mortarMorph':
          if (binding.trigger === 'passive') m.weaponForms.push({
            sourceCardId: card.id, sourceCardType: card.type, star: card.star, kind: 'mortar', params: p,
          });
          break;
        case 'aura':
          if (binding.trigger === 'passive') {
            m.auras.push({
              key: `aura:${card.id}:${bindingIndex}`,
              sourceCardType: card.type,
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

interface ExpectedEquipmentSummon {
  card: Card;
  bindingIndex: number;
  effect: EffectDef;
}

function equipmentSummonMatches(summon: Summon, expected: ExpectedEquipmentSummon, baseDamage: number): boolean {
  const p = expected.effect.params ?? {};
  const kind = String(p.kind ?? 'decoy');
  const hp = num(p, 'hp', 40);
  const tauntRadius = num(p, 'tauntRadius', kind === 'orbital' ? 0 : 140);
  const explode = p.explode === true;
  return summon.kind === kind
    && summon.maxHp === hp
    && summon.remaining === undefined
    && summon.tauntRadius === tauntRadius
    && summon.priorityWeight === num(p, 'priorityWeight', 1)
    && summon.damageRatio === num(p, 'damageRatio', 0.3)
    && !!summon.explodeOnDeath === explode
    && (!explode || (summon.explodeOnDeath?.damage === baseDamage * num(p, 'explodeDamageMul', 1.5)
      && summon.explodeOnDeath.knockbackDistance === num(p, 'knockbackDistance', 80)))
    && !!summon.respawnOnce === (p.respawnOnce === true);
}

/**
 * 声明式装备被动对账：清理失去来源的召唤物、收敛重复实例，并立即补齐当前装备绑定。
 * 临时/消耗态召唤物没有 source 标记，不参与此生命周期。
 */
export function reconcileEquipmentPassives(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const expected = new Map<string, ExpectedEquipmentSummon>();
  for (const { card, binding, bindingIndex } of equippedBindings(state)) {
    const summonEffect = binding.effects.find(effect => effect.atom === 'summon');
    if (summonEffect) expected.set(`${card.id}:${bindingIndex}`, { card, bindingIndex, effect: summonEffect });
  }

  const kept = new Set<string>();
  for (let i = state.summons.length - 1; i >= 0; i--) {
    const summon = state.summons[i];
    if (summon.sourceCardId == null || summon.sourceBindingIndex == null) continue;
    const key = `${summon.sourceCardId}:${summon.sourceBindingIndex}`;
    if (!expected.has(key) || kept.has(key)) state.summons.splice(i, 1);
    else kept.add(key);
  }

  const baseDamage = totalDamage(state, config);
  for (const [key, item] of expected) {
    const existing = state.summons.find(s =>
      s.sourceCardId === item.card.id && s.sourceBindingIndex === item.bindingIndex);
    if (existing && equipmentSummonMatches(existing, item, baseDamage)) continue;
    const ctx = baseCtx(state, config, rng, item.card.star, {}, {
      cardId: item.card.id, cardType: item.card.type, bindingIndex: item.bindingIndex,
    });
    runEffects(ctx, [item.effect]);
    events.push(...ctx.events);
    kept.add(key);
  }
  return events;
}

/**
 * 消耗释放：R1–R4——失去该卡、落点=效果空间锚点、即时或 ≤5s。
 * 由 equipmentSystem.consumeCard 调用（含锁定校验/移除卡牌），本函数只做效果结算。
 */
export function releaseConsumable(state: GameState, config: Config, rng: Rng, cardType: string, star: number, x: number, y: number): GameEvent[] {
  const def = DEFS.get(cardType);
  if (!def) return [];
  const tier = applyBuildScalingToTier(state, def, resolveConsumableTier(def, star));
  const ctx: EffectCtx = {
    state, config, rng,
    events: [],
    origin: { x, y },
    radius: tier.radius,
    duration: tier.duration,
    star,
    baseDamage: totalDamage(state, config),
    consume: true,
    sourceCardType: cardType,
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
