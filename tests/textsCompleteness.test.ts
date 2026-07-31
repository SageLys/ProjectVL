import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { resolveText, resolveTextNode, texts } from '../src/data';

describe('text key completeness', () => {
  it('resolves reward, card, evolution, god and tuner keys', () => {
    for (const reward of cfg.rewardMeter.rewards) {
      expect(resolveText(`${reward.textKey}.name`), reward.id).toBeTruthy();
      expect(resolveText(`${reward.textKey}.desc`), reward.id).toBeTruthy();
    }
    for (const card of cfg.skills.cards) {
      expect(resolveTextNode(card.textKey), card.id).toBeDefined();
      for (const checkpoint of card.evolutionTree?.checkpoints ?? []) for (const option of checkpoint.options) expect(resolveTextNode(option.textKey)).toBeDefined();
    }
    for (const god of cfg.gods.gods) expect(resolveTextNode(god.textKey)).toBeDefined();
    for (const param of cfg.tuner.params) expect(resolveText(param.labelKey), param.path).toBeTruthy();
  });
  it('contains no orphan reward text', () => {
    const ids = new Set(cfg.rewardMeter.rewards.map(reward => reward.id));
    const copy = (texts as unknown as { rewards: Record<string, unknown> }).rewards;
    expect(new Set(Object.keys(copy))).toEqual(ids);
  });
});
