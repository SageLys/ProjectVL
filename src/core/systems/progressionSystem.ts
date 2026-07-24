import { cfg } from '../../config';
import type { PerkDef, PerkStatEffect } from '../../config/types';
import type { BuildTag } from '../effects/defs';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { totalDamage, totalFireRate } from '../stats';

const COMBAT_LANES: BuildTag[] = ['projectile', 'control', 'domain', 'defense'];

function weightedPick(perks: PerkDef[], rng: Rng): PerkDef | undefined {
  if (!perks.length) return undefined;
  const totalWeight = perks.reduce((sum, perk) => sum + Math.max(0, perk.weight), 0);
  const scaledRoll = rng() * (totalWeight > 0 ? totalWeight : perks.length);
  let cursor = 0;
  for (const perk of perks) {
    cursor += totalWeight > 0 ? Math.max(0, perk.weight) : 1;
    if (scaledRoll < cursor) return perk;
  }
  return perks[perks.length - 1];
}

function randomItem<T>(items: T[], rng: Rng): T | undefined {
  if (!items.length) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function mainLane(state: GameState, rng: Rng): BuildTag | undefined {
  const max = Math.max(...COMBAT_LANES.map(lane => state.buildState.affinity[lane]));
  if (max <= 0) return undefined;
  const tied = COMBAT_LANES.filter(lane => state.buildState.affinity[lane] === max);
  return tied.length === 1 ? tied[0] : randomItem(tied, rng);
}

/** 按主推、桥接、转型/通用三个角色生成互不重复的升级选项。 */
export function rollPerkChoices(state: GameState, rng: Rng): string[] {
  const eligible = cfg.progression.perks.filter(
    perk => (state.perkStacks[perk.id] ?? 0) < perk.maxStacks,
  );
  const count = Math.min(Math.max(0, Math.floor(cfg.progression.perkChoices)), eligible.length);
  const choices: PerkDef[] = [];
  const available = (filter: (perk: PerkDef) => boolean) => eligible.filter(
    perk => !choices.some(choice => choice.id === perk.id) && filter(perk),
  );
  const push = (perk: PerkDef | undefined) => { if (perk) choices.push(perk); };
  const routeOrBridge = (perk: PerkDef) => perk.offerRole === 'route' || perk.offerRole === 'bridge';
  const allSlotsEmpty = [...state.cards, ...state.equipment].every(card => card === null);
  const opening = COMBAT_LANES.every(lane => state.buildState.affinity[lane] === 0) && allSlotsEmpty;

  // 槽 1：已有主流派则继续支持；否则随机开启一条战斗路线。
  let slot1Lane = mainLane(state, rng);
  if (!slot1Lane) {
    const lanes = COMBAT_LANES.filter(lane => available(perk => perk.lane === lane && perk.offerRole === 'route').length > 0);
    slot1Lane = randomItem(lanes, rng);
  }
  push(weightedPick(available(perk => perk.lane === slot1Lane && (opening ? perk.offerRole === 'route' : routeOrBridge(perk))), rng));

  // 槽 2：优先支持手牌或装备已覆盖、且不同于槽 1 的流派。
  const heldTypes = new Set([...state.cards, ...state.equipment].filter(card => card !== null).map(card => card.type));
  const covered = new Set(
    cfg.skills.cards.filter(card => heldTypes.has(card.id)).flatMap(card => card.synergyTags),
  );
  const secondFilter = (perk: PerkDef) => perk.lane !== slot1Lane && routeOrBridge(perk) && (!opening || perk.offerRole === 'route');
  let slot2Lanes = COMBAT_LANES.filter(lane => covered.has(lane) && available(perk => perk.lane === lane && secondFilter(perk)).length > 0);
  if (!slot2Lanes.length) slot2Lanes = COMBAT_LANES.filter(lane => lane !== slot1Lane && available(perk => perk.lane === lane && secondFilter(perk)).length > 0);
  const slot2Lane = randomItem(slot2Lanes, rng);
  push(weightedPick(available(perk => perk.lane === slot2Lane && secondFilter(perk)), rng));

  // 槽 3：开局强制第三条战斗路线；其余时候在转型路线与通用强化间五五开。
  const occupiedLanes = new Set(choices.map(perk => perk.lane));
  const pivot = available(perk => COMBAT_LANES.includes(perk.lane) && !occupiedLanes.has(perk.lane) && perk.offerRole === 'route');
  const utility = available(perk => perk.offerRole === 'utility');
  if (opening) push(weightedPick(pivot, rng));
  else if (rng() < 0.5) push(weightedPick(pivot, rng) ?? weightedPick(utility, rng));
  else push(weightedPick(utility, rng) ?? weightedPick(pivot, rng));

  // 任一角色槽为空时，从全部剩余候选按权重补齐。
  while (choices.length < count) {
    const picked = weightedPick(available(() => true), rng);
    if (!picked) break;
    choices.push(picked);
  }
  return choices.slice(0, count).map(perk => perk.id);
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

function applyStatEffect(state: GameState, config: Config, effect: PerkStatEffect): void {
  switch (effect.stat) {
    case 'damagePct': state.damageBonus += totalDamage(state, config) * effect.value; break;
    case 'fireRatePct': state.fireRateBonus += totalFireRate(state, config) * effect.value; break;
    case 'heal': state.hp = Math.min(state.maxHp, state.hp + effect.value); break;
    case 'maxHp': state.maxHp += effect.value; state.hp += effect.value; break;
    case 'rangePct': state.rangeBonus += effect.value; break;
    case 'xpGainPct': state.xpGainBonus += effect.value; break;
  }
}

/** Applies only a currently offered perk, then advances the pending level-up queue. */
export function applyPerk(state: GameState, config: Config, perkId: string, rng: Rng): GameEvent[] {
  if (!state.offeredPerks.includes(perkId)) return [];
  const perk = cfg.progression.perks.find(item => item.id === perkId);
  if (!perk) return [];

  for (const effect of perk.effects) {
    if (effect.kind === 'stat') applyStatEffect(state, config, effect);
    // buildScaling is stored in perkStacks and consumed during effect resolution.
  }

  state.buildState.affinity[perk.lane] += perk.affinityGain;
  state.buildState.perkHistory.push(perk.id);
  if (perk.affinityGain > 0) {
    state.normalDropDirector.roleBag.length = 0;
    state.bountyDirector.rewardBag.length = 0;
    const pityWindow = Math.max(0, Math.round(cfg.economy.normalDropTypePolicy.affinity.pityWindow));
    state.buildState.dropPity = pityWindow > 0 ? { lane: perk.lane, remaining: pityWindow } : undefined;
  }

  state.perkStacks[perkId] = (state.perkStacks[perkId] ?? 0) + 1;
  state.buildState.scalingVersion++;
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  state.offeredPerks = state.pendingLevelUps > 0 ? rollPerkChoices(state, rng) : [];
  state.paused = state.pendingLevelUps > 0 || state.decisions.current !== null;
  return [
    { type: 'perkApplied', title: perk.title, lane: perk.lane },
    ...(state.pendingLevelUps > 0 ? [{ type: 'levelUp' as const }] : []),
  ];
}
