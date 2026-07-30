// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRewardCelebration, REWARD_CELEBRATION_MS } from '../src/ui/rewardCelebration';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('reward celebration', () => {
  it('shows a non-blocking top banner and completes automatically without a button', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const celebration = createRewardCelebration(onComplete);
    const root = document.querySelector<HTMLElement>('#rewardCelebration');

    celebration.show({
      rewardId: 'heartbreakNova',
      activationIndex: 0,
      result: { damageDealt: 120, enemiesKilled: 2 },
    });

    expect(root?.classList.contains('show')).toBe(true);
    expect(root?.classList.contains('modal')).toBe(false);
    expect(root?.querySelector('button')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REWARD_CELEBRATION_MS);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(root?.classList.contains('show')).toBe(false);
  });
});
