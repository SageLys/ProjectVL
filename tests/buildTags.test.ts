import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateSkillsConfig } from '../src/config/skillValidator';

describe('skill synergyTags', () => {
  it('assigns 1~2 valid, unique tags to all 11 cards', () => {
    const valid = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
    expect(cfg.skills.cards).toHaveLength(11);
    for (const card of cfg.skills.cards) {
      expect(card.synergyTags.length).toBeGreaterThanOrEqual(1);
      expect(card.synergyTags.length).toBeLessThanOrEqual(2);
      expect(new Set(card.synergyTags).size).toBe(card.synergyTags.length);
      expect(card.synergyTags.every(tag => valid.has(tag))).toBe(true);
    }
  });

  it.each([
    ['empty', []],
    ['unknown', ['projectile', 'economy']],
    ['duplicate', ['control', 'control']],
  ])('rejects %s synergyTags', (_name, synergyTags) => {
    const invalid = structuredClone(cfg.skills) as unknown as { cards: Array<{ synergyTags: string[] }> };
    invalid.cards[0].synergyTags = synergyTags;
    expect(() => validateSkillsConfig(invalid)).toThrow(/synergyTags/);
  });
});
