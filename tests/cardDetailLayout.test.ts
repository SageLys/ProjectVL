// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCardDetailModal } from '../src/ui/cardDetailModal';

afterEach(() => document.body.replaceChildren());

describe('card detail information hierarchy', () => {
  it('collapses secondary sections, opens selected branches, and keeps current data first', () => {
    const modal = createCardDetailModal({ onOpen: vi.fn(), onClose: vi.fn() });
    modal.open({
      id: 10,
      type: 'chainLightning',
      star: 5,
      evolutionPath: ['3:chainLightningA', '5:chainLightning2x'],
    }, 'cards');

    const tree = document.querySelector<HTMLDetailsElement>('details[data-section="skill-tree"]')!;
    const glossary = document.querySelector<HTMLDetailsElement>('details[data-section="glossary"]')!;
    const effects = document.querySelector<HTMLElement>('.card-detail-scroll > .card-detail-group:not(details)')!;
    const affixes = effects.nextElementSibling as HTMLElement;
    expect(tree.open).toBe(false);
    expect(glossary.open).toBe(false);
    expect(document.querySelectorAll<HTMLDetailsElement>('.skill-tree-option.is-selected[open]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll<HTMLDetailsElement>('.skill-tree-option:not(.is-selected)[open]')).toHaveLength(0);
    expect(effects.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(affixes.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    modal.destroy();
  });
});
