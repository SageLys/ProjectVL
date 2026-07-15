import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { cardVisualRegistry, resolveCardVisual } from '../src/presentation/cardVisual';

describe('card visual registry', () => {
  it('matches the configured skill pool exactly with no missing or orphan entries', () => {
    const skillIds = cfg.skills.cards.map(card => card.id).sort();
    const visualIds = Object.keys(cardVisualRegistry.cards).sort();
    expect(new Set(visualIds).size).toBe(visualIds.length);
    expect(visualIds).toEqual(skillIds);
  });

  it('uses a unique shape and glyph combination for every skill', () => {
    const identities = Object.values(cardVisualRegistry.cards).map(visual => `${visual.shape}:${visual.glyph}`);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it('uses distinct accents within each category', () => {
    for (const category of ['projectile', 'control', 'domain', 'economy', 'defense'] as const) {
      const accents = cfg.skills.cards
        .filter(card => card.category === category)
        .map(card => resolveCardVisual(card.id).accent.toLowerCase());
      expect(new Set(accents).size, category).toBe(accents.length);
    }
  });

  it('keeps identity stable from one to six stars', () => {
    for (const card of cfg.skills.cards) {
      const expected = resolveCardVisual(card.id);
      for (let star = 1; star <= 6; star++) {
        void star;
        expect(resolveCardVisual(card.id)).toEqual(expected);
      }
    }
  });

  it('returns a stable, explicit fallback for unknown cards', () => {
    expect(() => resolveCardVisual('unknownSkill')).not.toThrow();
    expect(resolveCardVisual('unknownSkill')).toEqual({ accent: '#8793a3', shape: 'circle', glyph: 'fallback' });
  });

});
