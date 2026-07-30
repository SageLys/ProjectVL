import type { CardAffixCandidateDef, SkillsConfig } from './types';
import { AFFIX_SINKS, type AffixScalingTarget } from './affixSinks';
import type { AtomName } from '../core/effects/defs';
import { ATOM_CONTRACT, TRIGGER_NAMES, atomContract, type AtomParamSpec } from '../core/effects/atomContract';
import designFingerprints from './base/designFingerprints.json';

const CATEGORIES = new Set(['projectile', 'control', 'domain', 'economy', 'defense']);
const BUILD_TAGS = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
/** 原子清单与参数契约的唯一来源：core/effects/atomContract.ts。此处不得再手抄。 */
const ATOMS = new Set<string>(Object.keys(ATOM_CONTRACT));
const TRIGGERS = new Set<string>(TRIGGER_NAMES);
const ORIGIN_SELECTORS = new Set(['turret', 'point', 'densestCluster', 'nearestEnemy', 'nearestToBreachLine']);
const SCALE_SOURCES = new Set([
  'statusStacks', 'shieldTier', 'thornsRatio', 'auraReduction', 'enemiesOnField', 'enemiesInAura',
  'controlledInAura', 'secondsSinceLastBreach', 'killsSinceLastRelease', 'mergesThisRun',
  'pickupsThisWave', 'summonsAlive',
]);
const STATUS_IDS = new Set(['controlled', 'frozen', 'slow', 'stun', 'stunned', 'vulnerable', 'dot', 'brand']);
/** 词条属性同理派生自 AFFIX_SINKS（`Record<CardAffixStatKind, …>`），不再手抄第二份。 */
const CARD_STATS = new Set<string>(Object.keys(AFFIX_SINKS));
const TIERS: Record<string, string> = { '3': 'core', '5': 'dual', '6': 'transform' };
const CARD_KEYS = new Set([
  'id', 'god', 'primaryGod', 'sourceGods', 'identityContract', 'category', 'synergyTags', 'textKey', 'teaching', 'stars', 'amplifyAxis',
  'consumable', 'evolutionTree', 'affixPool', 'fusionPolicy', 'recipeOnly', 'implementationBatch', 'designNotes',
]);
/** D2 预留字段的合法值域；字段本身可选，缺省即今日行为。 */
const FUSION_TRANSFER = new Set(['none', 'strongest', 'sum', 'average']);
const FUSION_CONFLICT = new Set(['keepHigher', 'keepNewer', 'reject']);

const SKILLS_SCHEMA_VERSION = '0.6.0';
const RUN_BASE_STATS = new Set([
  'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
]);

