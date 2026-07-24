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

  it('shows intent, exact effects, build fit and the 5★ stacking notice', () => {
    document.body.innerHTML = '<button id="restartBtn"></button>';
    const modals = createModals({
      restartBtn: document.querySelector('#restartBtn'),
    } as never, {
      onDecision: vi.fn(),
      onRestart: vi.fn(),
    });
    const state = freshState();
    state.cards[0] = {
      id: 99,
      type: 'chainLightning',
      star: 5,
      provisional: true,
      evolutionPath: ['3:chainLightningA'],
    };
    const decision: RunDecision = {
      kind: 'evolutionBranch',
      cardType: 'chainLightning',
      checkpointStar: 5,
      options: ['chainLightningA2', 'chainLightningB2', 'chainLightningC2'],
      provisionalCardId: 99,
    };

    modals.showDecision(decision, state);
    const body = document.querySelector('#decisionModal .modal-card > p')?.textContent;
    const option = document.querySelector<HTMLButtonElement>('[data-decision-choice="chainLightningB2"]');
    expect(body).toContain('叠加到当前 3★ 路线');
    expect(option?.querySelector('.choice-desc')?.textContent).toMatch(/强化/);
    expect(option?.querySelectorAll('.choice-effects li').length).toBeGreaterThan(0);
    expect(option?.querySelector('.choice-fit')?.textContent).toContain('适合：');
  });
});
