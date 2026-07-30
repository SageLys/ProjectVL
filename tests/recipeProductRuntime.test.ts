import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { fireTrigger, registerSkillDefs } from '../src/core/effects/interpreter';
import { tickEffects } from '../src/core/effects/runtime';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { card, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();

function observable(state: ReturnType<typeof freshState>) {
  return {
    hp: state.hp,
    enemyHp: state.enemies.reduce((sum, item) => sum + item.hp, 0),
    bullets: state.bullets.length,
    zones: state.zones.length,
    summons: state.summons.length,
    drops: state.groundDrops.length,
    shield: state.shield?.hits ?? 0,
    modifiers: state.statModifiers.length,
    charges: Object.values(state.effectRuntime.charges).reduce((sum, value) => sum + value, 0),
    statuses: state.enemies.reduce((sum, item) => sum
      + Number(item.status.slow !== null) + Number(item.status.vulnerable !== null)
      + Number(item.status.frozen > 0) + item.status.dots.length, 0),
  };
}

function preparedState() {
  const state = freshState();
  state.hp = 50;
  state.enemies = Array.from({ length: 8 }, (_, index) => enemy({
    x: 280 + index * 25, y: 320 + (index % 2) * 30, hp: 5000, maxHp: 5000,
  }));
  for (const target of state.enemies) {
    target.status.slow = { ratio: 0.2, remaining: 10 };
    target.status.vulnerable = { ratio: 0.2, remaining: 10 };
    target.status.frozen = 2;
    target.status.dots.push({ dps: 1, remaining: 10 });
    target.status.brand = { weight: 2, remaining: 10 };
  }
  return state;
}

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

describe('25 formal recipe products · runtime smoke', () => {
  it.each(cfg.skills.cards.filter(item => item.recipeOnly).map(item => [item.id] as const))(
    '%s has an immediately observable consumable payload',
    cardType => {
      const state = preparedState();
      state.cards[0] = card(cardType, 6);
      const before = observable(state);
      const events = consumeCard(state, config, () => 0, 0, 360, 350);
      const after = observable(state);
      expect(events).toContainEqual(expect.objectContaining({ type: 'skillConsumed', cardType }));
      expect(after, cardType).not.toEqual(before);
    },
  );

  it.each(cfg.skills.cards.filter(item => item.recipeOnly).map(item => [item.id] as const))(
    '%s exposes its first equipped signature within five seconds',
    cardType => {
      const state = preparedState();
      state.equipment[0] = card(cardType, 6);
      const before = observable(state);
      const target = state.enemies[0];
      const payload = { enemy: target, point: { x: target.x, y: target.y }, source: 'dot', damage: 0, merge: { cardType: 'pierce', resultStar: 3 } };
      for (const trigger of ['onWaveStart', 'onFire', 'onHit', 'onPickup', 'onMerge', 'onBreach', 'onKill'] as const) {
        fireTrigger(state, config, () => 0, trigger, payload);
      }
      for (let elapsed = 0; elapsed < 5; elapsed += 0.25) tickEffects(state, config, () => 0, 0.25);
      expect(observable(state), cardType).not.toEqual(before);
    },
  );
});
