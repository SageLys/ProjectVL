// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCardDetailModal } from '../src/ui/cardDetailModal';
import { resolvePauseState } from '../src/ui/pauseState';

afterEach(() => document.body.replaceChildren());

describe('card detail pause and focus', () => {
  it('composes manual and detail pause reasons without losing manual pause', () => {
    const reasons = new Set<string>();
    expect(resolvePauseState(false, reasons)).toBe(false);
    reasons.add('cardDetail');
    expect(resolvePauseState(false, reasons)).toBe(true);
    expect(resolvePauseState(true, reasons)).toBe(true);
    reasons.clear();
    expect(resolvePauseState(true, reasons)).toBe(true);
  });

  it.each(['button', 'escape', 'backdrop'] as const)('closes by %s and restores card focus', method => {
    const source = document.createElement('button');
    document.body.append(source);
    source.focus();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const modal = createCardDetailModal({ onOpen, onClose });
    modal.open({ id: 1, type: 'chainLightning', star: 3, evolutionPath: ['3:chainLightningA'] }, 'cards', source);
    expect(modal.isOpen()).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('.card-detail-close'));

    if (method === 'button') document.querySelector<HTMLButtonElement>('.card-detail-close')?.click();
    if (method === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    if (method === 'backdrop') {
      const backdrop = document.querySelector<HTMLElement>('.card-detail-modal');
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(modal.isOpen()).toBe(false);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(source);
    modal.destroy();
  });
});
