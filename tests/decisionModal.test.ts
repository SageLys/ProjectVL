// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunDecision } from '../src/core/types';
import { cfg } from '../src/config';
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

  it('shows only god theme and sampled base roster, never candidate recipes or outputs', () => {
    document.body.innerHTML = '<button id="restartBtn"></button>';
    const modals = createModals({ restartBtn: document.querySelector('#restartBtn') } as never, {
      onDecision: vi.fn(), onRestart: vi.fn(),
    });
    const state = freshState();
    state.godPool.offerRosterPreviews.storm = ['chainLightning', 'pierce'];
    modals.showDecision({ kind: 'godDraft', wave: 1, candidates: ['storm'], role: 'main' }, state);
    const choice = document.querySelector('[data-decision-choice="storm"]')!;
    expect(choice.querySelector('.god-roster-preview')).not.toBeNull();
    expect(choice.querySelector('.god-recipe-preview')).toBeNull();
    expect(choice.textContent).not.toContain('候选·');
    for (const recipe of cfg.evolutionRecipes.recipes) {
      expect(choice.textContent).not.toContain(recipe.outputCardId);
    }
  });

  it('shows player summary, exact effects and the 5★ stacking notice; no choice-fit element', () => {
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
      options: ['chainLightning1x', 'chainLightning2x', 'chainLightning3x'],
      provisionalCardId: 99,
    };

    modals.showDecision(decision, state);
    const body = document.querySelector('#decisionModal .modal-shell-header > p')?.textContent;
    const option = document.querySelector<HTMLButtonElement>('[data-decision-choice="chainLightning2x"]');
    expect(body).toContain('叠加到当前 3★ 路线');
    // .choice-desc 展示玩家向 summary（长度大于 0）
    expect(option?.querySelector('.choice-desc')?.textContent?.trim().length).toBeGreaterThan(0);
    expect(option?.querySelectorAll('.choice-effects li').length).toBeGreaterThan(0);
    // 「适合：」行已删除
    expect(option?.querySelector('.choice-fit')).toBeNull();
  });
});
