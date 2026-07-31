import { cfg } from '../config';
import { AFFIX_SINKS } from '../config/affixSinks';
import type { CardAffixStatKind, EvolutionOptionDef } from '../config/types';
import type { BindingDef, CardDef, EffectDef } from '../core/effects/defs';
import { nestedEffectsOf } from '../core/effects/atomContract';
import { getSkillDef, resolveCardBindings, resolveConsumableTier } from '../core/effects/interpreter';
import type { Card, CardAffixRoll } from '../core/types';
import { texts } from '../data';
import { resolveCardVisual } from '../presentation/cardVisual';
import { glyphToSvg } from '../presentation/skillGeometry';
import { cardDisplayName, formatAffixRoll } from './cardMeta';
import { ATOM_LABELS, formatBinding, formatEffect, type EffectTextBlock, type EffectTextLine } from './effectText';

export interface EffectSection {
  title: string;
  hint: string;
  blocks: EffectTextBlock[];
  empty?: string;
}

export interface AffixDetail {
  stat: CardAffixStatKind;
  value: string;
  equipment: string;
  consumable: string;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  description: string;
}

export interface SkillTreeOption {
  id: string;
  name: string;
  /** 玩家向一句话效果说明，显示于三选一弹窗与技能树选项正文。 */
  summary: string;
  /** 设计向定位，仅设计工作台使用，玩家侧不显示。 */
  intent: string;
  exactEffects: EffectTextBlock[];
  selected: boolean;
  available: boolean;
}

export interface SkillTreeNode {
  star: 1 | 2 | 3 | 4 | 5 | 6;
  kind: 'base' | 'branch' | 'shared' | 'terminal';
  label: string;
  options?: SkillTreeOption[];
  exactEffects?: EffectTextBlock[];
  reached: boolean;
  current: boolean;
  locked: boolean;
}

export interface SkillTreeViewModel {
  nodes: SkillTreeNode[];
}

export interface CardDetailViewModel {
  id: number;
  name: string;
  star: number;
  iconSvg: string;
  accent: string;
  category: string;
  god: string;
  overview: string;
  sourceLabel: string;
  currentRoute: string;
  consume: EffectSection;
  equip: EffectSection;
  affixes: AffixDetail[];
  glossary: GlossaryEntry[];
  tree: SkillTreeViewModel;
}

type DetailTexts = {
  cards?: Record<string, { overview?: string }>;
  gods?: Record<string, { name?: string }>;
  evolution?: Record<string, Record<string, {
    name?: string;
    summary?: string;
    intent?: string;
  }>>;
  glossary?: Record<string, string | { term?: string; description?: string }>;
  affixHelp?: Partial<Record<CardAffixStatKind, string>>;
};

