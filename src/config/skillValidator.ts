import type { SkillsConfig } from './types';

const CATEGORIES = new Set(['projectile', 'control', 'domain', 'economy', 'defense']);
const BUILD_TAGS = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
const TIERS: Record<string, string> = { '3': 'core', '5': 'dual', '6': 'transform' };
const CARD_KEYS = new Set(['id', 'category', 'synergyTags', 'textKey', 'teaching', 'stars', 'amplifyAxis', 'consumable', 'implementationBatch', 'designNotes']);

function fail(path: string, message: string): never { throw new Error(`[skills-schema v0.4.0] ${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}
function effects(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1) fail(path, '必须是非空效果数组');
  value.forEach((item, i) => {
    const e = object(item, `${path}[${i}]`);
    if (typeof e.atom !== 'string') fail(`${path}[${i}].atom`, '缺少效果原子');
    for (const key of Object.keys(e)) if (key !== 'atom' && key !== 'params') fail(`${path}[${i}].${key}`, '不允许的字段');
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
    if (!CATEGORIES.has(String(card.category))) fail(`${path}.category`, '非法类别');
    if (!Array.isArray(card.synergyTags) || card.synergyTags.length < 1 || card.synergyTags.length > 2) {
      fail(`${path}.synergyTags`, '必须是长度为 1~2 的非空数组');
    }
    if (card.synergyTags.some(tag => !BUILD_TAGS.has(String(tag)))) fail(`${path}.synergyTags`, '包含非法流派标签');
    if (new Set(card.synergyTags).size !== card.synergyTags.length) fail(`${path}.synergyTags`, '流派标签不得重复');
    if (typeof card.textKey !== 'string' || typeof card.teaching !== 'boolean') fail(path, '缺少 textKey/teaching');
    const stars = object(card.stars, `${path}.stars`);
    if (Object.keys(stars).sort().join(',') !== '3,5,6') fail(`${path}.stars`, '必须且只能定义 3/5/6 锚点');
    for (const [star, tierName] of Object.entries(TIERS)) {
      const tier = object(stars[star], `${path}.stars.${star}`);
      if (tier.tier !== tierName) fail(`${path}.stars.${star}.tier`, `必须为 ${tierName}`);
      if (!Array.isArray(tier.equip) || tier.equip.length < 1) fail(`${path}.stars.${star}.equip`, '必须是非空绑定数组');
      tier.equip.forEach((rawBinding, i) => {
        const binding = object(rawBinding, `${path}.stars.${star}.equip[${i}]`);
        if (typeof binding.trigger !== 'string') fail(`${path}.stars.${star}.equip[${i}].trigger`, '缺少触发器');
        effects(binding.effects, `${path}.stars.${star}.equip[${i}].effects`);
      });
    }
    const axis = object(card.amplifyAxis, `${path}.amplifyAxis`);
    const params = object(axis.params, `${path}.amplifyAxis.params`);
    if (!Object.keys(params).length || Object.values(params).some(v => typeof v !== 'string')) fail(`${path}.amplifyAxis.params`, '至少一个字符串增量');
    const consumable = object(card.consumable, `${path}.consumable`);
    if (consumable.placement !== 'point') fail(`${path}.consumable.placement`, '必须为 point');
    const anchors = object(consumable.anchors, `${path}.consumable.anchors`);
    if (Object.keys(anchors).sort().join(',') !== '1,3,6') fail(`${path}.consumable.anchors`, '必须且只能定义 1/3/6 锚点');
    for (const star of ['1', '3', '6']) effects(object(anchors[star], `${path}.consumable.anchors.${star}`).effects, `${path}.consumable.anchors.${star}.effects`);
  });
}
