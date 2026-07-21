import { describe, it, expect, beforeEach } from 'vitest';
import { spawnGroundDrop, tickDrops, collectDrop, rollDropOnKill, tickOrdinaryDropBudget } from '../src/core/systems/dropSystem';
import { totalDropChance } from '../src/core/stats';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv, seqRng } from './helpers';
import { cfg } from '../src/config';

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
    expect(events).toContainEqual(expect.objectContaining({ type: 'merged', cardType: 'pierce', resultStar: 2, resultCardId: expect.any(Number) }));
  });

  it('leaves the drop when the hand is full', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['pierce', 'frost', 'decoy', 'scorch', 'harvest', 'aegis'] as const;
    for (let i = 0; i < s.cards.length; i++) s.cards[i] = card(skills[i % skills.length], (i % 3) + 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'sanctum');
    expect(collectDrop(s, config, constRng(0.99), s.groundDrops[0])).toEqual([
      expect.objectContaining({ type: 'cardsFull', dropId: expect.any(Number), star: 1 }),
    ]);
    expect(s.groundDrops).toHaveLength(1);
  });

  it('collects a matching drop from a full hand and merges it', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['frost', 'decoy', 'scorch', 'harvest', 'aegis', 'sanctum'] as const;
    s.cards[0] = card('pierce', 1);
    for (let i = 0; i < skills.length; i++) s.cards[i + 1] = card(skills[i], 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'pierce');

    const events = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);

    expect(events).not.toContainEqual({ type: 'cardsFull' });
    expect(s.groundDrops).toHaveLength(0);
    expect(s.collected).toBe(1);
    expect(s.cards).toHaveLength(7);
    expect(s.cards).toContainEqual(expect.objectContaining({ type: 'pierce', star: 2 }));
    expect(s.merges).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'merged', cardType: 'pierce', resultStar: 2, resultCardId: expect.any(Number) }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'collected', cardType: 'pierce', merges: 1 }));
  });

  it('collects from a full hand and supports chain merges', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['frost', 'decoy', 'scorch', 'harvest', 'aegis'] as const;
    s.cards[0] = card('pierce', 1);
    s.cards[1] = card('pierce', 2);
    for (let i = 0; i < skills.length; i++) s.cards[i + 2] = card(skills[i], 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'pierce');

    const events = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);

    expect(s.groundDrops).toHaveLength(0);
    expect(s.cards).toHaveLength(7);
    expect(s.cards).toContainEqual(expect.objectContaining({ type: 'pierce', star: 3 }));
    expect(s.cards.filter(card => card === null)).toHaveLength(1);
    expect(s.merges).toBe(2);
    expect(events.filter(event => event.type === 'merged')).toEqual([
      expect.objectContaining({ type: 'merged', cardType: 'pierce', resultStar: 2, resultCardId: expect.any(Number) }),
      expect.objectContaining({ type: 'merged', cardType: 'pierce', resultStar: 3, resultCardId: expect.any(Number) }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'collected', cardType: 'pierce', merges: 2 }));
  });

  it('rejects a full hand when only the card type matches at a different star', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['pierce', 'frost', 'decoy', 'scorch', 'harvest', 'aegis', 'sanctum'] as const;
    for (let i = 0; i < skills.length; i++) s.cards[i] = card(skills[i], i === 0 ? 2 : 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'pierce');
    const cardsBefore = structuredClone(s.cards);
    const collectedBefore = s.collected;
    const mergesBefore = s.merges;
    const nextCardIdBefore = s.nextCardId;

    expect(collectDrop(s, config, constRng(0.99), s.groundDrops[0])).toEqual([
      expect.objectContaining({ type: 'cardsFull', dropId: expect.any(Number), star: 1 }),
    ]);
    expect(s.groundDrops).toHaveLength(1);
    expect(s.cards).toEqual(cardsBefore);
    expect(s.collected).toBe(collectedBefore);
    expect(s.merges).toBe(mergesBefore);
    expect(s.nextCardId).toBe(nextCardIdBefore);
  });

  it('rejects a matching maximum-star drop from a full hand', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const skills = ['pierce', 'frost', 'decoy', 'scorch', 'harvest', 'aegis', 'sanctum'] as const;
    for (let i = 0; i < skills.length; i++) s.cards[i] = card(skills[i], i === 0 ? 6 : 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'pierce', 6);
    const cardsBefore = structuredClone(s.cards);
    const collectedBefore = s.collected;
    const mergesBefore = s.merges;
    const nextCardIdBefore = s.nextCardId;

    expect(collectDrop(s, config, constRng(0.99), s.groundDrops[0])).toEqual([
      expect.objectContaining({ type: 'cardsFull', dropId: expect.any(Number), star: 6 }),
    ]);
    expect(s.groundDrops).toHaveLength(1);
    expect(s.cards).toEqual(cardsBefore);
    expect(s.collected).toBe(collectedBefore);
    expect(s.merges).toBe(mergesBefore);
    expect(s.nextCardId).toBe(nextCardIdBefore);
  });
});

