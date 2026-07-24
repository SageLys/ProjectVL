// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunDecision } from '../src/core/types';
import { createModals } from '../src/ui/modals';
import { freshState, resetTestEnv } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
  resetTestEnv();
});

describe('decision modal', () => {
  it('keeps choice buttons stable across frame-by-frame UI synchronization', () => {
    document.body.innerHTML = [
      '<button id="restartBtn"></button>',
    ].join('');
    const onDecision = vi.fn();
    const modals = createModals({
      restartBtn: document.querySelector('#restartBtn'),
    } as never, {
      onDecision,
      onRestart: vi.fn(),
    });
    const decision: RunDecision = {
      kind: 'godDraft',
      wave: 1,
      candidates: ['storm', 'winter', 'inferno'],
      role: 'main',
    };
    const state = freshState();

    modals.showDecision(decision, state);
    const buttonBeforeFrame = document.querySelector<HTMLButtonElement>(
      '[data-decision-choice="storm"]',
    );
    modals.showDecision(decision, state);
    const buttonAfterFrame = document.querySelector<HTMLButtonElement>(
      '[data-decision-choice="storm"]',
    );

    expect(buttonAfterFrame).toBe(buttonBeforeFrame);
    buttonAfterFrame?.click();
    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith('storm');
  });
});
