import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { runEffects, type EffectCtx } from '../src/core/effects/registry';
import { resolveCardVisual } from '../src/presentation/cardVisual';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

describe('skill-colored area effects', () => {
  it.each(['frost', 'scorch', 'impact', 'sanctum', 'thorns'])(
    'inherits the %s accent for its ground area',
    sourceCardType => {
      const state = freshState();
      const ctx: EffectCtx = {
        state,
        config: createDefaultConfig(),
        rng: constRng(0.5),
        events: [],
        origin: { x: 200, y: 200 },
        star: 3,
        baseDamage: 10,
        sourceCardType,
      };

      runEffects(ctx, [{ atom: 'groundZone', params: { radius: 40, duration: 1, effects: [] } }]);

      expect(state.zones[0].color).toBe(resolveCardVisual(sourceCardType).accent);
    },
  );

  it('keeps the burning accent red', () => {
    expect(resolveCardVisual('scorch').accent).toBe('#F05252');
  });
});
