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

function nearestTier(star: number): '1' | '3' | '5' | '6' {
  if (star <= 2) return '1';
  if (star <= 4) return '3';
  if (star === 5) return '5';
  return '6';
}

export function cardDisplayName(cardType: CardType): string {
  const cardTexts = (texts as { cards?: Record<string, { name: string }> }).cards;
  return cardTexts?.[cardType]?.name ?? cardType;
}

export function resolveCardMeta(cardType: CardType, star: number): CardMeta {
  const def = getSkillDef(cardType);
  const cardTexts = (texts as { cards?: Record<string, { name: string; descByTier: Record<string, string> }> }).cards;
  const entry = cardTexts?.[cardType];
  const visual = resolveCardVisual(cardType);
  if (def && entry) {
    return { name: entry.name, desc: entry.descByTier[nearestTier(star)] ?? '', ...visual };
  }
  return { name: cardType, desc: '', ...visual };
}
