import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { totalDamage, totalFireRate } from '../stats';

/** Draws weighted perk choices without replacement from perks that have stacks remaining. */
export function rollPerkChoices(state: GameState, rng: Rng): string[] {
  const remaining = cfg.progression.perks.filter(
    perk => (state.perkStacks[perk.id] ?? 0) < perk.maxStacks,
  );
  const choices: string[] = [];
  const count = Math.min(Math.max(0, Math.floor(cfg.progression.perkChoices)), remaining.length);

  while (choices.length < count) {
    const totalWeight = remaining.reduce((sum, perk) => sum + Math.max(0, perk.weight), 0);
    const scaledRoll = rng() * (totalWeight > 0 ? totalWeight : remaining.length);
    let cursor = 0;
    let pickedIndex = remaining.length - 1;
    for (let index = 0; index < remaining.length; index++) {
      cursor += totalWeight > 0 ? Math.max(0, remaining[index].weight) : 1;
      if (scaledRoll < cursor) {
        pickedIndex = index;
        break;
      }
    }
    choices.push(remaining[pickedIndex].id);
    remaining.splice(pickedIndex, 1);
  }

  return choices;
}

/** Settles one level and queues one perk selection. */
export function levelUp(state: GameState, rng: Rng): GameEvent[] {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * cfg.progression.xpGrowth);
  state.pendingLevelUps++;
  state.paused = true;
  if (state.offeredPerks.length === 0) state.offeredPerks = rollPerkChoices(state, rng);
  return [{ type: 'levelUp' }];
}

/** Adds experience and settles every level crossed by this single award. */
export function addXp(state: GameState, amount: number, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  state.xp += amount;
  while (state.xp >= state.xpNeed) events.push(...levelUp(state, rng));
  return events;
}

/** Applies only a currently offered perk, then advances the pending level-up queue. */
export function applyPerk(state: GameState, config: Config, perkId: string, rng: Rng): GameEvent[] {
  if (!state.offeredPerks.includes(perkId)) return [];
  const perk = cfg.progression.perks.find(item => item.id === perkId);
  if (!perk) return [];

  switch (perk.kind) {
    case 'damagePct':
      state.damageBonus += totalDamage(state, config) * perk.value;
      break;
    case 'fireRatePct':
      state.fireRateBonus += totalFireRate(state, config) * perk.value;
      break;
    case 'heal':
      state.hp = Math.min(state.maxHp, state.hp + perk.value);
      break;
    case 'maxHp':
      state.maxHp += perk.value;
      state.hp += perk.value;
      break;
    case 'rangePct':
      state.rangeBonus += perk.value;
      break;
    case 'xpGainPct':
      state.xpGainBonus += perk.value;
      break;
  }

  state.perkStacks[perkId] = (state.perkStacks[perkId] ?? 0) + 1;
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  state.offeredPerks = state.pendingLevelUps > 0 ? rollPerkChoices(state, rng) : [];
  state.paused = state.pendingLevelUps > 0;
  return [
    { type: 'perkApplied', title: perk.title },
    ...(state.pendingLevelUps > 0 ? [{ type: 'levelUp' as const }] : []),
  ];
}
