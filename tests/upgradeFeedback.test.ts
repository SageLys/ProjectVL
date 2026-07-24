import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/core/types';
import { resolveUpgradeCandidates } from '../src/ui/upgradeFeedback';

describe('upgradeFeedback · milestone selection', () => {
  it('does not trigger pure 2-star or 4-star growth', () => {
    const events: GameEvent[] = [
      { type: 'merged', cardType: 'pierce', resultStar: 2, resultCardId: 12 },
      { type: 'fed', cardType: 'pierce', resultStar: 4, slotIndex: 0, targetCardId: 20 },
    ];
    expect(resolveUpgradeCandidates(events)).toEqual([]);
  });

  it('uses exact tiers for feeding and nearest lower milestone for first equip', () => {
    expect(resolveUpgradeCandidates([{ type: 'fed', cardType: 'pierce', resultStar: 5, slotIndex: 1, targetCardId: 30 }]))
      .toMatchObject([{ fx: 'major', source: 'equipment', targetCardId: 30, slotIndex: 1 }]);
    expect(resolveUpgradeCandidates([{ type: 'equipped', cardType: 'pierce', star: 4, slotIndex: 2 }]))
      .toMatchObject([{ fx: 'core', source: 'equipment', slotIndex: 2 }]);
  });

  it('prioritizes transforms and breaks equal ties in favor of equipment', () => {
    const candidates = resolveUpgradeCandidates([
      { type: 'merged', cardType: 'pierce', resultStar: 6, resultCardId: 41 },
      { type: 'fed', cardType: 'pierce', resultStar: 5, slotIndex: 0, targetCardId: 42 },
      { type: 'equipped', cardType: 'frost', star: 6, slotIndex: 1 },
    ]);
    expect(candidates.map(candidate => [candidate.fx, candidate.source])).toEqual([
      ['transform', 'equipment'],
      ['transform', 'hand'],
      ['major', 'equipment'],
    ]);
  });

  it('provides the completed sanctum terminal hand milestone', () => {
    expect(resolveUpgradeCandidates([{ type: 'merged', cardType: 'sanctum', resultStar: 6, resultCardId: 50 }]))
      .toMatchObject([{ cardType: 'sanctum', fx: 'transform', source: 'hand', targetCardId: 50 }]);
  });

  it('reuses hand and equipment milestones for wildcard merges', () => {
    expect(resolveUpgradeCandidates([{
      type: 'wildcardMerged', cardType: 'pierce', consumedStar: 2, resultStar: 3,
      targetKind: 'equipment', targetIndex: 1, targetCardId: 60,
    }])).toMatchObject([{ fx: 'core', source: 'equipment', targetCardId: 60, slotIndex: 1 }]);
    expect(resolveUpgradeCandidates([{
      type: 'wildcardMerged', cardType: 'pierce', consumedStar: 5, resultStar: 6,
      targetKind: 'cards', targetIndex: 0, targetCardId: 61,
    }])).toMatchObject([{ fx: 'transform', source: 'hand', targetCardId: 61 }]);
  });
});
