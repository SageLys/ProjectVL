import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { resolveEquipBindings } from '../src/core/effects/interpreter';
import { addXp, applyPerk, levelUp, rollPerkChoices } from '../src/core/systems/progressionSystem';
import { selectNormalEnemyDropType } from '../src/core/systems/dropTypePolicy';
import { totalDamage, totalFireRate } from '../src/core/stats';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('progressionSystem · experience and level-up queue', () => {
  it('rounds the geometric XP curve each level', () => {
    cfg.progression.xpNeedBase = 8; cfg.progression.xpGrowth = 1.35;
    const state = freshState();
    levelUp(state, constRng(0));
    expect(state.xpNeed).toBe(Math.round(8 * 1.35));
    levelUp(state, constRng(0));
    expect(state.xpNeed).toBe(Math.round(11 * 1.35));
  });

  it('settles every crossed level and preserves the queued choice flow', () => {
    const state = freshState();
    const events = addXp(state, 30, createSeededRng(42));
    expect(events).toEqual([{ type: 'levelUp' }, { type: 'levelUp' }]);
    expect(state.level).toBe(3);
    expect(state.pendingLevelUps).toBe(2);
    expect(state.offeredPerks).toHaveLength(3);

    const first = state.offeredPerks[0];
    const firstEvents = applyPerk(state, createDefaultConfig(), first, createSeededRng(7));
    expect(firstEvents[firstEvents.length - 1]).toEqual({ type: 'levelUp' });
    expect(state.pendingLevelUps).toBe(1);
    expect(state.offeredPerks).toHaveLength(3);
    applyPerk(state, createDefaultConfig(), state.offeredPerks[0], constRng(0));
    expect(state.pendingLevelUps).toBe(0);
    expect(state.paused).toBe(false);
  });

  it('does not level before the current threshold', () => {
    const state = freshState();
    expect(addXp(state, 3, constRng(0))).toEqual([]);
    expect(state.level).toBe(1);
    expect(state.xp).toBe(3);
  });
});

describe('progressionSystem · role-based perk choices', () => {
  const perk = (id: string) => cfg.progression.perks.find(item => item.id === id)!;

  it('is deterministic, unique, and opens on three different combat lanes', () => {
    const first = rollPerkChoices(freshState(), createSeededRng(20260714));
    const second = rollPerkChoices(freshState(), createSeededRng(20260714));
    expect(first).toEqual(second);
    expect(first).toHaveLength(cfg.progression.perkChoices);
    expect(new Set(first).size).toBe(first.length);
    const lanes = first.map(id => perk(id).lane);
    expect(new Set(lanes).size).toBe(3);
    expect(lanes).not.toContain('utility');
    expect(first.every(id => perk(id).offerRole === 'route')).toBe(true);
  });

  it('puts the strongest affinity lane in slot 1', () => {
    const state = freshState();
    state.buildState.affinity.projectile = 3;
    const choices = rollPerkChoices(state, constRng(0));
    expect(perk(choices[0]).lane).toBe('projectile');
    expect(['route', 'bridge']).toContain(perk(choices[0]).offerRole);
  });

  it('excludes maxed perks and returns only the eligible count', () => {
    const state = freshState();
    for (const item of cfg.progression.perks) state.perkStacks[item.id] = item.maxStacks;
    state.perkStacks.damage = perk('damage').maxStacks - 1;
    state.perkStacks.rate = perk('rate').maxStacks - 1;
    expect(rollPerkChoices(state, constRng(0))).toEqual(['damage', 'rate']);
    state.perkStacks.damage++;
    expect(rollPerkChoices(state, constRng(0))).toEqual(['rate']);
  });

  it('never offers proj_quantity at its maxStacks boundary', () => {
    const state = freshState();
    state.buildState.affinity.projectile = 3;
    state.perkStacks.proj_quantity = 3;
    expect(rollPerkChoices(state, createSeededRng(9))).not.toContain('proj_quantity');
  });
});

