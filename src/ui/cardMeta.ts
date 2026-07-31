import { texts } from '../data';
import type { CardAffixRoll, CardType, RuntimeStatModifier } from '../core/types';
import { resolveCardVisual } from '../presentation/cardVisual';
import type { SkillGlyph, SkillShape } from '../presentation/skillGeometry';

export interface CardMeta {
  name: string;
  desc: string;
  overview: string;
  accent: string;
  shape: SkillShape;
  glyph: SkillGlyph;
}

export type CardCopyContext = 'hand' | 'equipment';

type CardCopyEntry = {
  name: string;
  overview?: string;
  hand: { shortByTier: Record<string, string> };
  equip: { shortByTier: Record<string, string> };
};

/** Returns the nearest defined tier at or below star, falling back to the lowest available tier. */
export function resolveTierCopy(shortByTier: Record<string, string>, star: number): string {
  const tiers = Object.keys(shortByTier)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const tier = [...tiers].reverse().find(value => value <= star) ?? tiers[0];
  return (tier === undefined ? undefined : shortByTier[String(tier)]) || '暂无机制说明';
}

export function cardDisplayName(cardType: CardType): string {
  const cardTexts = (texts as { cards?: Record<string, { name: string }> }).cards;
  return cardTexts?.[cardType]?.name ?? cardType;
}

function statLabel(stat: string): string {
  const labels = (texts as unknown as { affixes?: { stats?: Record<string, string> } }).affixes?.stats;
  return labels?.[stat] ?? stat;
}

/** 卡面用 2 字缩写标签；全称留给详情弹窗。 */
export function affixShortLabel(stat: string): string {
  const affixes = (texts as unknown as {
    affixes?: { shortStats?: Record<string, string>; stats?: Record<string, string> };
  }).affixes;
  return affixes?.shortStats?.[stat] ?? affixes?.stats?.[stat] ?? stat;
}

function compactNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function formatAffixRoll(roll: CardAffixRoll): string {
  const percentage = roll.stat.endsWith('Mul');
  const value = percentage ? `${compactNumber(roll.value * 100)}%` : compactNumber(roll.value);
  return `${statLabel(roll.stat)} +${value}`;
}

/** 卡面词条串：使用缩写标签并去掉数值前空格。 */
export function formatAffixRollShort(roll: CardAffixRoll): string {
  const percentage = roll.stat.endsWith('Mul');
  const value = percentage ? `${compactNumber(roll.value * 100)}%` : compactNumber(roll.value);
  return `${affixShortLabel(roll.stat)}+${value}`;
}

export function formatRuntimeModifier(modifier: RuntimeStatModifier): string {
  const raw = modifier.operation === 'mul' ? (modifier.value - 1) * 100 : modifier.value;
  const suffix = modifier.operation === 'mul' ? '%' : '';
  return `${statLabel(modifier.stat)} +${compactNumber(raw)}${suffix}`;
}

export function evolutionChoiceCopy(
  cardType: CardType,
  optionId: string,
): { name: string; summary: string } | undefined {
  const evolution = (texts as unknown as {
    evolution?: Record<string, Record<string, { name: string; summary: string }>>;
  }).evolution;
  return evolution?.[cardType]?.[optionId];
}

export function resolveCardMeta(cardType: CardType, star: number, context: CardCopyContext): CardMeta {
  const cardTexts = (texts as { cards?: Record<string, CardCopyEntry> }).cards;
  const entry = cardTexts?.[cardType];
  const visual = resolveCardVisual(cardType);
  if (entry) {
    const shortByTier = context === 'hand' ? entry.hand.shortByTier : entry.equip.shortByTier;
    const desc = resolveTierCopy(shortByTier, star);
    return { name: entry.name, desc, overview: entry.overview || desc || '', ...visual };
  }
  return { name: cardType, desc: '暂无机制说明', overview: '', ...visual };
}
