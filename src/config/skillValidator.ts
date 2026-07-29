import type { CardAffixCandidateDef, SkillsConfig } from './types';
import { AFFIX_SINKS, type AffixScalingTarget } from './affixSinks';
import type { AtomName } from '../core/effects/defs';
import { ATOM_CONTRACT, TRIGGER_NAMES, atomContract, type AtomParamSpec } from '../core/effects/atomContract';

const CATEGORIES = new Set(['projectile', 'control', 'domain', 'economy', 'defense']);
const BUILD_TAGS = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
/** 原子清单与参数契约的唯一来源：core/effects/atomContract.ts。此处不得再手抄。 */
const ATOMS = new Set<string>(Object.keys(ATOM_CONTRACT));
const TRIGGERS = new Set<string>(TRIGGER_NAMES);
/** 词条属性同理派生自 AFFIX_SINKS（`Record<CardStatKind, …>`），不再手抄第二份。 */
const CARD_STATS = new Set<string>(Object.keys(AFFIX_SINKS));
const TIERS: Record<string, string> = { '3': 'core', '5': 'dual', '6': 'transform' };
const CARD_KEYS = new Set([
  'id', 'god', 'category', 'synergyTags', 'textKey', 'teaching', 'stars', 'amplifyAxis',
  'consumable', 'evolutionTree', 'affixPool', 'fusionPolicy', 'recipeOnly', 'implementationBatch', 'designNotes',
]);
/** D2 预留字段的合法值域；字段本身可选，缺省即今日行为。 */
const FUSION_TRANSFER = new Set(['none', 'strongest', 'sum', 'average']);
const FUSION_CONFLICT = new Set(['keepHigher', 'keepNewer', 'reject']);

const SKILLS_SCHEMA_VERSION = '0.5.0';

