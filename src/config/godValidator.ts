import type { GameConfig } from './types';

const RUN_BASE_STATS = new Set(['damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal']);
const BUILD_TAGS = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
const RELIC_RARITIES = new Set(['common', 'rare', 'epic']);
const warnedIncompleteRosters = new Set<string>();
const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

function fail(path: string, message: string): never {
  throw new Error(`[god-config v0.1.0] ${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item)) {
    fail(path, '必须是非空字符串数组');
  }
  return value as string[];
}

function versionedArray(value: unknown, key: string, path: string): unknown[] {
  if (value === undefined || value === null) return [];
  const root = object(value, path);
  if (root.version !== '0.1.0') fail(`${path}.version`, '必须等于 0.1.0');
  if (!Array.isArray(root[key])) fail(`${path}.${key}`, '必须是数组');
  return root[key] as unknown[];
}

/** C0 的跨配置契约校验；空的新域按兼容层处理，不改变旧玩法。 */
export function validateGodConfig(
  config: Pick<GameConfig, 'skills' | 'gods' | 'relics' | 'evolutionRecipes' | 'waveRewards'>,
): void {
  const cardDefs = config.skills.cards;
  const cardIds = new Set(cardDefs.map(card => card.id));
  const gods = versionedArray(config.gods, 'gods', '$.gods');
  const godIds = new Set<string>();
  const rosterCardIds = new Set<string>();

  for (const [index, raw] of gods.entries()) {
    const path = `$.gods.gods[${index}]`;
    const god = object(raw, path);
    if (typeof god.id !== 'string' || !god.id) fail(`${path}.id`, '必须是非空字符串');
    if (godIds.has(god.id)) fail(`${path}.id`, `重复的神 id: ${god.id}`);
    godIds.add(god.id);
    if (typeof god.textKey !== 'string' || !god.textKey) fail(`${path}.textKey`, '必须是非空字符串');

    const anchors = stringArray(god.anchorCardIds, `${path}.anchorCardIds`);
    const variables = stringArray(god.variableCardIds, `${path}.variableCardIds`);
    if (anchors.length > 2) fail(`${path}.anchorCardIds`, '首版最多 2 张身份锚点');
    if (variables.length > 5) fail(`${path}.variableCardIds`, '首版最多 5 张可变卡');
    for (const cardId of [...anchors, ...variables]) {
      if (!cardIds.has(cardId)) fail(path, `引用了不存在的卡: ${cardId}`);
      if (rosterCardIds.has(cardId)) fail(path, `卡牌归属重复: ${cardId}`);
      rosterCardIds.add(cardId);
    }
    if (new Set([...anchors, ...variables]).size !== anchors.length + variables.length) {
      fail(path, 'anchorCardIds / variableCardIds 不得重复');
    }
    if (god.mainRosterSize !== 5 || god.subRosterSize !== 3) {
      fail(path, '首版 mainRosterSize/subRosterSize 必须为 5/3（2 锚点 + 主神抽 3 / 副神抽 1）');
    }

    if (anchors.length < 2 || variables.length < 5) {
      const signature = `${god.id}:${anchors.length}:${variables.length}`;
      if (!isTestEnvironment && !warnedIncompleteRosters.has(signature)) {
        warnedIncompleteRosters.add(signature);
        console.warn(`[god-config] ${god.id} 卡位尚未补齐（锚点 ${anchors.length}/2，可变卡 ${variables.length}/5）；C0 兼容层继续加载。`);
      }
    }
  }

  // gods 域缺失或为空时跳过神归属约束，保留旧配置的零玩法变化兼容。
  if (gods.length) {
    for (const [index, card] of cardDefs.entries()) {
      if (typeof card.god !== 'string' || !godIds.has(card.god)) {
        fail(`$.skills.cards[${index}].god`, `必须引用 gods.json 中存在的神（收到 ${String(card.god)}）`);
      }
    }
  }

  const recipes = versionedArray(config.evolutionRecipes, 'recipes', '$.evolutionRecipes');
  for (const [index, raw] of recipes.entries()) {
    const path = `$.evolutionRecipes.recipes[${index}]`;
    const recipe = object(raw, path);
    if (typeof recipe.id !== 'string' || !recipe.id) fail(`${path}.id`, '必须是非空字符串');
    for (const ingredientKey of ['ingredientA', 'ingredientB'] as const) {
      const ingredient = object(recipe[ingredientKey], `${path}.${ingredientKey}`);
      if (typeof ingredient.cardId !== 'string' || !cardIds.has(ingredient.cardId)) {
        fail(`${path}.${ingredientKey}.cardId`, `引用了不存在的卡: ${String(ingredient.cardId)}`);
      }
      if (!Number.isInteger(ingredient.minStar) || Number(ingredient.minStar) < 1) {
        fail(`${path}.${ingredientKey}.minStar`, '必须是正整数');
      }
    }
    if (typeof recipe.outputCardId !== 'string' || !cardIds.has(recipe.outputCardId)) {
      fail(`${path}.outputCardId`, `引用了不存在的卡: ${String(recipe.outputCardId)}`);
    }
    if (!Number.isInteger(recipe.outputStar) || Number(recipe.outputStar) < 1) fail(`${path}.outputStar`, '必须是正整数');
    if (recipe.allowedPhase !== 'intermission') fail(`${path}.allowedPhase`, '必须为 intermission');
  }

  const rewards = versionedArray(config.waveRewards, 'rewards', '$.waveRewards');
  const rewardIds = new Set<string>();
  for (const [index, raw] of rewards.entries()) {
    const path = `$.waveRewards.rewards[${index}]`;
    const reward = object(raw, path);
    if (typeof reward.id !== 'string' || !reward.id) fail(`${path}.id`, '必须是非空字符串');
    if (rewardIds.has(reward.id)) fail(`${path}.id`, `重复的奖励 id: ${reward.id}`);
    rewardIds.add(reward.id);
    if (reward.waves !== 'all'
      && (!Array.isArray(reward.waves)
        || reward.waves.some(wave => !Number.isInteger(wave) || Number(wave) < 1))) {
      fail(`${path}.waves`, '必须为 all 或正整数波次数组');
    }
    const effect = object(reward.effect, `${path}.effect`);
    if (!RUN_BASE_STATS.has(String(effect.stat))) fail(`${path}.effect.stat`, `非法基础属性: ${String(effect.stat)}`);
    if (typeof effect.add !== 'number' || !Number.isFinite(effect.add)) {
      fail(`${path}.effect.add`, '必须是有限数值');
    }
  }

  const relics = versionedArray(config.relics, 'relics', '$.relics');
  for (const [index, raw] of relics.entries()) {
    const path = `$.relics.relics[${index}]`;
    const relic = object(raw, path);
    if (typeof relic.id !== 'string' || !relic.id) fail(`${path}.id`, '必须是非空字符串');
    if (relic.god !== undefined && (!godIds.has(String(relic.god)) || !gods.length)) {
      fail(`${path}.god`, `引用了不存在的神: ${String(relic.god)}`);
    }
    if (!RELIC_RARITIES.has(String(relic.rarity))) fail(`${path}.rarity`, '非法稀有度');
    const targetTags = stringArray(relic.targetTags, `${path}.targetTags`);
    if (targetTags.some(tag => !BUILD_TAGS.has(tag))) fail(`${path}.targetTags`, '包含非法机制标签');
    if (!Array.isArray(relic.effects)) fail(`${path}.effects`, '必须是数组');
    if (!Number.isInteger(relic.maxStacks) || Number(relic.maxStacks) < 1) fail(`${path}.maxStacks`, '必须是正整数');
  }
}
