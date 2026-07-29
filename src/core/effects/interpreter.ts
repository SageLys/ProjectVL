// 通用效果解释器：触发器 → 装备态绑定 → 效果原子；消耗态 → 落点释放。
// GameEvent 流是触发器总线（P2 §3），本模块把 8 个触发器接到各系统的结算点上。
// 卡 = 数据（CardDef JSON）。本模块不认识任何具体卡，禁止每卡硬编码 if。
//
// 被动融合契约（与装备槽顺序无关）：
//   数值乘数乘法叠加；加法数值相加（breachReduction 封顶 0.9）；阈值取最高；
//   novaOnBreak 卡内后写覆盖、跨卡 damage/knockbackDistance 分轴取最大；
//   expiryConvert 卡内后写覆盖、跨卡按规范来源顺序连乘失败概率；taunt 按来源候选权重仲裁并回退；
//   slow/vulnerable/freeze/stun 交给 statusSystem 取最强并延长；aura 按来源并行；
//   所有触发绑定独立触发且所有攻击形态必须经过统一攻击管线；summon 每(卡,绑定)单实例（B2）；
//   shield 的 absorbHits 取最大、regenSeconds 取最小；weaponForm 按正交轴确定性融合。
import { cfg } from '../../config';
import type { RunBaseStatKind } from '../../config/types';
import type { AttackInstance, Bullet, Card, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng, Summon, WeaponImpactSpec } from '../types';
import type { AtomName, BindingDef, CardDef, EffectDef, Trigger } from './defs';
import { atomBooleanDefault, atomNumberDefault, atomStringDefault, effectParams } from './atomContract';
import { ATOMS, runEffects, type EffectCtx } from './registry';
import { totalDamage } from '../stats';
import { applyBuildScalingToBindings, applyBuildScalingToTier } from '../systems/buildModifierSystem';
import { recordCardImpact, recordCardTrigger, totalEnemyHp } from '../../telemetry/combatCounters';
import { activateConsumableAffixes, equipmentAffixAdd } from '../systems/cardAffixSystem';
import { modifierTotal } from '../systems/runtimeStatModifierSystem';
import { isControlled } from './statusSystem';

export const FUSION_RULES = [
  '数值乘数(dropRateMul/dropLifetimeMul/xpMul): 乘法叠加',
  '加法数值(thorns/breachReduction): 加法，breachReduction 上限 0.9',
  '阈值(execute): 取最高',
  '破盾新星(novaOnBreak): 卡内后写覆盖，跨卡 damage/knockbackDistance 分轴取最大',
  '过期转化(expiryConvert): 卡内后写覆盖，跨卡按规范来源顺序连乘失败概率',
  '嘲讽(taunt): 同来源 upsert，跨来源按 priorityWeight/remaining/sourceKey 仲裁并回退',
  '状态(slow/vulnerable/freeze/stun): statusSystem 取最强，时长取最大',
  '光环/领域(aura): 按来源独立并行',
  '触发绑定: 所有装备独立触发，所有攻击形态经过统一攻击管线',
  '召唤物(summon): 每个(卡,绑定)单实例（B2）',
  '护盾(shield): absorbHits 取最大，regenSeconds 取最小',
  '主炮形态(weaponForm): delivery/impact/cadence 正交轴确定性融合',
] as const;

/**
 * Passive no-op atoms wired into getModifiers; kept explicit for config audits.
 * Legacy modifiers below are not uniformly trigger-filtered; the two merge-economy atoms
 * enforce passive locally. Do not broaden that cleanup here because existing cards rely on it.
 */
