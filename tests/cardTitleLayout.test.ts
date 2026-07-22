// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardElement } from '../src/ui/slotFactory';

describe('card title layout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each(['cards', 'equipment'] as const)('keeps stars outside the %s card title row', source => {
    const card = createCardElement(
      { id: 1, type: 'chainLightning', star: 6 },
      source,
      0,
      { dragStart: vi.fn() },
    );

    expect(card.querySelector('.card-head .card-name')).not.toBeNull();
    expect(card.querySelector('.card-head .card-stars')).toBeNull();
    expect(card.querySelector(':scope > .card-stars')?.textContent).toHaveLength(6);
  });
});
