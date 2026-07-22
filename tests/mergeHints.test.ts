// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../src/config';
import { findMergeHintPairs, renderMergeHints } from '../src/ui/renderMergeHints';
import { card, freshState, resetTestEnv } from './helpers';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

beforeEach(() => {
  resetTestEnv();
  document.body.innerHTML = '';
});

describe('merge hint links', () => {
  it('links matching same-star hand and equipment cards but ignores non-matches and capped cards', () => {
    const state = freshState();
    const equipped = card('pierce', 3);
    const matching = card('pierce', 3);
    state.equipment[0] = equipped;
    state.cards[0] = matching;
    state.cards[1] = card('pierce', 2);
    state.cards[2] = card('frost', 3);
    state.cards[3] = card('frost', cfg.economy.maxStar);
    state.equipment[1] = card('frost', cfg.economy.maxStar);

    expect(findMergeHintPairs(state)).toEqual([{ fromCardId: equipped.id, toCardId: matching.id }]);
  });

  it('renders a non-interactive white SVG link between the matching card edges', () => {
    const state = freshState();
    const equipped = card('pierce', 3);
    const matching = card('pierce', 3);
    state.equipment[0] = equipped;
    state.cards[0] = matching;
    document.body.innerHTML = `<section id="dock"><button class="card" data-id="${equipped.id}"></button><button class="card" data-id="${matching.id}"></button></section>`;
    const dock = document.querySelector<HTMLElement>('#dock')!;
    const cards = dock.querySelectorAll<HTMLElement>('.card');
    vi.spyOn(dock, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 500, 220));
    vi.spyOn(cards[0], 'getBoundingClientRect').mockReturnValue(rect(30, 40, 120, 80));
    vi.spyOn(cards[1], 'getBoundingClientRect').mockReturnValue(rect(210, 150, 80, 60));

    renderMergeHints(dock, state);

    const hint = dock.querySelector<SVGElement>('.merge-hints');
    expect(hint?.getAttribute('aria-hidden')).toBe('true');
    expect(hint?.querySelectorAll('.merge-hint-line')).toHaveLength(1);
    expect(hint?.querySelector('.merge-hint-line')?.getAttribute('d')).toMatch(/^M .+ Q .+$/);
  });

  it('removes an obsolete link as soon as the cards stop matching', () => {
    const state = freshState();
    const equipped = card('pierce', 3);
    state.equipment[0] = equipped;
    state.cards[0] = card('pierce', 3);
    document.body.innerHTML = `<section id="dock"><button class="card" data-id="${equipped.id}"></button><button class="card" data-id="${state.cards[0]!.id}"></button></section>`;
    const dock = document.querySelector<HTMLElement>('#dock')!;
    vi.spyOn(dock, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 300, 200));
    dock.querySelectorAll<HTMLElement>('.card').forEach((element, index) => {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(20 + index * 150, 40, 100, 70));
    });
    renderMergeHints(dock, state);
    expect(dock.querySelector('.merge-hints')).not.toBeNull();

    state.cards[0]!.star = 4;
    renderMergeHints(dock, state);
    expect(dock.querySelector('.merge-hints')).toBeNull();
  });
});