describe('dropSystem · chance and bosses', () => {
  it('applies the active skill drop-rate multiplier and caps chance', async () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.9;
    const { registerSkillDefs } = await import('../src/core/effects/interpreter');
    registerSkillDefs(cfg.skills.cards);
    s.equipment[0] = card('harvest', 3);
    expect(totalDropChance(s, config)).toBe(0.95);
  });

  it('does not create a normal card drop from a wave Boss', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'boss', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(0);
  });

  it('preserves normal chance gating, one-star policy, and configured lifetime', () => {
    cfg.economy.ordinaryDropRate.enabled = false;
    const state = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
    rollDropOnKill(state, config, constRng(0.5), enemy());
    expect(state.groundDrops).toHaveLength(0);
    expect(state.normalDropDirector.ordinaryDropCount).toBe(0);

    config.dropChance = 1;
    config.dropLifetime = 9;
    rollDropOnKill(state, config, seqRng(0, 0.2, 0.4, 0.6, 0.8), enemy());
    expect(state.groundDrops).toHaveLength(1);
    expect(state.groundDrops[0]).toEqual(expect.objectContaining({ star: 1, life: 9, maxLife: 9 }));
  });
});

describe('ordinary drop time budget', () => {
  function run(seconds: number, killsPerTick: number, wave = 1) {
    const state = freshState();
    const config = createDefaultConfig();
    state.wave = wave;
    const dt = 0.1;
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
      tickOrdinaryDropBudget(state, dt);
      for (let kill = 0; kill < killsPerTick; kill++) rollDropOnKill(state, config, constRng(0.2), enemy());
    }
    return state;
  }

  it('holds selection output at 35/min independently of excess kill speed', () => {
    const normalKills = run(60, 1);
    const doubleKills = run(60, 2);
    expect(normalKills.ordinaryDrop.shownThisWave).toBeGreaterThanOrEqual(33);
    expect(normalKills.ordinaryDrop.shownThisWave).toBeLessThanOrEqual(37);
    expect(doubleKills.ordinaryDrop.shownThisWave).toBe(normalKills.ordinaryDrop.shownThisWave);
  });

  it('finishes the build ramp once, then sustains 40/min', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.wave = 3;
    for (let i = 0; i < 200; i++) {
      tickOrdinaryDropBudget(state, 0.1);
      rollDropOnKill(state, config, constRng(0.2), enemy());
    }
    expect(state.ordinaryDrop.buildStageSeconds).toBeCloseTo(20, 8);
    state.ordinaryDrop.shownThisWave = 0;
    state.ordinaryDrop.activeRegularSeconds = 0;
    for (let i = 0; i < 600; i++) {
      tickOrdinaryDropBudget(state, 0.1);
      rollDropOnKill(state, config, constRng(0.2), enemy());
    }
    expect(state.ordinaryDrop.shownThisWave).toBeGreaterThanOrEqual(38);
    expect(state.ordinaryDrop.shownThisWave).toBeLessThanOrEqual(42);
  });

  it('caps carry and never accrues during boss, between, pause, or validation', () => {
    const state = freshState();
    state.wave = 1;
    tickOrdinaryDropBudget(state, 120);
    expect(state.ordinaryDrop.credit).toBe(cfg.economy.ordinaryDropRate.carryCap);
    state.ordinaryDrop.credit = 0;
    for (const phase of ['boss', 'between'] as const) {
      state.wavePhase = phase;
      tickOrdinaryDropBudget(state, 10);
    }
    state.wavePhase = 'regular';
    state.paused = true;
    tickOrdinaryDropBudget(state, 10);
    state.paused = false;
    state.wave = 7;
    tickOrdinaryDropBudget(state, 10);
    expect(state.ordinaryDrop.credit).toBe(0);
    expect(state.ordinaryDrop.activeRegularSeconds).toBe(120);
  });
});