function fail(path: string, message: string): never {
  throw new Error(`[skills-schema v${SKILLS_SCHEMA_VERSION}] ${path}: ${message}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}
/** 效果所处的结算场景：装备态绑定（带触发器）或消耗态落点释放。 */
type EffectScope = { kind: 'equip'; trigger: string } | { kind: 'consume' };

function typeMatches(type: AtomParamSpec['type'], value: unknown, spec: AtomParamSpec): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some(t => {
    switch (t) {
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'integer': return typeof value === 'number' && Number.isInteger(value);
      case 'string': return typeof value === 'string';
      case 'boolean': return typeof value === 'boolean';
      case 'enum': return typeof value === 'string' && !!spec.enum?.includes(value);
      case 'effects': return Array.isArray(value);
      case 'record': return !!value && typeof value === 'object' && !Array.isArray(value);
      default: return false;
    }
  });
}

function typeLabel(type: AtomParamSpec['type'], spec: AtomParamSpec): string {
  const types = Array.isArray(type) ? type : [type];
  return types.map(t => (t === 'enum' ? `enum(${spec.enum?.join('|') ?? ''})` : t)).join(' | ');
}

function effectParam(spec: AtomParamSpec, value: unknown, path: string): void {
  if (!typeMatches(spec.type, value, spec)) fail(path, `必须是 ${typeLabel(spec.type, spec)}`);
  if (typeof value === 'number') {
    if (spec.min !== undefined && value < spec.min) fail(path, `不得小于 ${spec.min}`);
    if (spec.max !== undefined && value > spec.max) fail(path, `不得大于 ${spec.max}`);
  }
}

/** 按 ATOM_CONTRACT 逐条校验：非法原子/未声明参数/必填缺失/类型不符/超范围/非法触发器/装备态·消耗态支持。 */
function effects(value: unknown, path: string, scope: EffectScope): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空效果数组');
  value.forEach((item, i) => {
    const at = `${path}[${i}]`;
    const e = object(item, at);
    if (typeof e.atom !== 'string' || !ATOMS.has(e.atom)) fail(`${at}.atom`, '非法效果原子');
    for (const key of Object.keys(e)) if (key !== 'atom' && key !== 'params') fail(`${at}.${key}`, '不允许的字段');
    const atom = e.atom as AtomName;
    const contract = atomContract(atom);
    if (scope.kind === 'equip') {
      if (!contract.supports.equip) fail(`${at}.atom`, `${atom} 不支持装备态`);
      if (contract.allowedTriggers !== 'any'
        && !(contract.allowedTriggers as readonly string[]).includes(scope.trigger)) {
        fail(`${at}.atom`, `${atom} 不允许绑定到 ${scope.trigger}（允许：${contract.allowedTriggers.join('/')}）`);
      }
    } else if (!contract.supports.consume) {
      fail(`${at}.atom`, `${atom} 不支持消耗态`);
    }

    const params = e.params === undefined ? {} : object(e.params, `${at}.params`);
    for (const key of Object.keys(params)) {
      if (!contract.params[key]) fail(`${at}.params.${key}`, `${atom} 契约未声明该参数`);
    }
    for (const [key, spec] of Object.entries(contract.params)) {
      const raw = params[key];
      if (raw === undefined) {
        if (spec.required) fail(`${at}.params.${key}`, `${atom} 必填参数缺失`);
        continue;
      }
      effectParam(spec, raw, `${at}.params.${key}`);
    }

    // 少数原子的跨参数约束，无法由单参数契约表达。
    if (atom === 'restore' && typeof params.amount !== 'number' && typeof params.amountRatio !== 'number') {
      fail(`${at}.params`, 'restore 必须声明 amount 或 amountRatio');
    }
    if (atom === 'statBuff') {
      if (Number(params.duration) <= 0) fail(`${at}.params.duration`, '必须大于 0');
      if (params.operation === 'mul' && Number(params.value) <= 0) fail(`${at}.params.value`, '乘法值必须大于 0');
    }
    if (Array.isArray(params.effects)) effects(params.effects, `${at}.params.effects`, scope);
  });
}
function bindings(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空绑定数组');
  value.forEach((rawBinding, i) => {
    const binding = object(rawBinding, `${path}[${i}]`);
    if (typeof binding.trigger !== 'string' || !TRIGGERS.has(binding.trigger)) {
      fail(`${path}[${i}].trigger`, '缺少或非法触发器');
    }
    effects(binding.effects, `${path}[${i}].effects`, { kind: 'equip', trigger: binding.trigger });
  });
}
function evolutionTree(value: unknown, path: string): void {
  const tree = object(value, path);
  if (!Array.isArray(tree.checkpoints)) fail(`${path}.checkpoints`, '必须是数组');
  const checkpointStars = new Set<number>();
  tree.checkpoints.forEach((rawCheckpoint, checkpointIndex) => {
    const checkpointPath = `${path}.checkpoints[${checkpointIndex}]`;
    const checkpoint = object(rawCheckpoint, checkpointPath);
    if (checkpoint.star !== 3 && checkpoint.star !== 5) fail(`${checkpointPath}.star`, '只能为 3 或 5');
    if (checkpointStars.has(checkpoint.star)) fail(`${checkpointPath}.star`, '进化检查点星级不得重复');
    checkpointStars.add(checkpoint.star);
    if (!Array.isArray(checkpoint.options) || checkpoint.options.length !== 3) {
      fail(`${checkpointPath}.options`, '每个检查点必须恰好有 3 个选项');
    }
    const optionIds = new Set<string>();
    checkpoint.options.forEach((rawOption, optionIndex) => {
      const optionPath = `${checkpointPath}.options[${optionIndex}]`;
      const option = object(rawOption, optionPath);
      if (typeof option.id !== 'string' || !option.id) fail(`${optionPath}.id`, '必须是非空字符串');
      if (optionIds.has(option.id)) fail(`${optionPath}.id`, '同一检查点 option id 不得重复');
      optionIds.add(option.id);
      if (typeof option.textKey !== 'string' || !option.textKey) fail(`${optionPath}.textKey`, '必须是非空字符串');
      bindings(option.equip, `${optionPath}.equip`);
    });
  });
  for (const star of [3, 5]) {
    if (!checkpointStars.has(star)) fail(`${path}.checkpoints`, `必须包含 ${star} 星检查点`);
  }

  if (!Array.isArray(tree.sharedNodes)) fail(`${path}.sharedNodes`, '必须是数组');
  const sharedStars = new Set<number>();
  tree.sharedNodes.forEach((rawNode, nodeIndex) => {
    const nodePath = `${path}.sharedNodes[${nodeIndex}]`;
    const node = object(rawNode, nodePath);
    if (node.star !== 4 && node.star !== 6) fail(`${nodePath}.star`, '只能为 4 或 6');
    if (sharedStars.has(node.star)) fail(`${nodePath}.star`, '公共节点星级不得重复');
    sharedStars.add(node.star);
    if (node.equip !== undefined) bindings(node.equip, `${nodePath}.equip`);
    if (node.amplify !== undefined) {
      const amplify = object(node.amplify, `${nodePath}.amplify`);
      if (Object.values(amplify).some(item => typeof item !== 'string')) fail(`${nodePath}.amplify`, '值必须为字符串');
    }
  });
  for (const star of [4, 6]) {
    if (!sharedStars.has(star)) fail(`${path}.sharedNodes`, `必须包含 ${star} 星公共节点`);
  }
}
function matchingSinkValues(
  value: unknown,
  target: AffixScalingTarget,
  inheritedTrigger?: string,
  out: number[] = [],
): number[] {
  if (Array.isArray(value)) {
    for (const item of value) matchingSinkValues(item, target, inheritedTrigger, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const item = value as Record<string, unknown>;
  const trigger = typeof item.trigger === 'string' ? item.trigger : inheritedTrigger;
  if (item.atom === target.atom && (!target.trigger || trigger === target.trigger)) {
    const params = item.params;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const original = (params as Record<string, unknown>)[target.param];
      if (typeof original === 'number' && Number.isFinite(original)) out.push(original);
    }
  }
  for (const child of Object.values(item)) matchingSinkValues(child, target, trigger, out);
  return out;
}

function producesObservableChange(
  original: number,
  value: number,
  target: AffixScalingTarget,
): boolean {
  let next = target.mode === 'add' ? original + value : original * (1 + value);
  if (target.integer) next = Math.max(original, value > 0 ? Math.ceil(next) : Math.round(next));
  if (target.cap !== undefined) next = Math.min(target.cap, next);
  return target.integer ? next - original >= 1 : Math.abs(next - original) > 1e-9;
}

function validateAffixSink(
  card: Record<string, unknown>,
  candidate: CardAffixCandidateDef,
  path: string,
): void {
  const contract = AFFIX_SINKS[candidate.stat];
  if (contract.equipment === 'unsupported') {
    fail(`${path}.stat`, `${candidate.stat} does not support persistent equipment settlement`);
  }
  if (contract.equipment === 'global') {
    if (!contract.globalConsumer) fail(`${path}.stat`, `${candidate.stat} has no global consumer`);
    if (!(candidate.min > 0)) fail(`${path}.min`, `${candidate.stat} must produce a positive observable change`);
    return;
  }

  const equipmentData = card.recipeOnly === true ? card.stars : card.evolutionTree;
  const targets = contract.scalingTargets ?? [];
  const observable = targets.some(target => matchingSinkValues(equipmentData, target)
    .some(original => producesObservableChange(original, candidate.min, target)));
  if (!observable) {
    fail(
      `${path}.stat`,
      `${candidate.stat} has no reachable equipment atom/parameter sink with an observable minimum roll`,
    );
  }

  const consumableSink = targets.some(target => matchingSinkValues(card.consumable, target).length > 0);
  if (!consumableSink && !contract.globalConsumer) {
    fail(`${path}.stat`, `${candidate.stat} has no consumable anchor or global runtime sink`);
  }
}

function affixPool(value: unknown, path: string, card: Record<string, unknown>): void {
  const pool = object(value, path);
  if (!Number.isInteger(pool.count) || Number(pool.count) < 0) fail(`${path}.count`, '必须是非负整数');
  if (!Array.isArray(pool.candidates)) fail(`${path}.candidates`, '必须是数组');
  if (Number(pool.count) > pool.candidates.length) fail(`${path}.count`, '不得超过候选数量');
  pool.candidates.forEach((rawCandidate, index) => {
    const candidatePath = `${path}.candidates[${index}]`;
    const candidate = object(rawCandidate, candidatePath);
    if (!CARD_STATS.has(String(candidate.stat))) fail(`${candidatePath}.stat`, '非法词条属性');
    for (const key of ['weight', 'min', 'max', 'step', 'consumableDuration']) {
      if (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key])) fail(`${candidatePath}.${key}`, '必须是有限数值');
    }
    if (Number(candidate.weight) <= 0) fail(`${candidatePath}.weight`, '必须大于 0');
    if (Number(candidate.step) <= 0) fail(`${candidatePath}.step`, '必须大于 0');
    if (Number(candidate.max) < Number(candidate.min)) fail(candidatePath, 'max 不得小于 min');
    if (Number(candidate.consumableDuration) < 0) fail(`${candidatePath}.consumableDuration`, '不得小于 0');
    validateAffixSink(card, candidate as unknown as CardAffixCandidateDef, candidatePath);
  });
}

/**
 * D2 预留字段校验：只保证「声明了就得合法」，字段本身可选且运行时无消费者（Stage 5 实现）。
 * 现有 skills.json 一张卡都没声明——这是有意的，缺省即今日行为。
 */
function fusionPolicy(value: unknown, path: string): void {
  const policy = object(value, path);
  for (const key of Object.keys(policy)) {
    if (!['affixTransferPolicy', 'conflictResolution', 'sourceCardIds'].includes(key)) {
      fail(`${path}.${key}`, '不允许的字段');
    }
  }
  if (policy.affixTransferPolicy !== undefined && !FUSION_TRANSFER.has(String(policy.affixTransferPolicy))) {
    fail(`${path}.affixTransferPolicy`, `必须是 ${[...FUSION_TRANSFER].join('/')}`);
  }
  if (policy.conflictResolution !== undefined && !FUSION_CONFLICT.has(String(policy.conflictResolution))) {
    fail(`${path}.conflictResolution`, `必须是 ${[...FUSION_CONFLICT].join('/')}`);
  }
  if (policy.sourceCardIds !== undefined) {
    if (!Array.isArray(policy.sourceCardIds) || policy.sourceCardIds.some(id => typeof id !== 'string' || !id)) {
      fail(`${path}.sourceCardIds`, '必须是非空字符串数组');
    }
  }
}

/** 启动/构建共用的严格 v0.4.0 卡牌结构校验；失败即抛错，绝不降级。 */
export function validateSkillsConfig(value: unknown): asserts value is SkillsConfig {
  const root = object(value, '$');
  if (root.version !== SKILLS_SCHEMA_VERSION) fail('$.version', `必须等于 ${SKILLS_SCHEMA_VERSION}`);
  if (!Array.isArray(root.cards)) fail('$.cards', '必须是数组');
  root.cards.forEach((raw, index) => {
    const path = `$.cards[${index}]`; const card = object(raw, path);
    for (const key of Object.keys(card)) if (!CARD_KEYS.has(key)) fail(`${path}.${key}`, 'v0.4.0 不允许的字段');
    if (typeof card.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(card.id)) fail(`${path}.id`, '非法 id');
    if (typeof card.god !== 'string' || !card.god) fail(`${path}.god`, '必须是非空字符串');
    if (card.recipeOnly !== undefined && typeof card.recipeOnly !== 'boolean') fail(`${path}.recipeOnly`, '必须是布尔值');
    if (!CATEGORIES.has(String(card.category))) fail(`${path}.category`, '非法类别');
    if (!Array.isArray(card.synergyTags) || card.synergyTags.length < 1 || card.synergyTags.length > 2) {
      fail(`${path}.synergyTags`, '必须是长度为 1~2 的非空数组');
    }
    if (card.synergyTags.some(tag => !BUILD_TAGS.has(String(tag)))) fail(`${path}.synergyTags`, '包含非法流派标签');
    if (new Set(card.synergyTags).size !== card.synergyTags.length) fail(`${path}.synergyTags`, '流派标签不得重复');
    if (typeof card.textKey !== 'string' || typeof card.teaching !== 'boolean') fail(path, '缺少 textKey/teaching');
    const recipeOnly = card.recipeOnly === true;
    const stars = object(card.stars, `${path}.stars`);
    const expectedStars = recipeOnly ? '6' : '3,5,6';
    if (Object.keys(stars).sort().join(',') !== expectedStars) {
      fail(`${path}.stars`, recipeOnly ? '配方产物必须只定义 6★ 终态' : '正式卡必须且只能定义 3/5/6 迁移锚点');
    }
    for (const [star, tierName] of Object.entries(TIERS)) {
      if (stars[star] === undefined) continue;
      const tier = object(stars[star], `${path}.stars.${star}`);
      if (tier.tier !== tierName) fail(`${path}.stars.${star}.tier`, `必须为 ${tierName}`);
      bindings(tier.equip, `${path}.stars.${star}.equip`);
    }
    const axis = object(card.amplifyAxis, `${path}.amplifyAxis`);
    const params = object(axis.params, `${path}.amplifyAxis.params`);
    if (!Object.keys(params).length || Object.values(params).some(v => typeof v !== 'string')) fail(`${path}.amplifyAxis.params`, '至少一个字符串增量');
    const consumable = object(card.consumable, `${path}.consumable`);
    if (consumable.placement !== 'point') fail(`${path}.consumable.placement`, '必须为 point');
    const anchors = object(consumable.anchors, `${path}.consumable.anchors`);
    if (Object.keys(anchors).sort().join(',') !== '1,3,6') fail(`${path}.consumable.anchors`, '必须且只能定义 1/3/6 锚点');
    for (const star of ['1', '3', '6']) {
      effects(
        object(anchors[star], `${path}.consumable.anchors.${star}`).effects,
        `${path}.consumable.anchors.${star}.effects`,
        { kind: 'consume' },
      );
    }
    if (recipeOnly && card.evolutionTree !== undefined) fail(`${path}.evolutionTree`, '配方终态不得再有进化树');
    if (!recipeOnly && card.evolutionTree === undefined) fail(`${path}.evolutionTree`, '正式卡必须有完整进化树');
    if (card.evolutionTree !== undefined) evolutionTree(card.evolutionTree, `${path}.evolutionTree`);
    if (card.affixPool === undefined) fail(`${path}.affixPool`, '每张卡必须声明词条池');
    affixPool(card.affixPool, `${path}.affixPool`, card);
    if (card.fusionPolicy !== undefined) fusionPolicy(card.fusionPolicy, `${path}.fusionPolicy`);
  });
}
