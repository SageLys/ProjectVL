// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRewardReceiptModal } from '../src/ui/rewardReceiptModal';

afterEach(() => document.body.replaceChildren());

describe('reward receipt modal', () => {
  it('uses the shared modal visibility class and confirms from the focused button', () => {
    const onConfirm = vi.fn();
    const receiptModal = createRewardReceiptModal(onConfirm);
    const modal = document.querySelector<HTMLElement>('#rewardReceiptModal');

    receiptModal.show({
      rewardId: 'heartbreakNova',
      activationIndex: 0,
      result: { damageDealt: 120, enemiesKilled: 2 },
    });

    expect(modal?.classList.contains('show')).toBe(true);
    const confirm = modal?.querySelector<HTMLButtonElement>('button');
    expect(document.activeElement).toBe(confirm);
    confirm?.click();
    expect(onConfirm).toHaveBeenCalledOnce();

    receiptModal.hide();
    expect(modal?.classList.contains('show')).toBe(false);
  });
});
