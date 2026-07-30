import type { GameConfig } from './types';

const RUN_BASE_STATS = new Set(['damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal']);
const WAVE_CHOICE_STATS = new Set(['damageAdd', 'fireRateAdd', 'maxHpAdd', 'rangeAdd', 'xpGainPct']);
const REQUIRED_WAVE_CHOICE_STATS = ['damageAdd', 'fireRateAdd', 'maxHpAdd', 'rangeAdd', 'xpGainPct'];
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

function versionedArray(value: unknown, key: string, path: string, version = '0.1.0'): unknown[] {
  if (value === undefined || value === null) return [];
  const root = object(value, path);
  if (root.version !== version) fail(`${path}.version`, `必须等于 ${version}`);
  if (!Array.isArray(root[key])) fail(`${path}.${key}`, '必须是数组');
  return root[key] as unknown[];
}

/** C0 的跨配置契约校验；空的新域按兼容层处理，不改变旧玩法。 */
export function validateGodConfig(
  config: Pick<GameConfig, 'skills' | 'gods' | 'evolutionRecipes' | 'waveRewards'>,
): void {
  const cardDefs = config.skills.cards;
  const cardIds = new Set(cardDefs.map(card => card.id));
  const gods = versionedArray(config.gods, 'gods', '$.gods');
  const godIds = new Set<string>();
  const rosterCardIds = new Set<string>();
  const anchorsByGod = new Map<string, string[]>();
  const variablesByGod = new Map<string, string[]>();

  for (const [index, raw] of gods.entries()) {
    const path = `$.gods.gods[${index}]`;
    const god = object(raw, path);
    if (typeof god.id !== 'string' || !god.id) fail(`${path}.id`, '必须是非空字符串');
    if (godIds.has(god.id)) fail(`${path}.id`, `重复的神 id: ${god.id}`);
    godIds.add(god.id);
    if (typeof god.textKey !== 'string' || !god.textKey) fail(`${path}.textKey`, '必须是非空字符串');

    const anchors = stringArray(god.anchorCardIds, `${path}.anchorCardIds`);
    const variables = stringArray(god.variableCardIds, `${path}.variableCardIds`);
    anchorsByGod.set(String(god.id), anchors);
    variablesByGod.set(String(god.id), variables);
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

  const recipes = versionedArray(config.evolutionRecipes, 'recipes', '$.evolutionRecipes', '0.2.0');
  if (recipes.length !== 25) fail('$.evolutionRecipes.recipes', `配方图必须恰好 25 条（当前 ${recipes.length}）`);
  const recipeIds = new Set<string>();
  const matrixCells = new Set<string>();
  const materialPairs = new Set<string>();
  const variableDegrees = new Map<string, number>();
  const anchorDegrees = new Map<string, number>();
  const materialDegrees = new Map<string, number>();
  const outputReferences = new Map<string, number>();
  const recipeKinds = { sameGod: 0, crossGod: 0 };
  const unorderedGodDirections = new Map<string, Set<string>>();
  const materialIds = new Set<string>();
  const outputIds = new Set<string>();
  const increment = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const visitEffects = (value: unknown, visit: (effect: Record<string, unknown>) => void): void => {
    if (Array.isArray(value)) { for (const item of value) visitEffects(item, visit); return; }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.atom === 'string') visit(item);
    for (const child of Object.values(item)) visitEffects(child, visit);
  };
  const visitBindings = (value: unknown, visit: (binding: Record<string, unknown>) => void): void => {
    if (Array.isArray(value)) { for (const item of value) visitBindings(item, visit); return; }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.trigger === 'string' && Array.isArray(item.effects)) visit(item);
    for (const child of Object.values(item)) visitBindings(child, visit);
  };

  for (const [index, raw] of recipes.entries()) {
    const path = `$.evolutionRecipes.recipes[${index}]`;
    const recipe = object(raw, path);
    if (typeof recipe.id === 'string' && recipeIds.has(recipe.id)) fail(`${path}.id`, `duplicate recipe id: ${recipe.id}`);
    if (typeof recipe.id === 'string') recipeIds.add(recipe.id);
    if (typeof recipe.id !== 'string' || !recipe.id) fail(`${path}.id`, '必须是非空字符串');
    const allowedKeys = new Set([
      'id', 'recipeType', 'variableGod', 'anchorGod', 'ingredientVariable', 'ingredientAnchor', 'outputCardId', 'outputStar',
    ]);
    for (const key of Object.keys(recipe)) if (!allowedKeys.has(key)) fail(`${path}.${key}`, 'v2 配方不允许该字段');
    if (recipe.recipeType !== 'sameGod' && recipe.recipeType !== 'crossGod') fail(`${path}.recipeType`, '必须为 sameGod/crossGod');
    recipeKinds[recipe.recipeType]++;
    const variableGod = String(recipe.variableGod);
    const anchorGod = String(recipe.anchorGod);
    if (!godIds.has(variableGod)) fail(`${path}.variableGod`, `引用了不存在的神: ${variableGod}`);
    if (!godIds.has(anchorGod)) fail(`${path}.anchorGod`, `引用了不存在的神: ${anchorGod}`);
    if ((variableGod === anchorGod) !== (recipe.recipeType === 'sameGod')) {
      fail(`${path}.recipeType`, 'sameGod 必须位于对角线，crossGod 必须位于非对角线');
    }
    const cell = `${variableGod}->${anchorGod}`;
    if (matrixCells.has(cell)) fail(path, `5×5 有向矩阵格重复: ${cell}`);
    matrixCells.add(cell);
    if (variableGod !== anchorGod) {
      const pair = [variableGod, anchorGod].sort().join('+');
      const directions = unorderedGodDirections.get(pair) ?? new Set<string>();
      directions.add(cell);
      unorderedGodDirections.set(pair, directions);
    }

    for (const ingredientKey of ['ingredientVariable', 'ingredientAnchor'] as const) {
      const ingredient = object(recipe[ingredientKey], `${path}.${ingredientKey}`);
      if (typeof ingredient.cardId !== 'string' || !cardIds.has(ingredient.cardId)) {
        fail(`${path}.${ingredientKey}.cardId`, `引用了不存在的卡: ${String(ingredient.cardId)}`);
      }
      if (ingredient.minStar !== 5) fail(`${path}.${ingredientKey}.minStar`, '配方材料必须恰好 5★');
      const materialCard = cardDefs.find(card => card.id === ingredient.cardId)!;
      if (materialCard.recipeOnly) fail(`${path}.${ingredientKey}.cardId`, 'recipeOnly 产物不得作为材料');
      materialIds.add(String(ingredient.cardId));
      increment(materialDegrees, String(ingredient.cardId));
    }
    const variable = object(recipe.ingredientVariable, `${path}.ingredientVariable`);
    const anchor = object(recipe.ingredientAnchor, `${path}.ingredientAnchor`);
    if (!variablesByGod.get(variableGod)?.includes(String(variable.cardId))) {
      fail(`${path}.ingredientVariable.cardId`, 'ingredientVariable 必须是 variableGod 的可变卡');
    }
    if (!anchorsByGod.get(anchorGod)?.includes(String(anchor.cardId))) {
      fail(`${path}.ingredientAnchor.cardId`, 'ingredientAnchor 必须是 anchorGod 的锚点卡');
    }
    increment(variableDegrees, String(variable.cardId));
    increment(anchorDegrees, String(anchor.cardId));
    const materialPair = [String(variable.cardId), String(anchor.cardId)].sort().join('+');
    if (materialPairs.has(materialPair)) fail(path, `无序材料对重复: ${materialPair}`);
    materialPairs.add(materialPair);
    const expectedId = `r_${String(variable.cardId)}_${String(anchor.cardId)}`;
    if (recipe.id !== expectedId) fail(`${path}.id`, `必须按 r_<可变卡>_<锚点卡> 命名（期望 ${expectedId}）`);

    if (typeof recipe.outputCardId !== 'string' || !cardIds.has(recipe.outputCardId)) {
      fail(`${path}.outputCardId`, `引用了不存在的卡: ${String(recipe.outputCardId)}`);
    }
    const outputCard = cardDefs.find(card => card.id === recipe.outputCardId);
    if (!outputCard?.recipeOnly) fail(`${path}.outputCardId`, 'recipe output must set recipeOnly: true');
    if (recipe.outputStar !== 6) fail(`${path}.outputStar`, '配方产物必须恰好 6★');
    if (outputCard) {
      if (outputCard.evolutionTree !== undefined) fail(`${path}.outputCardId`, 'recipeOnly 产物不得有 evolutionTree');
      if (Object.keys(outputCard.stars).join(',') !== '6') fail(`${path}.outputCardId`, "recipeOnly 产物必须只绑定 stars['6']");
      if (outputCard.primaryGod !== anchorGod) fail(`${path}.outputCardId`, '产物 primaryGod 必须等于 anchorGod');
      const expectedSources = new Set([variableGod, anchorGod]);
      const actualSources = new Set(outputCard.sourceGods ?? []);
      if (actualSources.size !== expectedSources.size || [...expectedSources].some(god => !actualSources.has(god))) {
        fail(`${path}.outputCardId`, '产物 sourceGods 必须恰好覆盖可变方与锚点方');
      }
      const overwriteCounts = new Map<string, number>();
      visitEffects(outputCard.stars['6'].equip, effect => {
        const name = String(effect.atom);
        if (['shield', 'novaOnBreak', 'expiryConvert', 'execute'].includes(name)) increment(overwriteCounts, name);
      });
      const duplicates = [...overwriteCounts].filter(([, count]) => count > 1).map(([atom]) => atom);
      if (duplicates.length) fail(`${path}.outputCardId`, `产物绑定重复声明覆盖类原子: ${duplicates.join(',')}`);
      visitBindings(outputCard.stars['6'].equip, binding => {
        if (binding.trigger !== 'onKill' && binding.trigger !== 'onBreach') return;
        for (const effect of binding.effects as Record<string, unknown>[]) {
          const effectiveAt = effect.at ?? binding.at;
          if (['burstDamage', 'slow', 'freeze', 'stun', 'vulnerable', 'dot', 'knockback', 'execute'].includes(String(effect.atom))
            && effectiveAt !== 'point') {
            fail(`${path}.outputCardId`, `${String(binding.trigger)} 产物效果必须使用坐标类原子`);
          }
        }
      });
    }
    if (outputIds.has(String(recipe.outputCardId))) fail(`${path}.outputCardId`, '产物 id 必须被唯一配方引用');
    outputIds.add(String(recipe.outputCardId));
    increment(outputReferences, String(recipe.outputCardId));
  }

  if (recipeKinds.sameGod !== 5 || recipeKinds.crossGod !== 20) {
    fail('$.evolutionRecipes.recipes', `必须恰好 5 sameGod + 20 crossGod（当前 ${recipeKinds.sameGod}+${recipeKinds.crossGod}）`);
  }
  for (const variableGod of godIds) for (const anchorGod of godIds) {
    if (!matrixCells.has(`${variableGod}->${anchorGod}`)) fail('$.evolutionRecipes.recipes', `5×5 矩阵缺格: ${variableGod}->${anchorGod}`);
  }
  for (const god of godIds) {
    if (!matrixCells.has(`${god}->${god}`)) fail('$.evolutionRecipes.recipes', `${god} 缺少同神配方`);
    const anchorDegreeSet = (anchorsByGod.get(god) ?? []).map(id => anchorDegrees.get(id) ?? 0).sort((a, b) => a - b);
    if (anchorDegreeSet.join(',') !== '2,3') fail('$.evolutionRecipes.recipes', `${god} 两张锚点度数必须为 {2,3}`);
  }
  for (const [pair, directions] of unorderedGodDirections) {
    if (directions.size !== 2) fail('$.evolutionRecipes.recipes', `无序神对 ${pair} 必须有两条反向配方`);
  }
  for (const variables of variablesByGod.values()) for (const id of variables) {
    if ((variableDegrees.get(id) ?? 0) !== 1) fail('$.evolutionRecipes.recipes', `可变卡 ${id} 度数必须恰好为 1`);
  }
  for (const [id, degree] of materialDegrees) if (degree > 3) fail('$.evolutionRecipes.recipes', `材料 ${id} 度数不得超过 3`);
  for (const id of outputIds) if (materialIds.has(id)) fail('$.evolutionRecipes.recipes', `产物 ${id} 不得作为任何配方材料`);
  const recipeOnlyCards = cardDefs.filter(card => card.recipeOnly);
  if (recipeOnlyCards.length !== 25) fail('$.skills.cards', `必须恰好有 25 张 recipeOnly 产物（当前 ${recipeOnlyCards.length}）`);
  for (const card of recipeOnlyCards) {
    if ((outputReferences.get(card.id) ?? 0) !== 1) fail('$.skills.cards', `recipeOnly 产物 ${card.id} 必须被恰好 1 条配方引用`);
  }

  const floorRewards = versionedArray(config.waveRewards, 'floor', '$.waveRewards', '0.2.0');
  const choiceRewards = versionedArray(config.waveRewards, 'choice', '$.waveRewards', '0.2.0');
  const rewardIds = new Set<string>();
  const validateRewardIdentityAndAdd = (reward: Record<string, unknown>, path: string): void => {
    if (typeof reward.id !== 'string' || !reward.id) fail(`${path}.id`, '必须是非空字符串');
    if (rewardIds.has(reward.id)) fail(`${path}.id`, `重复的奖励 id: ${reward.id}`);
    rewardIds.add(reward.id);
    if (typeof reward.add !== 'number' || !Number.isFinite(reward.add)) {
      fail(`${path}.add`, '必须是有限数值');
    }
  };
  for (const [index, raw] of floorRewards.entries()) {
    const path = `$.waveRewards.floor[${index}]`;
    const reward = object(raw, path);
    validateRewardIdentityAndAdd(reward, path);
    const stat = String(reward.stat);
    if (stat.endsWith('Pct')) {
      fail(`${path}.stat`, `保底层禁止百分比永久成长: ${stat}`);
    }
    if (!RUN_BASE_STATS.has(stat)) fail(`${path}.stat`, `非法基础属性: ${stat}`);
  }
  if (choiceRewards.length !== 5) {
    fail('$.waveRewards.choice', `固定菜单必须恰好包含 5 项（当前 ${choiceRewards.length} 项）`);
  }
  const choiceStats = new Set<string>();
  for (const [index, raw] of choiceRewards.entries()) {
    const path = `$.waveRewards.choice[${index}]`;
    const reward = object(raw, path);
    validateRewardIdentityAndAdd(reward, path);
    const stat = String(reward.stat);
    if (stat.endsWith('Pct') && stat !== 'xpGainPct') {
      fail(`${path}.stat`, `选择层仅允许 xpGainPct 作为百分比永久成长例外: ${stat}`);
    }
    if (!WAVE_CHOICE_STATS.has(stat)) fail(`${path}.stat`, `非法选择属性: ${stat}`);
    if (choiceStats.has(stat)) fail(`${path}.stat`, `选择菜单属性重复: ${stat}`);
    choiceStats.add(stat);
  }
  for (const stat of REQUIRED_WAVE_CHOICE_STATS) {
    if (!choiceStats.has(stat)) fail('$.waveRewards.choice', `固定菜单缺少属性: ${stat}`);
  }

}