const detailTexts = texts as unknown as DetailTexts;
const CATEGORY_LABELS: Record<CardDef['category'], string> = {
  projectile: '弹道',
  control: '控制',
  domain: '领域',
  economy: '经济',
  defense: '防御',
};
const GLOBAL_CONSUMERS: Record<string, string> = {
  totalDamage: '基础伤害',
  totalFireRate: '攻速',
  totalRange: '射程',
  totalMulti: '多重射击',
  totalMaxHp: '生命上限',
  instantHeal: '生命',
  controlledDamageTakenBonus: '受控目标承伤',
  runtimeScalingFor: '本卡效果',
  'getModifiers.dropRateMul': '掉落概率',
  'getModifiers.dropLifetimeMul': '掉落物存在时间',
  'getModifiers.xpMul': '奖励积分获取',
};
export const DEFAULT_GLOSSARY: Record<string, string> = {
  pierce: '打穿一个不算完，弹道会接着往前飞，能接着命中后面的目标。',
  chain: '命中之后伤害不会停，会在附近继续找下一个追求者接着传。',
  split: '一发子弹炸成好几发，每一发子弹道都单独算伤害。',
  ricochet: '打中一个不会停，弹道会拐个弯，接着找下一个目标。',
  aoeOnHit: '命中的地方会炸开一圈，范围内的追求者一起挨打。',
  beamMorph: '主炮不再一发一发打，换成持续输出的直线光束。',
  mortarMorph: '主炮换成抛物线砸落点的打法，落地就是一圈爆炸。',
  slow: '让目标腿变慢，时间到了自动恢复原速。',
  freeze: '目标原地定住动不了；反复叠控制照样受抗性和免疫窗口限制。',
  stun: '目标当场断片，啥都干不了；反复叠控制同样受抗性和免疫窗口限制。',
  knockback: '一巴掌把目标从原地推远。',
  taunt: '拉高指定单位的仇恨值，让追求者更爱往它身上冲。',
  vulnerable: '让目标变得更好打——受到的伤害提高，还能按配置叠层，这就是感电。',
  aura: '围着来源转的常驻范围，每隔一段时间自动结算一次。',
  groundZone: '在地上钉一块持续存在的区域，每隔一段时间对区域内结算一次。',
  dot: '让目标在一段时间里持续掉血，这就是灼烧。',
  summon: '召唤一个有自己血量、会自己行动的临时打手。',
  dropRateMul: '按倍率调整心意掉落的概率。',
  dropLifetimeMul: '按倍率调整心意从掉落到消失能撑多久。',
  xpMul: '按倍率调整本局能拿到的奖励积分。',
  extraDrop: '条件一满足，就多掉一份心意。',
  expiryConvert: '心意过期消失前，把没捡到的那部分价值换成别的收益，不算完全浪费。',
  mergeMaterialRefund: '普通合并或喂养装备升星成功后，有概率退回同型的低星素材卡。',
  wildcardRewardBonus: '赏金或波末 Boss 掉的万能卡，在基础数量上再多给一点。',
  mergePulse: '卡牌合成成功的瞬间，以炮台为中心炸一圈。',
  shield: '能抵挡固定次数的伤害，这就是壁垒；打空之后按规则重新补上。',
  thorns: '挨打不吃亏，按比例把伤害原样弹回攻击者身上。',
  breachReduction: '追求者硬闯过防线时，少掉一些心防。',
  novaOnBreak: '壁垒被打空的瞬间，自动对周围放一次反击。',
  execute: '目标血量掉到阈值以下，直接送走，不用磨。',
  burstDamage: '按倍率立刻单独打一下爆发伤害。',
  focusPriority: '临时改索敌权重，让符合条件的目标更容易被优先盯上。',
  restore: '立刻回一口血，按固定数值或按生命上限比例算。',
  statBuff: '让某项基础属性在一段时间内变强，能按配置叠层。',
  charge: '按指定战斗事件攒一条能量条，攒满或到点了就把内嵌效果一次放出来。',
  summonBuff: '给符合条件的召唤物加强化，强化幅度受等级上限约束。',
};

function getDef(type: string): CardDef | undefined {
  return getSkillDef(type) ?? cfg.skills.cards.find(card => card.id === type);
}

function consumableBlock(def: CardDef, star: number): EffectTextBlock {
  const tier = resolveConsumableTier(def, star);
  const lines = tier.effects.flatMap(effect => formatEffect(effect));
  if (tier.radius != null) lines.unshift({ text: `释放半径 ${Number(tier.radius.toFixed(2))}`, keywords: [] });
  if (tier.duration != null) lines.unshift({ text: `持续 ${Number(tier.duration.toFixed(2))} 秒`, keywords: [] });
  return {
    trigger: '拖到战场后立即释放',
    lines,
    keywords: [...new Set(lines.flatMap(line => line.keywords))],
  };
}

function effectAtoms(effects: EffectDef[]): string[] {
  const result: string[] = [];
  for (const effect of effects) {
    result.push(effect.atom);
    result.push(...effectAtoms(nestedEffectsOf(effect).filter(
      item => item && typeof item === 'object' && 'atom' in item,
    ) as EffectDef[]));
  }
  return result;
}

function bindingAtoms(bindings: BindingDef[]): string[] {
  return bindings.flatMap(binding => effectAtoms(binding.effects));
}

function affixAmount(roll: CardAffixRoll): string {
  const value = roll.stat.endsWith('Mul') ? `${Number((roll.value * 100).toFixed(2))}%` : Number(roll.value.toFixed(2)).toString();
  return `+${value}`;
}

