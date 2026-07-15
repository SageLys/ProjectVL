import { describe, it, expect, beforeEach } from 'vitest';
import { spawnGroundDrop, tickDrops, collectDrop, rollDropOnKill } from '../src/core/systems/dropSystem';
import { totalDropChance } from '../src/core/stats';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('dropSystem · lifecycle and collection', () => {
  it('expires ground drops and records the expiry', () => {
    const s = freshState();
    const config = createDefaultConfig();
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'pierce');
    tickDrops(s, config, constRng(0.99), config.dropLifetime + 0.01);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.expired).toBe(1);
  });

  it('uses the configured normal-drop star', () => {
    const s = freshState();
    spawnGroundDrop(s, createDefaultConfig(), constRng(0), 100, 100, 'pierce');
    expect(s.groundDrops[0].star).toBe(1);
  });

  it('collects a drop and automatically merges it with a matching skill', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('pierce', 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'pierce');
    const events = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);
    expect(s.cards.filter(Boolean)).toHaveLength(1);
    expect(s.cards.filter(Boolean)[0]!.star).toBe(2);
    expect(events).toContainEqual({ type: 'merged', cardType: 'pierce', resultStar: 2 });
  });

  it('leaves the drop when the hand is full', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['pierce', 'frost', 'decoy', 'scorch', 'harvest', 'aegis'] as const;
    for (let i = 0; i < s.cards.length; i++) s.cards[i] = card(skills[i % skills.length], (i % 3) + 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'sanctum');
    expect(collectDrop(s, config, constRng(0.99), s.groundDrops[0])).toEqual([{ type: 'cardsFull' }]);
    expect(s.groundDrops).toHaveLength(1);
  });
});

describe('dropSystem · chance and bosses', () => {
  it('applies the active skill drop-rate multiplier and caps chance', async () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.9;
    const { cfg } = await import('../src/config');
    const { registerSkillDefs } = await import('../src/core/effects/interpreter');
    registerSkillDefs(cfg.skills.cards);
    s.equipment[0] = card('harvest', 3);
    expect(totalDropChance(s, config)).toBe(0.95);
  });

  it('always drops from a boss', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'boss', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(1);
  });
});
