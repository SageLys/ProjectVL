import { texts } from '../data';
import type { CardType } from '../core/types';
import { getSkillDef } from '../core/effects/interpreter';
import { resolveCardVisual } from '../presentation/cardVisual';
import type { SkillGlyph, SkillShape } from '../presentation/skillGeometry';

export interface CardMeta {
  name: string;
  desc: string;
  accent: string;
  shape: SkillShape;
  glyph: SkillGlyph;
}

export type CardCopyContext = 'hand' | 'equipment';

type CardCopyEntry = { name: string; hand: { shortByTier: Record<string, string> }; equip: { shortByTier: Record<string, string> } };

/** Returns the nearest defined tier at or below star, falling back to the lowest available tier. */
export function resolveTierCopy(shortByTier: Record<string, string>, star: number): string {
  const tiers = Object.keys(shortByTier)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const tier = [...tiers].reverse().find(value => value <= star) ?? tiers[0];
  return (tier === undefined ? undefined : shortByTier[String(tier)]) || '效果说明';
}

export function cardDisplayName(cardType: CardType): string {
  const cardTexts = (texts as { cards?: Record<string, { name: string }> }).cards;
  return cardTexts?.[cardType]?.name ?? cardType;
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
  const def = getSkillDef(cardType);
  const cardTexts = (texts as { cards?: Record<string, CardCopyEntry> }).cards;
  const entry = cardTexts?.[cardType];
  const visual = resolveCardVisual(cardType);
  if (def && entry) {
    const shortByTier = context === 'hand' ? entry.hand.shortByTier : entry.equip.shortByTier;
    return { name: entry.name, desc: resolveTierCopy(shortByTier, star), ...visual };
  }
  return { name: cardType, desc: '效果说明', ...visual };
}