function buildAffixDetail(roll: CardAffixRoll): AffixDetail {
  const contract = AFFIX_SINKS[roll.stat];
  const amount = affixAmount(roll);
  const help = detailTexts.affixHelp?.[roll.stat];
  let equipment: string;
  if (contract.equipment === 'unsupported') {
    equipment = '装备时：不生效';
  } else if (contract.equipment === 'global') {
    equipment = `装备时：全局${GLOBAL_CONSUMERS[contract.globalConsumer ?? ''] ?? '对应属性'} ${amount}`;
  } else {
    const targets = [...new Set((contract.scalingTargets ?? []).map(target => ATOM_LABELS[target.atom]))];
    equipment = `装备时：只提高这张卡产生的${targets.join('、') || '对应效果'}${help ? `；${help}` : ''}`;
  }
  const consumable = contract.settlement === 'instant'
    ? `消耗时：立即结算${GLOBAL_CONSUMERS[contract.globalConsumer ?? ''] ?? ''} ${amount}`.trim()
    : `消耗时：全局${GLOBAL_CONSUMERS[contract.globalConsumer ?? ''] ?? '对应属性'} ${amount}，持续 ${Number(roll.consumableDuration.toFixed(2))} 秒`;
  return { stat: roll.stat, value: formatAffixRoll(roll), equipment, consumable };
}

function pathSelection(path: string[], star: number): string | undefined {
  const prefix = `${star}:`;
  return path.find(entry => entry.startsWith(prefix))?.slice(prefix.length);
}

function optionCopy(cardType: string, option: EvolutionOptionDef) {
  const copy = detailTexts.evolution?.[cardType]?.[option.id];
  const blocks = option.equip.map(formatBinding);
  const effectKeywords = [...new Set(blocks.flatMap(block => block.keywords))];
  return {
    name: copy?.name ?? option.textKey,
    /** 玩家向：summary → intent → 自动兜底 */
    summary: copy?.summary ?? copy?.intent ?? `强化${effectKeywords.join('与') || '当前机制'}`,
    /** 设计向 */
    intent: copy?.intent ?? `强化${effectKeywords.join('与') || '当前机制'}`,
  };
}

export function buildEvolutionOptionViewModel(
  cardType: string,
  checkpointStar: number,
  option: EvolutionOptionDef,
  evolutionPath: string[] = [],
  currentStar = checkpointStar,
): SkillTreeOption {
  const selectedId = pathSelection(evolutionPath, checkpointStar);
  const copy = optionCopy(cardType, option);
  return {
    id: option.id,
    name: copy.name,
    summary: copy.summary,
    intent: copy.intent,
    exactEffects: option.equip.map(formatBinding),
    selected: selectedId === option.id,
    available: currentStar >= checkpointStar && (!selectedId || selectedId === option.id),
  };
}

function syntheticBlock(trigger: string, lines: EffectTextLine[]): EffectTextBlock {
  return { trigger, lines, keywords: [...new Set(lines.flatMap(line => line.keywords))] };
}

export function buildSkillTreeViewModel(
  card: Card,
  def = getDef(card.type),
): SkillTreeViewModel {
  if (!def) return { nodes: [] };
  if (def.recipeOnly && !def.evolutionTree) {
    const bindings = resolveCardBindings(def, card.evolutionPath ?? [], 6);
    return {
      nodes: [{
        star: 6, kind: 'terminal', label: '终极形态效果', exactEffects: bindings.map(formatBinding),
        reached: true, current: true, locked: false,
      }],
    };
  }

  const path = card.evolutionPath ?? [];
  const nodes: SkillTreeNode[] = [];
  for (const star of [1, 2] as const) {
    nodes.push({
      star,
      kind: 'base',
      label: star === 1 ? '基础释放' : '数值成长',
      exactEffects: [consumableBlock(def, star)],
      reached: card.star >= star,
      current: card.star === star,
      locked: card.star < star,
    });
  }
  for (const star of [3, 4, 5, 6] as const) {
    const checkpoint = def.evolutionTree?.checkpoints.find(item => item.star === star);
    const shared = def.evolutionTree?.sharedNodes.find(item => item.star === star);
    const selectedId = pathSelection(path, star);
    const kind: SkillTreeNode['kind'] = checkpoint ? 'branch' : star === 6 ? 'terminal' : 'shared';
    const exactEffects = shared?.equip?.map(formatBinding) ?? [];
    if (shared?.amplify) {
      exactEffects.unshift(syntheticBlock('强化此前分支', [{
        text: def.amplifyAxis.description
          ?? Object.entries(shared.amplify).map(([axis, value]) => `${axis} ${value}`).join('、'),
        keywords: [],
      }]));
    }
    nodes.push({
      star,
      kind,
      label: checkpoint ? `${star}★ 分支选择` : star === 6 ? '公共终态' : '公共强化',
      options: checkpoint?.options.map(option =>
        buildEvolutionOptionViewModel(card.type, star, option, path, card.star)),
      exactEffects,
      reached: card.star >= star,
      current: checkpoint ? Boolean(selectedId) && card.star >= star : card.star === star,
      locked: card.star < star,
    });
  }
  return { nodes };
}

