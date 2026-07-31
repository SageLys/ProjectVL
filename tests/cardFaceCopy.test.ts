import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { AFFIX_SINKS } from '../src/config/affixSinks';
import { texts } from '../src/data';
import { affixShortLabel } from '../src/ui/cardMeta';

const LEAKED_CONFIG = /[A-Za-z]{3,}|@|→|requiresStatus|spreadStatus|groundZone|burstDamage/;

describe('card face copy', () => {
  it('provides unique two-character labels for every active affix stat', () => {
    const copy = texts as unknown as {
      affixes: { shortStats: Record<string, string> };
    };
    const activeStats = Object.keys(AFFIX_SINKS);
    const shortStats = copy.affixes.shortStats;
    expect(Object.keys(shortStats)).toEqual(expect.arrayContaining(activeStats));
    const labels = activeStats.map(stat => shortStats[stat]);
    expect(labels.every(label => [...label].length === 2)).toBe(true);
    expect(new Set(labels).size).toBe(activeStats.length);
  });

  it('keeps every playable-card overview present, compact, and free of config identifiers', () => {
    const copy = texts as unknown as {
      cards: Record<string, { overview?: string }>;
    };
    for (const card of cfg.skills.cards) {
      const overview = copy.cards[card.id]?.overview ?? '';
      expect(overview, `cards.${card.id}.overview`).toBeTruthy();
      expect([...overview].length, `cards.${card.id}.overview length`).toBeLessThanOrEqual(30);
      expect(overview, `cards.${card.id}.overview leaked config`).not.toMatch(LEAKED_CONFIG);
    }
  });

  it('falls back to the full label for stats without a short label', () => {
    expect(affixShortLabel('damage')).toBe(
      (texts as unknown as { affixes: { stats: Record<string, string> } }).affixes.stats.damage,
    );
  });
});
