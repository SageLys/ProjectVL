import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { addXp, applyPerk, levelUp, rollPerkChoices } from '../src/core/systems/progressionSystem';
import { totalDamage, totalFireRate, totalRange } from '../src/core/stats';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('progressionSystem · experience and level-up queue', () => {
  it('rounds the geometric XP curve each level', () => {
    cfg.progression.xpNeedBase = 8; cfg.progression.xpGrowth = 1.35; // 本用例专测几何取整曲线（base 焙入后为 10/2）
    const state = freshState();
    levelUp(state, constRng(0));
    expect(state.xpNeed).toBe(Math.round(8 * 1.35));
    levelUp(state, constRng(0));
    expect(state.xpNeed).toBe(Math.round(11 * 1.35));
  });

  it('settles every crossed level and queues every perk selection', () => {
    cfg.progression.xpNeedBase = 8; cfg.progression.xpGrowth = 1.35; // 同上，固定曲线以校验跨级结算
    const state = freshState();
    const events = addXp(state, 34, createSeededRng(42));

    expect(events).toEqual([{ type: 'levelUp' }, { type: 'levelUp' }, { type: 'levelUp' }]);
    expect(state.level).toBe(4);
    expect(state.xp).toBe(0);
    expect(state.xpNeed).toBe(20);
    expect(state.pendingLevelUps).toBe(3);
    expect(state.offeredPerks).toHaveLength(3);
    expect(state.paused).toBe(true);
  });

  it('does not level before the current threshold', () => {
    const state = freshState();
    expect(addXp(state, 3, constRng(0))).toEqual([]);
    expect(state.level).toBe(1);
    expect(state.xp).toBe(3);
  });
});

describe('progressionSystem · weighted perk choices', () => {
  it('is deterministic, returns the configured count, and never repeats an id', () => {
    const first = rollPerkChoices(freshState(), createSeededRng(20260714));
    const second = rollPerkChoices(freshState(), createSeededRng(20260714));

    expect(first).toEqual(second);
    expect(first).toHaveLength(cfg.progression.perkChoices);
    expect(new Set(first).size).toBe(first.length);
  });

  it('caps the count to eligible perks and excludes perks at max stacks', () => {
    const state = freshState();
    for (const perk of cfg.progression.perks) state.perkStacks[perk.id] = perk.maxStacks;
    state.perkStacks.damage = cfg.progression.perks.find(perk => perk.id === 'damage')!.maxStacks - 1;
    state.perkStacks.rate = cfg.progression.perks.find(perk => perk.id === 'rate')!.maxStacks - 1;

    expect(rollPerkChoices(state, constRng(0))).toEqual(['damage', 'rate']);
    state.perkStacks.damage++;
    expect(rollPerkChoices(state, constRng(0))).toEqual(['rate']);
  });
});

describe('progressionSystem · applying perks', () => {
  it('rejects an id that was not offered without changing state', () => {
    const state = freshState();
    state.pendingLevelUps = 1;
    state.offeredPerks = ['damage'];
    state.paused = true;
    const before = structuredClone(state);

    expect(applyPerk(state, createDefaultConfig(), 'rate', constRng(0))).toEqual([]);
    expect(state).toEqual(before);
  });

  it('applies a choice, records its stack, and resumes when the queue is empty', () => {
    const state = freshState();
    const config = createDefaultConfig();
    const before = totalDamage(state, config);
    state.pendingLevelUps = 1;
    state.offeredPerks = ['damage'];
    state.paused = true;

    expect(applyPerk(state, config, 'damage', constRng(0))).toEqual([
      { type: 'perkApplied', title: cfg.progression.perks.find(perk => perk.id === 'damage')!.title },
    ]);
    expect(state.damageBonus).toBeCloseTo(before * 0.2);
    expect(state.perkStacks.damage).toBe(1);
    expect(state.pendingLevelUps).toBe(0);
    expect(state.offeredPerks).toEqual([]);
    expect(state.paused).toBe(false);
  });

  it('rolls a new offer and stays paused while queued levels remain', () => {
    const state = freshState();
    state.pendingLevelUps = 2;
    state.offeredPerks = ['repair'];
    state.paused = true;

    const events = applyPerk(state, createDefaultConfig(), 'repair', createSeededRng(7));
    expect(events[events.length - 1]).toEqual({ type: 'levelUp' });
    expect(state.perkStacks.repair).toBe(1);
    expect(state.pendingLevelUps).toBe(1);
    expect(state.offeredPerks).toHaveLength(3);
    expect(state.paused).toBe(true);
  });

  it('supports max HP, range, XP gain, fire rate, and capped healing from config values', () => {
    const state = freshState();
    const config = createDefaultConfig();
    config.range = 100;
    const baseRate = totalFireRate(state, config);
    const baseRange = totalRange(state, config);

    for (const id of ['maxhp', 'range', 'xpgain', 'rate', 'repair']) {
      state.pendingLevelUps = 1;
      state.offeredPerks = [id];
      if (id === 'repair') state.hp = state.maxHp - 5;
      applyPerk(state, config, id, constRng(0));
    }

    expect(state.maxHp).toBe(115);
    expect(state.hp).toBe(115);
    expect(state.rangeBonus).toBeCloseTo(0.08);
    expect(totalRange(state, config)).toBeGreaterThan(baseRange);
    expect(state.xpGainBonus).toBeCloseTo(0.12);
    expect(state.fireRateBonus).toBeCloseTo(baseRate * 0.15);
  });
});
