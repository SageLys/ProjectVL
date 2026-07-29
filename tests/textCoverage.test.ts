import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { AFFIX_SINKS } from '../src/config/affixSinks';
import { texts } from '../src/data';
import { ATOM_LABELS } from '../src/ui/effectText';

describe('player-facing text coverage', () => {
  it('covers all cards, branches, atoms, triggers and affix stats without placeholders', () => {
    const copy = texts as unknown as {
      cards: Record<string, { overview: string; hand: { shortByTier: Record<string, string> }; equip: { shortByTier: Record<string, string> } }>;
      evolution: Record<string, Record<string, { name: string; summary: string; intent: string; keywords: string[] }>>;
      glossary: Record<string, string>;
      affixHelp: Record<string, string>;
      effectText: { atoms: Record<string, string>; triggers: Record<string, string> };
    };
    for (const card of cfg.skills.cards) {
      expect(copy.cards[card.id]?.overview).toBeTruthy();
      expect(JSON.stringify(copy.cards[card.id])).not.toMatch(/效果说明|即时释放|强化释放|终极释放/);
      for (const checkpoint of card.evolutionTree?.checkpoints ?? []) {
        for (const option of checkpoint.options) {
          const branch = copy.evolution[card.id]?.[option.id];
          expect(branch?.name).toBeTruthy();
          expect(branch?.intent).toBeTruthy();
          expect(branch?.keywords.length).toBeGreaterThan(0);
          expect(branch?.summary).not.toMatch(/分支。$/);
        }
      }
    }
    expect(Object.keys(copy.glossary)).toEqual(expect.arrayContaining(Object.keys(ATOM_LABELS)));
    expect(Object.keys(copy.effectText.atoms)).toHaveLength(34);
    expect(Object.keys(copy.effectText.triggers)).toHaveLength(9);
    expect(Object.keys(copy.affixHelp)).toEqual(expect.arrayContaining(Object.keys(AFFIX_SINKS)));
  });
});
