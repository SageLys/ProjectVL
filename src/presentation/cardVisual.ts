import type { CardType } from '../core/types';
import skillsJson from '../config/base/skills.json';
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

const SHAPES: SkillShape[] = [
  'circle', 'triangle', 'square', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'ring', 'capsule', 'verticalHexagon', 'star8',
];
const GLYPHS: SkillGlyph[] = [
  'pierce', 'zigzag', 'split', 'snow', 'target', 'impact',
  'ember', 'crosshair', 'harvest', 'barrier', 'thorn',
];

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
      : hue < 180 ? [0, c, x]
        : hue < 240 ? [0, x, c]
          : hue < 300 ? [x, 0, c]
            : [c, 0, x];
  const byte = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

function buildRegistry(): CardVisualRegistry {
  const source = visualsJson as CardVisualRegistry;
  const configuredIds = new Set(skillsJson.cards.map(card => card.id));
  const cards = Object.fromEntries(Object.entries(source.cards)
    .filter(([cardId]) => configuredIds.has(cardId))) as Record<string, VisualEntry>;
  const usedIdentities = new Set(Object.values(cards).map(visual => `${visual.shape}:${visual.glyph}`));
  const usedAccents = new Set(Object.values(cards).map(visual => visual.accent.toLowerCase()));
  let candidate = 0;
  for (const card of skillsJson.cards) {
    if (cards[card.id]) continue;
    let shape = SHAPES[0];
    let glyph = GLYPHS[0];
    while (candidate < SHAPES.length * GLYPHS.length) {
      shape = SHAPES[candidate % SHAPES.length];
      glyph = GLYPHS[Math.floor(candidate / SHAPES.length)];
      candidate++;
      if (!usedIdentities.has(`${shape}:${glyph}`)) break;
    }
    let hue = (candidate * 137.508) % 360;
    let accent = hslToHex(hue, 76, 64);
    while (usedAccents.has(accent.toLowerCase())) {
      hue = (hue + 11) % 360;
      accent = hslToHex(hue, 76, 64);
    }
    usedIdentities.add(`${shape}:${glyph}`);
    usedAccents.add(accent.toLowerCase());
    cards[card.id] = { hueOffset: candidate, accent, shape, glyph };
  }
  return { ...source, cards };
}

export const cardVisualRegistry = buildRegistry();

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
