import type { SkillsConfig } from './types';

const CATEGORIES = new Set(['projectile', 'control', 'domain', 'economy', 'defense']);
const BUILD_TAGS = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
const ATOMS = new Set([
  'pierce', 'chain', 'split', 'ricochet', 'aoeOnHit', 'beamMorph', 'mortarMorph',
  'slow', 'freeze', 'stun', 'knockback', 'taunt', 'vulnerable',
  'aura', 'groundZone', 'dot', 'summon',
  'dropRateMul', 'dropLifetimeMul', 'xpMul', 'extraDrop', 'expiryConvert', 'mergeRule', 'mergePulse',
  'shield', 'thorns', 'breachReduction', 'novaOnBreak', 'execute',
  'burstDamage', 'focusPriority', 'restore', 'statBuff',
]);
const RUNTIME_STATS = new Set([
  'damage', 'fireRate',
  'dropRateMul', 'dropLifetimeMul', 'xpMul',
  'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
  'effectDamageMul', 'quantityAdd', 'controlPotencyMul', 'controlledDamageTakenMul',
  'areaScaleMul', 'dotDamageMul', 'defenseDurabilityMul', 'retaliationMul',
]);
const CARD_STATS = new Set([
  'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
  'effectDamageMul', 'quantityAdd', 'controlPotencyMul', 'controlledDamageTakenMul',
  'areaScaleMul', 'dotDamageMul', 'defenseDurabilityMul', 'retaliationMul',
  'dropRateMul', 'dropLifetimeMul', 'xpMul',
]);
const TIERS: Record<string, string> = { '3': 'core', '5': 'dual', '6': 'transform' };
const CARD_KEYS = new Set([
  'id', 'god', 'category', 'synergyTags', 'textKey', 'teaching', 'stars', 'amplifyAxis',
  'consumable', 'evolutionTree', 'affixPool', 'recipeOnly', 'implementationBatch', 'designNotes',
]);

function fail(path: string, message: string): never { throw new Error(`[skills-schema v0.4.0] ${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}
function effects(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空效果数组');
  value.forEach((item, i) => {
    const e = object(item, `${path}[${i}]`);
    if (typeof e.atom !== 'string' || !ATOMS.has(e.atom)) fail(`${path}[${i}].atom`, '非法效果原子');
    for (const key of Object.keys(e)) if (key !== 'atom' && key !== 'params') fail(`${path}[${i}].${key}`, '不允许的字段');
    if (e.params !== undefined) {
      const params = object(e.params, `${path}[${i}].params`);
      if (e.atom === 'restore') {
        if (typeof params.amount !== 'number' && typeof params.amountRatio !== 'number') {
          fail(`${path}[${i}].params`, 'restore 必须声明 amount 或 amountRatio');
        }
        for (const key of ['amount', 'amountRatio']) {
          if (params[key] !== undefined
            && (typeof params[key] !== 'number' || !Number.isFinite(params[key]) || Number(params[key]) < 0)) {
            fail(`${path}[${i}].params.${key}`, '必须是非负有限数值');
          }
        }
      }
      if (e.atom === 'statBuff') {
        if (!RUNTIME_STATS.has(String(params.stat))) fail(`${path}[${i}].params.stat`, '非法运行时属性');
        if (params.operation !== 'add' && params.operation !== 'mul') {
          fail(`${path}[${i}].params.operation`, '必须为 add 或 mul');
        }
        for (const key of ['value', 'duration']) {
          if (typeof params[key] !== 'number' || !Number.isFinite(params[key])) {
            fail(`${path}[${i}].params.${key}`, '必须是有限数值');
          }
        }
        if (Number(params.duration) <= 0) fail(`${path}[${i}].params.duration`, '必须大于 0');
        if (params.operation === 'mul' && Number(params.value) <= 0) {
          fail(`${path}[${i}].params.value`, '乘法值必须大于 0');
        }
        if (params.maxStacks !== undefined
          && (!Number.isInteger(params.maxStacks) || Number(params.maxStacks) < 1)) {
          fail(`${path}[${i}].params.maxStacks`, '必须是正整数');
        }
      }
      if (Array.isArray(params.effects)) effects(params.effects, `${path}[${i}].params.effects`);
    }
  });
}
function bindings(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空绑定数组');
  value.forEach((rawBinding, i) => {
    const binding = object(rawBinding, `${path}[${i}]`);
    if (typeof binding.trigger !== 'string') fail(`${path}[${i}].trigger`, '缺少触发器');
    effects(binding.effects, `${path}[${i}].effects`);
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
function affixPool(value: unknown, path: string): void {
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
  });
}

/** 启动/构建共用的严格 v0.4.0 卡牌结构校验；失败即抛错，绝不降级。 */
export function validateSkillsConfig(value: unknown): asserts value is SkillsConfig {
  const root = object(value, '$');
  if (root.version !== '0.4.0') fail('$.version', '必须等于 0.4.0');
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
    for (const star of ['1', '3', '6']) effects(object(anchors[star], `${path}.consumable.anchors.${star}`).effects, `${path}.consumable.anchors.${star}.effects`);
    if (recipeOnly && card.evolutionTree !== undefined) fail(`${path}.evolutionTree`, '配方终态不得再有进化树');
    if (!recipeOnly && card.evolutionTree === undefined) fail(`${path}.evolutionTree`, '正式卡必须有完整进化树');
    if (card.evolutionTree !== undefined) evolutionTree(card.evolutionTree, `${path}.evolutionTree`);
    if (card.affixPool === undefined) fail(`${path}.affixPool`, '每张卡必须声明词条池');
    affixPool(card.affixPool, `${path}.affixPool`);
  });
}
