import type { AtomName, BindingDef, CardDef, EffectDef, Trigger } from '../core/effects/defs';
import type { CardAffixStatKind, EvolutionRecipesConfig, GodsConfig } from '../config/types';
import { describeLabel, labelWithKey } from '../editor/labels';

export interface ParamView { key: string; label: string; value: string }
export interface EffectView {
  atom: AtomName;
  label: string;
  glossary?: string;
  params: ParamView[];
  nested: EffectView[];
}
export interface BindingView {
  trigger: Trigger;
  triggerLabel: string;
  effects: EffectView[];
  /** 触发器自身的过滤与冷却条件；原签名之外的只读补充，避免机制信息丢失。 */
  triggerParams?: ParamView[];
}
export interface BranchView {
  id: string;
  name: string;
  /** 玩家向一句话效果说明 */
  summary: string;
  /** 设计向定位，仅设计工作台显示 */
  intent: string;
  bindings: BindingView[];
}
export interface TierView {
  star: 3 | 4 | 5 | 6;
  kind: 'checkpoint' | 'amplify' | 'shared' | 'fixed';
  visibleText: string;
  milestone?: { title: string; detail: string };
  options: BranchView[];
  bindings: BindingView[];
  amplifyDescription?: string;
  /** stars 中当前实际生效值，与 evolutionTree 的候选分支并列展示。 */
  activeBindings?: BindingView[];
}
export interface ConsumableTierView {
  star: 1 | 3 | 6;
  visibleText: string;
  milestone?: { title: string; detail: string };
  radius?: number;
  duration?: number;
  effects: EffectView[];
}
export interface AffixView {
  stat: CardAffixStatKind;
  statLabel: string;
  weight: number;
  min: number;
  max: number;
  step: number;
  consumableDuration: number;
}
export interface RecipeView {
  id: string;
  a: { cardId: string; name: string; minStar: number };
  b: { cardId: string; name: string; minStar: number };
  outputStar: number;
  recipeType: 'sameGod' | 'crossGod';
}
export interface CardView {
  id: string;
  name: string;
  godId?: string;
  roster: 'anchor' | 'variable' | 'recipeOnly';
  categoryLabel: string;
  tagLabels: string[];
  teaching: boolean;
  overview: string;
  tiers: TierView[];
  consumable: ConsumableTierView[];
  affixPool?: { count: number; candidates: AffixView[] };
  designNotes?: string;
  recipe?: RecipeView;
}
export interface DescribeContext {
  texts: Record<string, unknown>;
  gods: GodsConfig;
  recipes: EvolutionRecipesConfig;
}
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function at(root: unknown, path: readonly (string | number)[]): unknown {
  let current = root;
  for (const part of path) current = record(current)[String(part)];
  return current;
}

function text(root: unknown, path: readonly (string | number)[]): string {
  const value = at(root, path);
  return typeof value === 'string' ? value : '';
}


function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatParamValue).join('、');
  if (value && typeof value === 'object') {
    return Object.entries(value as UnknownRecord)
      .map(([key, child]) => `${key}=${formatParamValue(child)}`)
      .join('，');
  }
  return value === undefined ? '' : String(value);
}

function milestone(root: unknown, mode: 'hand' | 'equip', star: number): { title: string; detail: string } | undefined {
  const title = text(root, [mode, 'milestones', star, 'title']);
  const detail = text(root, [mode, 'milestones', star, 'detail']);
  return title || detail ? { title, detail } : undefined;
}

function describeTriggerParams(binding: BindingDef): ParamView[] | undefined {
  if (!binding.triggerParams) return undefined;
  return Object.entries(binding.triggerParams).map(([key, value]) => ({
    key,
    label: describeLabel('domainField', key).label,
    value: formatParamValue(value),
  }));
}

export function describeEffect(effect: EffectDef): EffectView {
  const info = describeLabel('atom', effect.atom);
  const rawParams = (effect.params ?? {}) as UnknownRecord;
  const nestedSource = rawParams.effects;
  const nested = Array.isArray(nestedSource)
    ? nestedSource.map(item => describeEffect(item as EffectDef))
    : [];
  const params = Object.entries(rawParams)
    .filter(([key]) => key !== 'effects')
    .map(([key, value]) => ({
      key,
      label: describeLabel('atomParam', `${effect.atom}.${key}`).label,
      value: formatParamValue(value),
    }));
  return { atom: effect.atom, label: info.label, glossary: info.help, params, nested };
}

export function describeBinding(binding: BindingDef): BindingView {
  return {
    trigger: binding.trigger,
    triggerLabel: labelWithKey('enumValue', `trigger.${binding.trigger}`, binding.trigger),
    effects: binding.effects.map(describeEffect),
    triggerParams: describeTriggerParams(binding),
  };
}

