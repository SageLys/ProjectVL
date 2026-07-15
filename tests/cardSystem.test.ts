import { describe, it, expect, beforeEach } from 'vitest';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

describe('cardSystem · automatic merging', () => {
  it('merges two matching 1-star skill cards into one 2-star card', () => {
    const s = freshState();
    s.cards[0] = card('pierce', 1);
    s.cards[1] = card('pierce', 1);
    const { merged, events } = autoMergeCards(s, config, rng);
    expect(merged).toBe(1);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
    expect(s.merges).toBe(1);
    expect(events).toContainEqual({ type: 'merged', cardType: 'pierce', resultStar: 2 });
  });

  it('continues merging through the resulting stars', () => {
    const s = freshState();
    for (let i = 0; i < 4; i++) s.cards[i] = card('frost', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(3);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(3);
  });

  it('does not merge cards at the configured star cap', () => {
    const s = freshState();
    s.cards[0] = card('pierce', 6);
    s.cards[1] = card('pierce', 6);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
    expect(s.cards.filter(Boolean)).toHaveLength(2);
  });

  it('does not merge different skills', () => {
    const s = freshState();
    s.cards[0] = card('pierce', 1);
    s.cards[1] = card('frost', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
  });

  it('merges across empty hand slots', () => {
    const s = freshState();
    s.cards[0] = card('sanctum', 1);
    s.cards[2] = card('sanctum', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(1);
  });
});