function glossaryFor(atoms: string[]): GlossaryEntry[] {
  return [...new Set(atoms)].map(id => {
    const configured = detailTexts.glossary?.[id];
    const term = typeof configured === 'object' && configured.term
      ? configured.term
      : ATOM_LABELS[id as keyof typeof ATOM_LABELS] ?? id;
    const description = typeof configured === 'string'
      ? configured
      : configured?.description ?? DEFAULT_GLOSSARY[id] ?? '按当前卡牌配置触发并结算该机制。';
    return { id, term, description };
  });
}

export function buildCardDetailViewModel(
  card: Card,
  source: 'cards' | 'equipment',
): CardDetailViewModel {
  const def = getDef(card.type);
  const visual = resolveCardVisual(card.type);
  if (!def) {
    return {
      id: card.id, name: cardDisplayName(card.type), star: card.star,
      iconSvg: glyphToSvg(visual.shape, visual.glyph), accent: visual.accent,
      category: '未分类', god: '中立', overview: '暂无配置说明。',
      sourceLabel: source === 'equipment' ? '已装备' : '手牌',
      currentRoute: '尚未选择路线',
      consume: { title: '消耗释放效果', hint: '', blocks: [], empty: '暂无可用效果。' },
      equip: { title: '装备持续效果', hint: '', blocks: [], empty: '暂无可用效果。' },
      affixes: [], glossary: [], tree: { nodes: [] },
    };
  }
  const path = card.evolutionPath ?? [];
  const tier = resolveConsumableTier(def, card.star);
  const bindings = resolveCardBindings(def, path, card.star);
  const routeNames = path.map(entry => {
    const optionId = entry.slice(entry.indexOf(':') + 1);
    return detailTexts.evolution?.[card.type]?.[optionId]?.name ?? optionId;
  });
  return {
    id: card.id,
    name: cardDisplayName(card.type),
    star: card.star,
    iconSvg: glyphToSvg(visual.shape, visual.glyph),
    accent: visual.accent,
    category: CATEGORY_LABELS[def.category],
    god: def.god ? detailTexts.gods?.[def.god]?.name ?? def.god : '中立',
    overview: detailTexts.cards?.[card.type]?.overview ?? `以${CATEGORY_LABELS[def.category]}机制为核心的技能卡。`,
    sourceLabel: source === 'equipment' ? '已装备' : '手牌',
    currentRoute: routeNames.length ? routeNames.join(' → ') : def.recipeOnly ? '终极形态' : '尚未选择路线',
    consume: {
      title: '消耗释放效果',
      hint: '将卡牌拖到战场后结算；下列数值为当前星级精确值。',
      blocks: [consumableBlock(def, card.star)],
    },
    equip: {
      title: '装备持续效果',
      hint: source === 'equipment' ? '当前正在生效。' : '达到装备条件并放入装备栏后生效。',
      blocks: bindings.map(formatBinding),
      empty: card.star < 3 ? '达到 3★ 并选择进化分支后解锁装备效果。' : '选择当前星级的进化分支后显示装备效果。',
    },
    affixes: (card.affixes ?? []).map(buildAffixDetail),
    glossary: glossaryFor([...effectAtoms(tier.effects), ...bindingAtoms(bindings)]),
    tree: buildSkillTreeViewModel(card, def),
  };
}