function fail(path: string, message: string): never {
  throw new Error(`[skills-schema v${SKILLS_SCHEMA_VERSION}] ${path}: ${message}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}
/** 效果所处的结算场景：装备态绑定（带触发器）或消耗态落点释放。 */
type EffectScope = ({ kind: 'equip'; trigger: string } | { kind: 'consume' }) & { inForEach?: boolean };

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
    if (e.forEach !== undefined) {
      if (scope.inForEach) fail(`${at}.forEach`, 'forEach 不得递归嵌套');
      for (const key of Object.keys(e)) if (!['forEach', 'at', 'atom', 'params', 'scaleBy'].includes(key)) fail(`${at}.${key}`, 'forEach 包装器不允许该字段');
      if (e.at !== undefined && !ORIGIN_SELECTORS.has(String(e.at))) fail(`${at}.at`, '非法投放原点');
      const fanout = object(e.forEach, `${at}.forEach`);
      for (const key of Object.keys(fanout)) if (!['set', 'maxTargets', 'order', 'effects'].includes(key)) fail(`${at}.forEach.${key}`, '不允许的字段');
      const set = object(fanout.set, `${at}.forEach.set`);
      if (!['enemiesWithStatus', 'enemiesWithoutStatus', 'ownZones', 'ownSummons'].includes(String(set.kind))) fail(`${at}.forEach.set.kind`, '非法集合');
      if (set.kind === 'enemiesWithStatus') {
        const statuses = Array.isArray(set.status) ? set.status : [set.status];
        if (!statuses.length || statuses.some(status => !STATUS_IDS.has(String(status)))) fail(`${at}.forEach.set.status`, '必须是合法状态或非空状态数组');
      }
      if (set.kind === 'enemiesWithoutStatus' && !STATUS_IDS.has(String(set.status))) fail(`${at}.forEach.set.status`, '必须是合法状态');
      if (set.kind === 'ownSummons' && set.summonKind !== undefined && typeof set.summonKind !== 'string') fail(`${at}.forEach.set.summonKind`, '必须是字符串');
      if (!Number.isInteger(fanout.maxTargets) || Number(fanout.maxTargets) < 1 || Number(fanout.maxTargets) > 8) fail(`${at}.forEach.maxTargets`, '必须是 1..8 的整数');
      if (fanout.order !== undefined && fanout.order !== 'nearest' && fanout.order !== 'farthest') fail(`${at}.forEach.order`, '必须是 nearest/farthest');
      effects(fanout.effects, `${at}.forEach.effects`, { ...scope, inForEach: true });
      return;
    }
    if (typeof e.atom !== 'string' || !ATOMS.has(e.atom)) fail(`${at}.atom`, '非法效果原子');
    for (const key of Object.keys(e)) if (!['atom', 'params', 'at', 'scaleBy'].includes(key)) fail(`${at}.${key}`, '不允许的字段');
    if (e.at !== undefined && !ORIGIN_SELECTORS.has(String(e.at))) fail(`${at}.at`, '非法投放原点');
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

    if (e.scaleBy !== undefined) {
      const scale = object(e.scaleBy, `${at}.scaleBy`);
      for (const key of Object.keys(scale)) if (!['source', 'param', 'perUnit', 'cap'].includes(key)) fail(`${at}.scaleBy.${key}`, '不允许的字段');
      const source = String(scale.source);
      const concurrent = source.startsWith('concurrentStatus:') && STATUS_IDS.has(source.slice('concurrentStatus:'.length));
      if (!SCALE_SOURCES.has(source) && !concurrent) fail(`${at}.scaleBy.source`, '非法动态量来源');
      if (typeof scale.param !== 'string' || !(scale.param in params)) fail(`${at}.scaleBy.param`, '必须指向同一效果 params 中已存在的参数');
      if (typeof scale.perUnit !== 'number' || !Number.isFinite(scale.perUnit)) fail(`${at}.scaleBy.perUnit`, '必须是有限数值');
      if (typeof scale.cap !== 'number' || !Number.isFinite(scale.cap) || scale.cap < 0) fail(`${at}.scaleBy.cap`, '必须是非负有限数值');
    }

    // 少数原子的跨参数约束，无法由单参数契约表达。
    if (atom === 'restore' && typeof params.amount !== 'number' && typeof params.amountRatio !== 'number') {
      fail(`${at}.params`, 'restore 必须声明 amount 或 amountRatio');
    }
    if (atom === 'statBuff') {
      if (Number(params.duration) <= 0) fail(`${at}.params.duration`, '必须大于 0');
      if (params.operation === 'mul' && Number(params.value) <= 0) fail(`${at}.params.value`, '乘法值必须大于 0');
    }
    if ((atom === 'aura' || atom === 'groundZone') && params.radiusOverTime !== undefined) {
      const radius = object(params.radiusOverTime, `${at}.params.radiusOverTime`);
      if (typeof radius.from !== 'number' || radius.from < 0 || typeof radius.to !== 'number' || radius.to < 0) fail(`${at}.params.radiusOverTime`, 'from/to 必须是非负数');
      if (radius.easing !== undefined && radius.easing !== 'linear') fail(`${at}.params.radiusOverTime.easing`, '仅支持 linear');
    }
    for (const key of ['effects', 'onDeathEffects', 'intervalEffects', 'auraEffects']) {
      const nestedScope = atom === 'charge' && scope.kind === 'equip'
        ? { ...scope, trigger: 'interval' }
        : scope;
      if (Array.isArray(params[key])) effects(params[key], `${at}.params.${key}`, nestedScope);
    }
  });
}
function bindings(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空绑定数组');
  value.forEach((rawBinding, i) => {
    const binding = object(rawBinding, `${path}[${i}]`);
    if (typeof binding.trigger !== 'string' || !TRIGGERS.has(binding.trigger)) {
      fail(`${path}[${i}].trigger`, '缺少或非法触发器');
    }
    for (const key of Object.keys(binding)) if (!['trigger', 'triggerParams', 'effects', 'at'].includes(key)) fail(`${path}[${i}].${key}`, '不允许的字段');
    if (binding.at !== undefined && !ORIGIN_SELECTORS.has(String(binding.at))) fail(`${path}[${i}].at`, '非法投放原点');
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
    if (RUN_BASE_STATS.has(String(candidate.stat))) {
      fail(
        `${candidatePath}.stat`,
        '基础属性平加由 waveRewards 独占，卡牌词条请使用 damageMul/fireRateMul/rangeMul/maxHpMul',
      );
    }
    if (!CARD_STATS.has(String(candidate.stat))) fail(`${candidatePath}.stat`, '非法词条属性');
    for (const key of ['weight', 'min', 'max', 'step', 'consumableDuration']) {
      if (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key])) fail(`${candidatePath}.${key}`, '必须是有限数值');
    }
    if (Number(candidate.weight) <= 0) fail(`${candidatePath}.weight`, '必须大于 0');
    if (Number(candidate.step) <= 0) fail(`${candidatePath}.step`, '必须大于 0');
    if (Number(candidate.max) < Number(candidate.min)) fail(candidatePath, 'max 不得小于 min');
    if (Number(candidate.consumableDuration) < 0) fail(`${candidatePath}.consumableDuration`, '不得小于 0');
    // Composite recipe products use the primary-god affix template. Their two-god
    // mechanisms intentionally span multiple sinks, so sink reachability remains
    // enforced on ordinary single-god cards only.
    if (card.recipeOnly !== true) validateAffixSink(card, candidate as unknown as CardAffixCandidateDef, candidatePath);
  });
}

type LooseBinding = {
  trigger?: unknown;
  triggerParams?: Record<string, unknown>;
  at?: unknown;
  effects?: unknown;
};

const GOD_IDENTITY_ATOMS: Record<string, ReadonlySet<string>> = {
  storm: new Set(['chain', 'vulnerable', 'stun', 'ricochet']),
  winter: new Set(['slow', 'freeze', 'taunt']),
  inferno: new Set(['dot', 'groundZone']),
  bulwark: new Set(['shield', 'thorns', 'breachReduction', 'novaOnBreak', 'mergeMaterialRefund']),
  plenty: new Set(['focusPriority', 'dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert', 'mergePulse', 'wildcardRewardBonus']),
};
const ATOM_OWNER = new Map<string, string>();
for (const [god, atoms] of Object.entries(GOD_IDENTITY_ATOMS)) for (const atom of atoms) ATOM_OWNER.set(atom, god);
const OVERWRITE_ATOMS = new Set(['shield', 'novaOnBreak', 'expiryConvert', 'execute']);
const DIRECT_DEAD_TARGET_ATOMS = new Set(['burstDamage', 'slow', 'freeze', 'stun', 'vulnerable', 'dot', 'knockback', 'execute']);
const warnedFingerprints = new Set<string>();
const warnedIdentityContracts = new Set<string>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(objectValue).sort().map(key => [key, canonical(objectValue[key])]));
}

function exactBranchFingerprint(equip: unknown): string {
  if (!Array.isArray(equip)) return '';
  return equip.map(binding => JSON.stringify(canonical(binding))).sort().join('|');
}

function branchPrimitiveMarkers(option: Record<string, unknown>): Set<string> {
  const markers = new Set<string>();
  visitBindingsInObject(option.equip, binding => {
    if (typeof binding.at === 'string') markers.add(`at:${binding.at}`);
  });
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.at === 'string') markers.add(`at:${item.at}`);
    const scale = item.scaleBy as Record<string, unknown> | undefined;
    if (typeof scale?.source === 'string') markers.add(`scaleBy:${scale.source}`);
    const fanout = item.forEach as Record<string, unknown> | undefined;
    const set = fanout?.set as Record<string, unknown> | undefined;
    if (typeof set?.kind === 'string') markers.add(`forEach:${set.kind}`);
    const params = item.params as Record<string, unknown> | undefined;
    if (params?.radiusOverTime) markers.add('radiusOverTime');
    if (params?.follow) markers.add('follow');
    if (params?.shape === 'line') markers.add('shape:line');
    Object.values(item).forEach(walk);
  };
  walk(option.equip);
  return markers;
}

function validateCrossCardAndDesignFingerprints(cards: Record<string, unknown>[]): void {
  const seen = new Map<string, { cardId: string; branchId: string }>();
  const fixtureCards = designFingerprints.cards as Record<string, {
    identityContract: string;
    branches: Record<string, { star: number; triggers: string[]; atoms: string[]; at?: string; requires?: string[] }>;
  }>;
  for (const card of cards.filter(candidate => candidate.recipeOnly !== true)) {
    const cardId = String(card.id);
    const expectedCard = fixtureCards[cardId];
    if (!expectedCard) fail('$.cards', `V16：${cardId} 缺少设计指纹卡条目`);
    const tree = card.evolutionTree as Record<string, unknown>;
    const checkpoints = tree.checkpoints as Record<string, unknown>[];
    const actualIds = new Set<string>();
    for (const checkpoint of checkpoints) for (const rawOption of checkpoint.options as Record<string, unknown>[]) {
      const option = rawOption as Record<string, unknown>;
      const branchId = String(option.id);
      actualIds.add(branchId);
      const fingerprint = exactBranchFingerprint(option.equip);
      const prior = seen.get(fingerprint);
      if (prior && prior.cardId !== cardId) {
        fail('$.cards', `V15：跨卡分支完全同构 ${prior.cardId}/${prior.branchId} = ${cardId}/${branchId}`);
      }
      seen.set(fingerprint, { cardId, branchId });

      const expected = expectedCard.branches[branchId];
      if (!expected) fail('$.cards', `V16：${cardId}/${branchId} 缺少设计指纹分支条目`);
      if (expected.star !== checkpoint.star) fail('$.cards', `V16：${cardId}/${branchId} 星级不符`);
      const triggers = new Set<string>();
      const atoms = new Set<string>();
      visitBindingsInObject(option.equip, binding => { if (typeof binding.trigger === 'string') triggers.add(binding.trigger); });
      visitEffectsInObject(option.equip, effect => { if (typeof effect.atom === 'string') atoms.add(effect.atom); });
      const missingTriggers = expected.triggers.filter(trigger => !triggers.has(trigger));
      if (missingTriggers.length) fail('$.cards', `V16：${cardId}/${branchId} 缺触发器 ${missingTriggers.join(',')}`);
      const missingAtoms = expected.atoms.filter(atom => !atoms.has(atom));
      if (missingAtoms.length) fail('$.cards', `V16：${cardId}/${branchId} 缺核心原子 ${missingAtoms.join(',')}`);
      const markers = branchPrimitiveMarkers(option);
      if (expected.at && !markers.has(`at:${expected.at}`)) fail('$.cards', `V16：${cardId}/${branchId} 投放原点应为 ${expected.at}`);
      const missingRequirements = (expected.requires ?? []).filter(marker => !markers.has(marker));
      if (missingRequirements.length) fail('$.cards', `V16：${cardId}/${branchId} 缺原语 ${missingRequirements.join(',')}`);
    }
    const missingEntries = Object.keys(expectedCard.branches).filter(id => !actualIds.has(id));
    if (missingEntries.length) fail('$.cards', `V16：${cardId} 缺实现分支 ${missingEntries.join(',')}`);

    const contract = String(card.identityContract ?? '');
    const eventWords: Array<[string, string]> = [['突破', 'onBreach'], ['击杀', 'onKill'], ['拾取', 'onPickup'], ['合成', 'onMerge']];
    for (const [word, trigger] of eventWords) {
      if (!contract.includes(word)) continue;
      const hasTrigger = checkpoints.some(checkpoint => (checkpoint.options as Record<string, unknown>[]).some(candidate => {
        let found = false;
        visitBindingsInObject(candidate.equip, binding => { if (binding.trigger === trigger) found = true; });
        return found;
      }));
      const warningKey = `${cardId}:${trigger}`;
      if (!hasTrigger && !warnedIdentityContracts.has(warningKey)) {
        warnedIdentityContracts.add(warningKey);
        console.warn(`[skills-schema v${SKILLS_SCHEMA_VERSION}] V17 warning: ${cardId} identityContract 含“${word}”但无 ${trigger}`);
      }
    }
  }
  for (const card of cards.filter(candidate => candidate.recipeOnly === true)) {
    const cardId = String(card.id);
    const equip = ((card.stars as Record<string, Record<string, unknown>>)?.['6']?.equip);
    const fingerprint = exactBranchFingerprint(equip);
    const prior = seen.get(fingerprint);
    if (prior && prior.cardId !== cardId) fail('$.cards', `V15：跨卡分支完全同构 ${prior.cardId}/${prior.branchId} = ${cardId}/6★`);
    seen.set(fingerprint, { cardId, branchId: '6★' });
  }
  for (const fixtureId of Object.keys(fixtureCards)) {
    if (!cards.some(card => card.recipeOnly !== true && card.id === fixtureId)) fail('$.cards', `V16：设计指纹中的 ${fixtureId} 无实现卡`);
  }
}

function visitEffects(value: unknown, visit: (effect: Record<string, unknown>) => void): void {
  if (!Array.isArray(value)) return;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const effect = raw as Record<string, unknown>;
    if (typeof effect.atom === 'string') visit(effect);
    const fanout = effect.forEach;
    if (fanout && typeof fanout === 'object' && !Array.isArray(fanout)) {
      visitEffects((fanout as Record<string, unknown>).effects, visit);
    }
    const params = effect.params;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      visitEffects((params as Record<string, unknown>).effects, visit);
    }
  }
}

function bindingFingerprint(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(raw => {
    const binding = raw as LooseBinding;
    const atoms: string[] = [];
    visitEffects(binding.effects, effect => {
      atoms.push(String(effect.atom));
      const scale = effect.scaleBy as Record<string, unknown> | undefined;
      if (scale?.source) atoms.push(`scaleBy:${String(scale.source)}`);
      if (effect.at) atoms.push(`at:${String(effect.at)}`);
    });
    return `${String(binding.trigger)}@${String(binding.at ?? 'default')}:${[...new Set(atoms)].sort().join('+')}`;
  }).sort().join('|');
}

function bindingParamKeys(value: unknown, excludeZeroFallback = false): Set<string> {
  const result = new Set<string>();
  if (!Array.isArray(value)) return result;
  for (const raw of value) {
    const binding = raw as LooseBinding;
    visitEffects(binding.effects, effect => {
      const params = effect.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) return;
      if (excludeZeroFallback && effect.atom === 'statBuff' && Number((params as Record<string, unknown>).value) === 1.03) return;
      for (const key of Object.keys(params as Record<string, unknown>)) {
        if (!['effects', 'spreadParams', 'spreadStatus', 'kind', 'stat', 'operation'].includes(key)) result.add(key);
      }
    });
  }
  return result;
}

function producesGodResource(god: string, value: unknown): boolean {
  let produced = false;
  visitEffectsInObject(value, effect => {
    const atom = String(effect.atom);
    if (GOD_IDENTITY_ATOMS[god]?.has(atom)) produced = true;
    if (god === 'storm' && atom === 'chain') {
      const params = effect.params as Record<string, unknown> | undefined;
      if (params?.spreadStatus === 'vulnerable') produced = true;
    }
  });
  return produced;
}

function validateDesignRules(card: Record<string, unknown>, path: string): void {
  if (typeof card.identityContract !== 'string' || !card.identityContract.trim()) {
    fail(`${path}.identityContract`, 'V14：每张卡必须有非空身份契约');
  }
  const recipeOnly = card.recipeOnly === true;
  if (recipeOnly) {
    if (typeof card.primaryGod !== 'string' || !card.primaryGod) fail(`${path}.primaryGod`, 'recipeOnly 产物必须声明 primaryGod');
    if (!Array.isArray(card.sourceGods) || card.sourceGods.length < 1
      || card.sourceGods.some(god => typeof god !== 'string' || !god)) {
      fail(`${path}.sourceGods`, 'recipeOnly 产物必须声明非空 sourceGods');
    }
    if (/灰盒|占位|B0/.test(JSON.stringify(card))) {
      fail(path, '正式 recipeOnly 产物不得包含“灰盒”“占位”或“B0”');
    }
  } else if (card.primaryGod !== undefined || card.sourceGods !== undefined) {
    fail(path, 'primaryGod/sourceGods 仅允许 recipeOnly 产物声明');
  }

  const tree = card.evolutionTree as Record<string, unknown> | undefined;
  if (!tree) return;
  const checkpoints = Array.isArray(tree.checkpoints) ? tree.checkpoints as Record<string, unknown>[] : [];
  const checkpoint3 = checkpoints.find(checkpoint => checkpoint.star === 3);
  const checkpoint5 = checkpoints.find(checkpoint => checkpoint.star === 5);
  const options3 = Array.isArray(checkpoint3?.options) ? checkpoint3.options as Record<string, unknown>[] : [];
  const options5 = Array.isArray(checkpoint5?.options) ? checkpoint5.options as Record<string, unknown>[] : [];

  const fingerprints3 = options3.map(option => bindingFingerprint(option.equip));
  if (new Set(fingerprints3).size !== fingerprints3.length) {
    fail(`${path}.evolutionTree.checkpoints[3].options`, 'V1：3★ 三选项的载体/触发器指纹必须两两不同');
  }
  const god = String(card.god ?? '');
  // The prose-era V2 heuristic required every 3★ route to carry a god-owned
  // atom, which forced copied filler onto event-identity cards (notably
  // retribution). V16 now validates each route against its authored atoms and
  // trigger, so the heuristic is intentionally retired.

  const roles = options5.map(option => option.interfaceRole);
  if (roles.some(role => !['payoff', 'spread', 'convert'].includes(String(role)))
    || new Set(roles).size !== 3) {
    fail(`${path}.evolutionTree.checkpoints[5].options`, 'V3/V14：5★ 三选项必须各覆盖 payoff/spread/convert 且互不相同');
  }

  const sharedNodes = Array.isArray(tree.sharedNodes) ? tree.sharedNodes as Record<string, unknown>[] : [];
  const amplify = sharedNodes.find(node => node.star === 4)?.amplify as Record<string, unknown> | undefined;
  const branch3Params = new Set<string>();
  options3.forEach(option => bindingParamKeys(option.equip).forEach(key => branch3Params.add(key)));
  for (const key of Object.keys(amplify ?? {})) {
    if (!branch3Params.has(key)) fail(`${path}.evolutionTree.sharedNodes[4].amplify.${key}`, '4★ amplify 键必须在至少一个 3★ 分支中真实存在');
  }
  const branch5Params = new Set<string>();
  options5.forEach(option => bindingParamKeys(option.equip, true).forEach(key => branch5Params.add(key)));
  const paramAtoms = (options: Record<string, unknown>[], key: string): Set<string> => {
    const atoms = new Set<string>();
    options.forEach(option => visitEffectsInObject(option.equip, effect => {
      const params = effect.params as Record<string, unknown> | undefined;
      if (params && key in params) atoms.add(String(effect.atom));
    }));
    return atoms;
  };
  const collision = Object.keys(amplify ?? {}).filter(key => {
    if (!branch5Params.has(key)) return false;
    const atoms3 = paramAtoms(options3, key);
    const atoms5 = paramAtoms(options5, key);
    return [...atoms3].some(atom => atoms5.has(atom));
  });
  if (collision.length) fail(`${path}.evolutionTree.sharedNodes[4].amplify`, `V4：不得与 5★ 强化同一参数（${collision.join(',')}）`);

  // V5's former "second unconditional binding" representation was not an else
  // branch: it also fired when the condition succeeded and silently added a
  // copied statBuff to many cards. Conditional fallback requires a dedicated
  // runtime branch primitive; until then the v4 prose remains descriptive and
  // V16 validates the required gated carrier without manufacturing extra atoms.

  const allowedGods = recipeOnly
    ? new Set((card.sourceGods as unknown[]).map(String))
    : new Set([god]);
  const cardData = [card.stars, card.evolutionTree, card.consumable];
  for (const block of cardData) visitEffectsInObject(block, effect => {
    const owner = ATOM_OWNER.get(String(effect.atom));
    if (!owner || allowedGods.has(owner)) return;
    // A non-burning coordinate zone is a neutral carrier; inferno identity is
    // only claimed when dot is nested inside it.
    if (effect.atom === 'groundZone') {
      let hasDot = false;
      visitEffects((effect.params as Record<string, unknown> | undefined)?.effects, nested => { if (nested.atom === 'dot') hasDot = true; });
      if (!hasDot) return;
    }
    fail(path, `V6：${recipeOnly ? 'recipeOnly 产物' : '普通卡'}不得使用 sourceGods 之外的身份原子 ${String(effect.atom)}(${owner})`);
  });

  const comboFingerprints = new Set<string>();
  for (const option3 of options3) for (const option5 of options5) {
    const fingerprint = bindingFingerprint([...(option3.equip as unknown[]), ...(option5.equip as unknown[])]);
    if (comboFingerprints.has(fingerprint)) fail(path, 'V7：九宫格组合出现重复绑定集合');
    comboFingerprints.add(fingerprint);
  }

  for (const block of cardData) validateDeadTargetBindings(block, path);
  const requiresSource: string[] = [];
  for (const block of cardData) visitBindingsInObject(block, binding => {
    const source = binding.triggerParams?.requiresSource;
    if (source !== undefined) requiresSource.push(String(source));
  });
  const invalidSources = requiresSource.filter(source => !['weapon', 'chain', 'dot'].includes(source));
  if (invalidSources.length) fail(path, `V11：requiresSource 非法（${[...new Set(invalidSources)].join(',')}）`);

  const hasDotGate = options5.some(option => {
    let yes = false;
    visitBindingsInObject(option, b => { if (b.triggerParams?.requiresStatus === 'dot') yes = true; });
    return yes;
  });
  if (hasDotGate && !options3.some(option => {
    let directDot = false;
    visitEffectsInObject(option.equip, effect => { if (effect.atom === 'dot') directDot = true; });
    return directDot;
  })) fail(path, 'V9：requiresStatus=dot 必须有本神直接 dot 供给分支');

  const shared6 = sharedNodes.find(node => node.star === 6)?.equip;
  const sixAtoms = new Set<string>();
  visitEffectsInObject(shared6, effect => { if (OVERWRITE_ATOMS.has(String(effect.atom))) sixAtoms.add(String(effect.atom)); });
  const branchAtoms = new Set<string>();
  visitEffectsInObject(checkpoints, effect => { if (OVERWRITE_ATOMS.has(String(effect.atom))) branchAtoms.add(String(effect.atom)); });
  const overwrites = [...sixAtoms].filter(atom => branchAtoms.has(atom));
  if (overwrites.length) fail(path, `V10：6★ 不得覆盖分支原子（${overwrites.join(',')}）`);
}

function visitEffectsInObject(value: unknown, visit: (effect: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitEffectsInObject(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.atom === 'string') visit(item);
  for (const child of Object.values(item)) visitEffectsInObject(child, visit);
}

function visitBindingsInObject(value: unknown, visit: (binding: LooseBinding) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitBindingsInObject(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.trigger === 'string' && Array.isArray(item.effects)) visit(item as LooseBinding);
  for (const child of Object.values(item)) visitBindingsInObject(child, visit);
}

function validateDeadTargetBindings(value: unknown, path: string): void {
  visitBindingsInObject(value, binding => {
    if (binding.trigger !== 'onKill' && binding.trigger !== 'onBreach') return;
    for (const raw of Array.isArray(binding.effects) ? binding.effects : []) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const effect = raw as Record<string, unknown>;
      const spatial = binding.at === 'point' || ORIGIN_SELECTORS.has(String(effect.at));
      if (DIRECT_DEAD_TARGET_ATOMS.has(String(effect.atom)) && !spatial) {
        fail(path, `V8：${binding.trigger} 不得直接作用已移除的单体敌人（${String(effect.atom)}）`);
      }
    }
  });
}

function validateAnchorContracts(cards: Record<string, unknown>[]): void {
  const anchors: Record<string, [string, string]> = {
    storm: ['chainLightning', 'pierce'], winter: ['frost', 'impact'], inferno: ['scorch', 'splitBlast'],
    bulwark: ['aegis', 'thorns'], plenty: ['harvest', 'fateLoom'],
  };
  for (const [god, [setupId, payoffId]] of Object.entries(anchors)) {
    const setup = cards.find(card => card.id === setupId);
    const payoff = cards.find(card => card.id === payoffId);
    if (!setup || !payoff) fail('$.cards', `V12：${god} 必须恰有铺设锚 ${setupId} 与兑现锚 ${payoffId}`);
    const tree = setup.evolutionTree as Record<string, unknown>;
    const cp3 = (tree.checkpoints as Record<string, unknown>[]).find(cp => cp.star === 3)!;
    if (!(cp3.options as Record<string, unknown>[]).every(option => producesGodResource(god, option.equip))) {
      fail('$.cards', `V12：${setupId} 未履行铺设锚合同`);
    }
    const payoffTree = payoff.evolutionTree as Record<string, unknown>;
    const cp5 = (payoffTree.checkpoints as Record<string, unknown>[]).find(cp => cp.star === 5)!;
    if (!(cp5.options as Record<string, unknown>[]).some(option => option.interfaceRole === 'payoff')) {
      fail('$.cards', `V12：${payoffId} 未履行兑现锚合同`);
    }
  }
}

function warnCrossGodCategoryFingerprints(cards: Record<string, unknown>[]): void {
  const seen = new Map<string, { id: string; god: string }>();
  for (const card of cards.filter(card => card.recipeOnly !== true)) {
    const tree = card.evolutionTree as Record<string, unknown>;
    const cp3 = (tree.checkpoints as Record<string, unknown>[]).find(cp => cp.star === 3)!;
    const signature = `${String(card.category)}:${bindingFingerprint((cp3.options as Record<string, unknown>[])[0].equip)}`;
    const prior = seen.get(signature);
    if (prior && prior.god !== card.god) {
      const warning = `V13:${prior.id}:${String(card.id)}`;
      if (!warnedFingerprints.has(warning)) {
        warnedFingerprints.add(warning);
        console.warn(`[skills-schema v${SKILLS_SCHEMA_VERSION}] V13 warning: ${prior.id} 与 ${String(card.id)} 的 category/3★ 指纹重复`);
      }
    } else seen.set(signature, { id: String(card.id), god: String(card.god) });
  }
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
    validateDesignRules(card, path);
  });
  validateAnchorContracts(root.cards as Record<string, unknown>[]);
  warnCrossGodCategoryFingerprints(root.cards as Record<string, unknown>[]);
  validateCrossCardAndDesignFingerprints(root.cards as Record<string, unknown>[]);
}
