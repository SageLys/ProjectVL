import type { CardType } from '../core/types';
import visualsJson from './cardVisuals.json';
import type { SkillGlyph, SkillShape } from './skillGeometry';

export interface CardVisual {
  accent: string;
  shape: SkillShape;
  glyph: SkillGlyph;
}

interface VisualEntry extends CardVisual {
  hueOffset: number;
}

interface CardVisualRegistry {
  version: string;
  families: Record<string, { hue: number; saturation: number; lightness: number }>;
  cards: Record<string, VisualEntry>;
}

export const cardVisualRegistry = visualsJson as CardVisualRegistry;

const FALLBACK_VISUAL: Readonly<CardVisual> = Object.freeze({
  accent: '#8793a3',
  shape: 'circle',
  glyph: 'fallback',
});

export function resolveCardVisual(cardType: CardType): CardVisual {
  const visual = cardVisualRegistry.cards[cardType];
  if (!visual) return { ...FALLBACK_VISUAL };
  return { accent: visual.accent, shape: visual.shape, glyph: visual.glyph };
}