export const MODIFIER_ATOMS_HANDLED = [
  'dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert',
  'mergeMaterialRefund', 'wildcardRewardBonus',
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
/** 换形参数的兜底同样取自 ATOM_CONTRACT，保证 passive 聚合与触发式调用同源。 */
const formParam = (p: Record<string, unknown>, atom: 'beamMorph' | 'mortarMorph', key: string): number =>
  formNumber(p, key, atomNumberDefault(atom, key));

let cachedFusionAreaMul = Number.NaN;
let cachedFusionRadiusScale = 1;

/** areaMul 可被 variant 热切换；仅在配置值变化时重算对应的半径倍率。 */
function fusionRadiusScale(): number {
  const areaMul = cfg.combat.weaponFusion.areaMul;
  if (areaMul !== cachedFusionAreaMul) {
    cachedFusionAreaMul = areaMul;
    cachedFusionRadiusScale = Math.sqrt(areaMul);
  }
  return cachedFusionRadiusScale;
}

/**
 * 主炮形态正交融合：先按 cardType（再按 id）排序，再独立选择 delivery 与叠加 impact。
 * delivery 覆盖轴由最强 beam 胜出且全额生效；impact 叠加轴仅对第 2 个及之后的 mortar 衰减。
 */
export function composeWeaponForm(forms: WeaponFormContribution[]): WeaponFormSpec {
  const sorted = [...forms].sort((a, b) =>
    a.sourceCardType.localeCompare(b.sourceCardType) || a.sourceCardId - b.sourceCardId);
  const beams = sorted.filter(form => form.kind === 'beam');
  const mortars = sorted.filter(form => form.kind === 'mortar');
  let delivery: WeaponFormSpec['delivery'] = 'projectile';
  let deliveryDamageRatio = 1;
  let interval = atomNumberDefault('beamMorph', 'interval');
  let duration = atomNumberDefault('beamMorph', 'duration');
  let tickInterval = atomNumberDefault('beamMorph', 'tickInterval');
  let width = atomNumberDefault('beamMorph', 'width');
  let sourceStar = 0;
  let sourceCardType: CardType | undefined;
  const suppressedSourceCardTypes: CardType[] = [];
  const impacts: WeaponImpactSpec[] = [];

  const winningBeam = beams.reduce<WeaponFormContribution | undefined>((winner, form) => {
    if (!winner) return form;
    return formParam(form.params, 'beamMorph', 'damageRatio')
      > formParam(winner.params, 'beamMorph', 'damageRatio') ? form : winner;
  }, undefined);
  if (winningBeam) {
    delivery = 'line';
    deliveryDamageRatio = formParam(winningBeam.params, 'beamMorph', 'damageRatio');
    interval = formParam(winningBeam.params, 'beamMorph', 'interval');
    duration = formParam(winningBeam.params, 'beamMorph', 'duration');
    tickInterval = formParam(winningBeam.params, 'beamMorph', 'tickInterval');
    width = formParam(winningBeam.params, 'beamMorph', 'width');
    sourceStar = winningBeam.star;
    sourceCardType = winningBeam.sourceCardType;
    suppressedSourceCardTypes.push(...beams
      .filter(form => form !== winningBeam)
      .map(form => form.sourceCardType));
  } else if (mortars.length > 0) {
    // mortar 的核心轴是 aoe；没有 line 时才用第一个 mortar 作为 lob 投递包装。
    delivery = 'lob';
    sourceStar = mortars[0].star;
    sourceCardType = mortars[0].sourceCardType;
  }

  mortars.forEach((form, index) => {
    const damping = index === 0 ? 1 : cfg.combat.weaponFusion.damping;
    impacts.push({
      kind: 'aoe',
      sourceCardType: form.sourceCardType,
      sourceStar: form.star,
      damageRatio: formParam(form.params, 'mortarMorph', 'damageRatio') * damping,
      radius: formParam(form.params, 'mortarMorph', 'radius') * (index === 0 ? 1 : fusionRadiusScale()),
      falloff: formParam(form.params, 'mortarMorph', 'falloff'),
    });
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
  if (!def.evolutionTree) {
    return def.recipeOnly && star >= 6 ? clone(def.stars['6'].equip) : [];
  }
  if (evolutionPath.length === 0) return [];

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
    const bindings = applyBuildScalingToBindings(
      state,
      def,
      resolveCardBindings(def, card.evolutionPath ?? [], card.star),
      card.type,
    );
    for (let i = 0; i < bindings.length; i++) yield { card, def, binding: bindings[i], bindingIndex: i };
  }
}

/** 触发执行也遵守槽位无关契约；同卡内仍按原 bindingIndex 顺序。 */
export interface EquippedBindingSource {
  card: Card;
  def: CardDef;
  binding: BindingDef;
  bindingIndex: number;
}

/** 稳定绑定来源序：卡类型 → 卡实例 id → 卡内 bindingIndex；绝不读取装备槽号。 */
export function compareBindingSource(a: EquippedBindingSource, b: EquippedBindingSource): number {
  return a.card.type.localeCompare(b.card.type)
    || a.card.id - b.card.id
    || a.bindingIndex - b.bindingIndex;
}

function orderedEquippedBindings(state: GameState): EquippedBindingSource[] {
  return [...equippedBindings(state)].sort(compareBindingSource);
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
  if (status === 'controlled') return isControlled(enemy);
  if (status === 'brand') return enemy.status.brand !== null;
  if (status === 'vulnerable') return enemy.status.vulnerable !== null;
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
  for (const { card, binding, bindingIndex } of orderedEquippedBindings(state)) {
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
  for (const { card, binding, bindingIndex } of orderedEquippedBindings(state)) {
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
  mergeMaterialRefunds: {
    refundChance: number;
    count: number;
    star: number;
    scope: 'merge' | 'feed' | 'both';
  }[];
  wildcardRewardBonuses: {
    bonusChance: number;
    count: number;
    scope: 'bounty' | 'boss' | 'both';
  }[];
  expiryConvert: { ratio: number } | null;
  weaponForms: WeaponFormContribution[];
  auras: { key: string; sourceCardId: number; sourceCardType: CardType; sourceBindingIndex: number; radius: number | null; radiusRatioOfRange: number | null; tickInterval: number; effects: EffectDef[]; star: number }[];
  equipmentAffixAdd: Record<RunBaseStatKind, number>;
}

const num = (p: Record<string, unknown> | undefined, k: string, d: number): number =>
  p && typeof p[k] === 'number' ? (p[k] as number) : d;
const str = (p: Record<string, unknown>, k: string, d: string): string =>
  typeof p[k] === 'string' ? (p[k] as string) : d;
/** passive 聚合路径的兜底：同样只认 ATOM_CONTRACT（scope='passive' 覆盖触发路径的默认值）。 */
const passiveNum = (p: Record<string, unknown>, atom: AtomName, k: string): number =>
  num(p, k, atomNumberDefault(atom, k, { scope: 'passive' }));

/** 融合契约常量（非原子参数）：突破减免加法叠加后的硬上限。 */
const BREACH_REDUCTION_CAP = 0.9;

export function fuseNovaOnBreak(
  perCard: { damage: number; knockbackDistance: number }[],
): { damage: number; knockbackDistance: number } | null {
  if (perCard.length === 0) return null;
  let damage = perCard[0].damage;
  let knockbackDistance = perCard[0].knockbackDistance;
  for (let i = 1; i < perCard.length; i++) {
    damage = Math.max(damage, perCard[i].damage);
    knockbackDistance = Math.max(knockbackDistance, perCard[i].knockbackDistance);
  }
  return { damage, knockbackDistance };
}

export function fuseExpiryConvert(perCard: number[]): { ratio: number } | null {
  if (perCard.length === 0) return null;
  let failureProbability = 1;
  for (const ratio of perCard) failureProbability *= 1 - ratio;
  return { ratio: 1 - failureProbability };
}

export function getModifiers(state: GameState): Modifiers {
  const runtimeDropRate = modifierTotal(state, 'dropRateMul');
  const runtimeDropLifetime = modifierTotal(state, 'dropLifetimeMul');
  const runtimeXp = modifierTotal(state, 'xpMul');
  const m: Modifiers = {
    dropRateMul: runtimeDropRate.mul + runtimeDropRate.add,
    dropLifetimeMul: runtimeDropLifetime.mul + runtimeDropLifetime.add,
    xpMul: runtimeXp.mul + runtimeXp.add,
    thornsRatio: 0, breachReduction: 0, executeThreshold: 0,
    novaOnBreak: null, mergeMaterialRefunds: [], wildcardRewardBonuses: [], expiryConvert: null,
    weaponForms: [],
    auras: [],
    equipmentAffixAdd: {
      damageAdd: equipmentAffixAdd(state, 'damageAdd'),
      fireRateAdd: equipmentAffixAdd(state, 'fireRateAdd'),
      rangeAdd: equipmentAffixAdd(state, 'rangeAdd'),
      multiAdd: equipmentAffixAdd(state, 'multiAdd'),
      maxHpAdd: equipmentAffixAdd(state, 'maxHpAdd'),
      heal: equipmentAffixAdd(state, 'heal'),
    },
  };
  const novaByCard = new Map<number, { damage: number; knockbackDistance: number }>();
  const expiryConvertByCard = new Map<number, number>();
  for (const { card, binding, bindingIndex } of orderedEquippedBindings(state)) {
    for (const ef of binding.effects) {
      const p = effectParams(ef);
      switch (ef.atom) {
        case 'dropRateMul': m.dropRateMul *= passiveNum(p, 'dropRateMul', 'mul'); break;
        case 'dropLifetimeMul': m.dropLifetimeMul *= passiveNum(p, 'dropLifetimeMul', 'mul'); break;
        case 'xpMul': m.xpMul *= passiveNum(p, 'xpMul', 'mul'); break;
        case 'thorns': m.thornsRatio += passiveNum(p, 'thorns', 'ratio'); break;
        case 'breachReduction':
          m.breachReduction = Math.min(BREACH_REDUCTION_CAP, m.breachReduction + passiveNum(p, 'breachReduction', 'ratio'));
          break;
        case 'execute':
          m.executeThreshold = Math.max(m.executeThreshold, passiveNum(p, 'execute', 'hpThresholdRatio'));
          break;
        case 'novaOnBreak':
          novaByCard.set(card.id, {
            damage: passiveNum(p, 'novaOnBreak', 'damage'),
            knockbackDistance: passiveNum(p, 'novaOnBreak', 'knockbackDistance'),
          });
          break;
        case 'mergeMaterialRefund':
          if (binding.trigger === 'passive') m.mergeMaterialRefunds.push({
            refundChance: passiveNum(p, 'mergeMaterialRefund', 'refundChance'),
            count: passiveNum(p, 'mergeMaterialRefund', 'count'),
            star: passiveNum(p, 'mergeMaterialRefund', 'star'),
            scope: str(p, 'scope', atomStringDefault('mergeMaterialRefund', 'scope')) as 'merge' | 'feed' | 'both',
          });
          break;
        case 'wildcardRewardBonus':
          if (binding.trigger === 'passive') m.wildcardRewardBonuses.push({
            bonusChance: passiveNum(p, 'wildcardRewardBonus', 'bonusChance'),
            count: passiveNum(p, 'wildcardRewardBonus', 'count'),
            scope: str(p, 'scope', atomStringDefault('wildcardRewardBonus', 'scope')) as 'bounty' | 'boss' | 'both',
          });
          break;
        case 'expiryConvert':
          expiryConvertByCard.set(card.id, passiveNum(p, 'expiryConvert', 'ratio'));
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
              sourceCardId: card.id,
              sourceCardType: card.type,
              sourceBindingIndex: bindingIndex,
              radius: typeof p.radius === 'number' ? (p.radius as number) : null,
              radiusRatioOfRange: typeof p.radiusRatioOfRange === 'number' ? (p.radiusRatioOfRange as number) : null,
              tickInterval: passiveNum(p, 'aura', 'tickInterval'),
              effects: Array.isArray(p.effects) ? (p.effects as EffectDef[]) : [],
              star: card.star,
            });
          }
          break;
        default: break;
      }
    }
  }
  m.novaOnBreak = fuseNovaOnBreak([...novaByCard.values()]);
  m.expiryConvert = fuseExpiryConvert([...expiryConvertByCard.values()]);
  return m;
}

interface ExpectedEquipmentSummon {
  card: Card;
  bindingIndex: number;
  effectIndex: number;
  effect: EffectDef;
}

function equipmentSummonMatches(summon: Summon, expected: ExpectedEquipmentSummon, baseDamage: number): boolean {
  const p = effectParams(expected.effect);
  const summonNum = (key: string, variant?: string): number =>
    num(p, key, atomNumberDefault('summon', key, { variant }));
  const summonBool = (key: string): boolean =>
    typeof p[key] === 'boolean' ? (p[key] as boolean) : atomBooleanDefault('summon', key);
  const kind = str(p, 'kind', atomStringDefault('summon', 'kind'));
  const explode = summonBool('explode');
  return summon.kind === kind
    && summon.maxHp === summonNum('hp')
    && summon.remaining === undefined
    && summon.tauntRadius === summonNum('tauntRadius', kind)
    && summon.priorityWeight === summonNum('priorityWeight')
    && summon.damageRatio === summonNum('damageRatio')
    && summon.fireInterval === summonNum('fireInterval', kind)
    && !!summon.explodeOnDeath === explode
    && (!explode || (summon.explodeOnDeath?.damage === baseDamage * summonNum('explodeDamageMul')
      && summon.explodeOnDeath.knockbackDistance === summonNum('knockbackDistance')))
    && !!summon.respawnOnce === summonBool('respawnOnce');
}

/**
 * 声明式装备被动对账：清理失去来源的召唤物、收敛重复实例，并立即补齐当前装备绑定。
 * 临时/消耗态召唤物没有 source 标记，不参与此生命周期。
 */
export function reconcileEquipmentPassives(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const expected = new Map<string, ExpectedEquipmentSummon>();
  for (const { card, binding, bindingIndex } of orderedEquippedBindings(state)) {
    const effectIndex = binding.effects.findIndex(effect => effect.atom === 'summon');
    if (effectIndex < 0) continue;
    const summonEffect = binding.effects[effectIndex];
    if (effectParams(summonEffect).replacesEarlier === true) {
      for (const [key, item] of expected) {
        if (item.card.id === card.id) expected.delete(key);
      }
    }
    expected.set(`${card.id}:${bindingIndex}`, { card, bindingIndex, effectIndex, effect: summonEffect });
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
    if (existing && equipmentSummonMatches(existing, item, baseDamage)) {
      existing.sourceCardType = item.card.type;
      existing.sourceEffectIndex = item.effectIndex;
      continue;
    }
    const ctx = baseCtx(state, config, rng, item.card.star, {}, {
      cardId: item.card.id, cardType: item.card.type, bindingIndex: item.bindingIndex,
    });
    runEffects(ctx, [item.effect], item.effectIndex);
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
  activateConsumableAffixes(state, cardType);
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