function describeBranch(card: CardDef, option: NonNullable<CardDef['evolutionTree']>['checkpoints'][number]['options'][number], texts: unknown): BranchView {
  const nodePath = ['evolution', card.id, option.id] as const;
  return {
    id: option.id,
    name: text(texts, [...nodePath, 'name']),
    summary: text(texts, [...nodePath, 'summary']),
    intent: text(texts, [...nodePath, 'intent']),
    bindings: option.equip.map(describeBinding),
  };
}

function rosterFor(card: CardDef, gods: GodsConfig): CardView['roster'] {
  if (card.recipeOnly) return 'recipeOnly';
  const god = gods.gods.find(item => item.id === card.god);
  if (god?.anchorCardIds.includes(card.id)) return 'anchor';
  return 'variable';
}

function cardName(texts: unknown, cardId: string): string {
  return text(texts, ['cards', cardId, 'name']);
}

function describeRecipe(card: CardDef, ctx: DescribeContext): RecipeView | undefined {
  const recipe = ctx.recipes.recipes.find(item => item.outputCardId === card.id);
  if (!recipe) return undefined;
  return {
    id: recipe.id,
    a: { ...recipe.ingredientVariable, name: cardName(ctx.texts, recipe.ingredientVariable.cardId) },
    b: { ...recipe.ingredientAnchor, name: cardName(ctx.texts, recipe.ingredientAnchor.cardId) },
    outputStar: recipe.outputStar,
    recipeType: recipe.recipeType,
  };
}

function normalTiers(card: CardDef, ctx: DescribeContext, cardTexts: unknown): TierView[] {
  const checkpoints = new Map(card.evolutionTree?.checkpoints.map(item => [item.star, item]) ?? []);
  const shared = new Map(card.evolutionTree?.sharedNodes.map(item => [item.star, item]) ?? []);
  const tiers: TierView[] = [];
  for (const star of [3, 4, 5, 6] as const) {
    const checkpoint = checkpoints.get(star);
    if (checkpoint) {
      const actual = card.stars[String(star) as '3' | '5'];
      tiers.push({
        star,
        kind: 'checkpoint',
        visibleText: text(cardTexts, ['equip', 'shortByTier', star]),
        milestone: milestone(cardTexts, 'equip', star),
        options: checkpoint.options.map(option => describeBranch(card, option, ctx.texts)),
        bindings: [],
        activeBindings: actual?.equip.map(describeBinding) ?? [],
      });
      continue;
    }
    const node = shared.get(star);
    if (star === 4) {
      tiers.push({
        star,
        kind: 'amplify',
        visibleText: text(cardTexts, ['equip', 'shortByTier', star]),
        options: [],
        bindings: [],
        amplifyDescription: card.amplifyAxis.description ?? '',
      });
      continue;
    }
    tiers.push({
      star,
      kind: 'shared',
      visibleText: text(cardTexts, ['equip', 'shortByTier', star]),
      milestone: milestone(cardTexts, 'equip', star),
      options: [],
      bindings: (node?.equip ?? card.stars['6'].equip).map(describeBinding),
      activeBindings: card.stars['6'].equip.map(describeBinding),
    });
  }
  return tiers;
}

function fixedTiers(card: CardDef, cardTexts: unknown): TierView[] {
  return [{
    star: 6,
    kind: 'fixed',
    visibleText: text(cardTexts, ['equip', 'shortByTier', 6]),
    milestone: milestone(cardTexts, 'equip', 6),
    options: [],
    bindings: card.stars['6'].equip.map(describeBinding),
  }];
}

export function describeCard(card: CardDef, ctx: DescribeContext): CardView {
  const cardTexts = at(ctx.texts, ['cards', card.id]);
  const consumable = ([1, 3, 6] as const).map(star => {
    const source = card.consumable.anchors[String(star) as '1' | '3' | '6'];
    return {
      star,
      visibleText: text(cardTexts, ['hand', 'shortByTier', star]),
      milestone: milestone(cardTexts, 'hand', star),
      radius: source.radius,
      duration: source.duration,
      effects: source.effects.map(describeEffect),
    };
  });
  const affixPool = card.affixPool ? {
    count: card.affixPool.count,
    candidates: card.affixPool.candidates.map(candidate => ({
      ...candidate,
      statLabel: describeLabel('enumValue', `stat.${candidate.stat}`).label,
    })),
  } : undefined;
  return {
    id: card.id,
    name: text(cardTexts, ['name']),
    godId: card.god,
    roster: rosterFor(card, ctx.gods),
    categoryLabel: describeLabel('enumValue', `category.${card.category}`).label,
    tagLabels: card.synergyTags.map(tag => describeLabel('enumValue', `tag.${tag}`).label),
    teaching: card.teaching,
    overview: text(cardTexts, ['overview']),
    tiers: card.recipeOnly ? fixedTiers(card, cardTexts) : normalTiers(card, ctx, cardTexts),
    consumable,
    affixPool,
    designNotes: card.designNotes,
    recipe: describeRecipe(card, ctx),
  };
}