describe('progressionSystem · applying data-driven perks', () => {
  function choose(state: ReturnType<typeof freshState>, id: string): void {
    state.pendingLevelUps = 1;
    state.offeredPerks = [id];
    state.paused = true;
    applyPerk(state, createDefaultConfig(), id, constRng(0));
  }

  it('rejects an id that was not offered without changing state', () => {
    const state = freshState();
    state.pendingLevelUps = 1;
    state.offeredPerks = ['damage'];
    state.paused = true;
    const before = structuredClone(state);
    expect(applyPerk(state, createDefaultConfig(), 'rate', constRng(0))).toEqual([]);
    expect(state).toEqual(before);
  });

  it('records affinity and perk history while utility leaves affinity unchanged', () => {
    const state = freshState();
    choose(state, 'proj_damage');
    choose(state, 'proj_quantity');
    choose(state, 'ctrl_potency');
    choose(state, 'damage');
    expect(state.buildState.affinity).toEqual({ projectile: 2, control: 1, domain: 0, defense: 0, utility: 0 });
    expect(state.buildState.perkHistory).toEqual(['proj_damage', 'proj_quantity', 'ctrl_potency', 'damage']);
  });

  it('clears supply bags and installs fresh pity after a lane perk', () => {
    const state = freshState();
    state.normalDropDirector.roleBag = ['discovery', 'build'];
    state.bountyDirector.rewardBag = ['pierce', 'frost'];
    choose(state, 'proj_damage');
    expect(state.normalDropDirector.roleBag).toEqual([]);
    expect(state.bountyDirector.rewardBag).toEqual([]);
    expect(state.buildState.dropPity).toEqual({
      lane: 'projectile',
      remaining: cfg.economy.normalDropTypePolicy.affinity.pityWindow,
    });
    selectNormalEnemyDropType(state, constRng(0));
    expect(state.normalDropDirector.roleBag).toHaveLength(cfg.economy.normalDropTypePolicy.roleBagSize - 1);
  });

  it('emits the selected lane and resumes when the queue is empty', () => {
    const state = freshState();
    state.pendingLevelUps = 1;
    state.offeredPerks = ['damage'];
    state.paused = true;
    expect(applyPerk(state, createDefaultConfig(), 'damage', constRng(0))).toEqual([
      { type: 'perkApplied', title: cfg.progression.perks.find(perk => perk.id === 'damage')!.title, lane: 'utility' },
    ]);
    expect(state.perkStacks.damage).toBe(1);
    expect(state.paused).toBe(false);
  });

  it('preserves heal, max HP, damage, fire rate, and XP gain stat behavior', () => {
    const state = freshState();
    const config = createDefaultConfig();
    const baseDamage = totalDamage(state, config);
    const baseRate = totalFireRate(state, config);
    choose(state, 'damage');
    choose(state, 'rate');
    choose(state, 'xpgain');
    choose(state, 'maxhp');
    state.hp = state.maxHp - 5;
    choose(state, 'repair');
    expect(state.damageBonus).toBeCloseTo(baseDamage * 0.15);
    expect(state.fireRateBonus).toBeCloseTo(baseRate * 0.12);
    expect(state.xpGainBonus).toBeCloseTo(0.12);
    expect(state.maxHp).toBe(115);
    expect(state.hp).toBe(115);
  });

  it('keeps buildScaling as a runtime no-op in A1', () => {
    const state = freshState();
    const config = createDefaultConfig();
    const card = cfg.skills.cards.find(item => item.id === 'pierce')!;
    const damageBefore = totalDamage(state, config);
    const bindingsBefore = structuredClone(resolveEquipBindings(card, 6));
    choose(state, 'proj_damage');
    expect(totalDamage(state, config)).toBe(damageBefore);
    expect(resolveEquipBindings(card, 6)).toEqual(bindingsBefore);
  });
});
