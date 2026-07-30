import { cfg } from '../config';
import { AFFIX_SINKS } from '../config/affixSinks';
import type { CardStatKind, EvolutionOptionDef } from '../config/types';
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
  stat: CardStatKind;
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
  intent: string;
  keywords: string[];
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
    keywords?: string[];
    buildFit?: string;
  }>>;
  glossary?: Record<string, string | { term?: string; description?: string }>;
  affixHelp?: Partial<Record<CardStatKind, string>>;
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
const DEFAULT_GLOSSARY: Record<string, string> = {
  pierce: '弹道命中后继续前进，可再次命中后续目标。',
  chain: '命中后在搜索范围内寻找新目标并继续传递伤害。',
  split: '一枚弹道生成多枚子弹道，子弹道按独立伤害倍率结算。',
  ricochet: '弹道命中后改变方向并继续寻找目标。',
  aoeOnHit: '在命中点对一定半径内的敌人结算伤害。',
  beamMorph: '把主炮投射方式改为持续或周期结算的直线光束。',
  mortarMorph: '把主炮投射方式改为落点爆炸的抛射攻击。',
  slow: '按比例降低目标移动速度，持续时间结束后恢复。',
  freeze: '目标暂时无法移动；重复控制仍受抗性与免疫窗限制。',
  stun: '目标暂时无法行动；重复控制仍受抗性与免疫窗限制。',
  knockback: '把目标沿远离作用点的方向推开。',
  taunt: '提高指定单位的索敌优先级，使敌人更倾向攻击它。',
  vulnerable: '提高目标受到的伤害，可按配置叠层。',
  aura: '以持续存在的来源为中心，周期影响范围内目标。',
  groundZone: '在固定位置生成圆形、环形或朝敌方向延伸的线形持续区域，并按间隔结算内部效果。',
  dot: '在一段时间内按固定间隔重复造成伤害。',
  summon: '生成拥有独立生命与行为的临时单位。',
  dropRateMul: '乘算调整普通掉落物的生成概率。',
  dropLifetimeMul: '乘算调整掉落物从生成到过期的时间。',
  xpMul: '乘算调整本局获得的奖励积分。',
  extraDrop: '满足触发条件时额外生成掉落物。',
  expiryConvert: '掉落物自然过期时把一部分价值转为其他收益。',
  mergeMaterialRefund: '普通合并或装备喂养后，按规则返还同型低星素材卡。',
  wildcardRewardBonus: '在 Bounty 或波末 Boss 的基线万能卡奖励上追加数量。',
  mergePulse: '完成卡牌合成时，以炮台为中心释放一次范围效果。',
  shield: '抵挡指定次数的突破或伤害，耗尽后按规则恢复。',
  thorns: '受到伤害后，按比例向攻击来源返还伤害。',
  breachReduction: '降低敌人突破防线时造成的生命损失。',
  novaOnBreak: '护盾耗尽时自动释放一次范围反击。',
  execute: '目标生命比例低于阈值时直接完成击杀。',
  burstDamage: '按倍率立即结算一次独立伤害。',
  focusPriority: '临时改变索敌评分，让符合条件的目标更早被选中。',
  restore: '立即恢复固定数值或最大生命比例的生命。',
  statBuff: '在指定时间内提高一项基础属性，可按配置叠层。',
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
    intent: copy?.intent ?? copy?.summary ?? `强化${effectKeywords.join('与') || '当前机制'}`,
    keywords: copy?.keywords?.length ? copy.keywords : effectKeywords,
    buildFit: copy?.buildFit,
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
    intent: copy.intent,
    keywords: copy.keywords,
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
