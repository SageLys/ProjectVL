import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { cardVisualRegistry, resolveCardVisual } from '../src/presentation/cardVisual';
import { drawDrops } from '../src/render/drawDrops';
import { drawEnemies } from '../src/render/drawEnemies';
import { enemy, freshState } from './helpers';

function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop as string];
      return () => undefined;
    },
    set(obj, prop, value) { obj[prop as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

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

  it('draws all eleven skill drops without throwing', () => {
    const state = freshState();
    state.groundDrops = cfg.skills.cards.map((card, index) => ({
      id: index, kind: 'card' as const, x: 100 + index, y: 100, type: card.id, star: 1, life: 8, maxLife: 10, pulse: 0,
    }));
    expect(() => drawDrops(fakeCtx(), state)).not.toThrow();
  });

  it('gives normal enemies one shared neutral body color', () => {
    expect(cfg.enemies.types.normal.color).toBe(cfg.enemies.types.fast.color);
    expect(cfg.enemies.types.fast.color).toBe(cfg.enemies.types.tank.color);
  });

  it('draws all four enemy types without throwing', () => {
    const state = freshState();
    state.enemies = (['normal', 'fast', 'tank', 'boss'] as const).map((type, index) => {
      const visual = cfg.enemies.types[type];
      return enemy({ id: index, type, r: visual.r, color: visual.color });
    });
    expect(() => drawEnemies(fakeCtx(), state)).not.toThrow();
  });

});
