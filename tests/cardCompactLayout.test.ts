// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardElement } from '../src/ui/slotFactory';

describe('compact card layout', () => {
  beforeEach(() => document.body.replaceChildren());

  it('keeps only title, stars and compact affixes on the primary card face', () => {
    const card = createCardElement({
      id: 1,
      type: 'chainLightning',
      star: 5,
      evolutionPath: ['3:chainLightningA', '5:chainLightningB2'],
      affixes: [
        { stat: 'effectDamageMul', value: 0.1, consumableDuration: 5 },
        { stat: 'controlledDamageTakenMul', value: 0.15, consumableDuration: 4 },
      ],
    }, 'cards', 0, { dragStart: vi.fn(), inspect: vi.fn() });

    expect(card.querySelector('.card-head > .card-name')).not.toBeNull();
    expect(card.querySelector(':scope > .card-stars')?.textContent).toHaveLength(5);
    expect(card.querySelector('.card-head .card-stars')).toBeNull();
    expect(card.querySelector('.card-overview')?.textContent).toBe('电流会顺着人群一路传下去——他带来的朋友越多，你越省事。');
    expect(card.querySelector('.card-affix-compact')).not.toBeNull();
    expect(card.querySelectorAll('.card-affix-compact .card-affix')).toHaveLength(2);
    expect(card.querySelector('.card-affix .affix-short')?.textContent).toBe('效伤');
    expect(card.querySelector('.card-affix .affix-full')?.textContent).toBe('效果伤害');
    expect(card.querySelector('.card-affix')?.getAttribute('title')).toBe('效果伤害 +10%');
    expect(card.querySelector('.card-desc')).toBeNull();
    expect(card.querySelector('.card-skill-section')).toBeNull();
    expect(card.querySelector('.card-evolution-route')).toBeNull();

    const equipment = createCardElement({
      id: 2,
      type: 'chainLightning',
      star: 5,
      affixes: [
        { stat: 'effectDamageMul', value: 0.1, consumableDuration: 5 },
        { stat: 'controlledDamageTakenMul', value: 0.15, consumableDuration: 4 },
      ],
    }, 'equipment', 0, { dragStart: vi.fn(), inspect: vi.fn() });
    expect(equipment.querySelector('.card-overview')?.textContent).toBe('电流会顺着人群一路传下去——他带来的朋友越多，你越省事。');
  });

  it('shows a size-neutral empty marker and dispatches inspection on click', () => {
    const inspect = vi.fn();
    const card = createCardElement(
      { id: 2, type: 'frost', star: 1 },
      'cards',
      3,
      { dragStart: vi.fn(), inspect },
    );
    card.click();
    expect(card.querySelector('.card-affix-compact')?.textContent).toBe('—');
    expect(inspect).toHaveBeenCalledWith('cards', 3, card);
  });
});
