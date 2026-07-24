import { cfg } from '../../config';
import type { Card, Config, GameEvent, GameState, Rng, SlotKind } from '../types';
import { autoMergeCards, commitMerge } from './cardSystem';
import { reconcileEquipmentPassives } from '../effects/interpreter';
import { finalizeEvolutionUpgrade } from './evolutionTreeSystem';

export type WildcardUseFailure = 'emptyTarget' | 'maxStar' | 'missingWildcard' | 'provisional';
export type WildcardUseCheck =
  | { ok: true; requiredStar: number; target: Card }
  | { ok: false; reason: WildcardUseFailure; requiredStar?: number };

export interface WildcardGrant { star: number; count: number; }

export function checkWildcardTarget(state: GameState, targetKind: SlotKind, targetIndex: number): WildcardUseCheck {
  const target = targetKind === 'cards' ? state.cards[targetIndex] : state.equipment[targetIndex];
  if (!target) return { ok: false, reason: 'emptyTarget' };
  if (target.provisional) return { ok: false, reason: 'provisional', requiredStar: target.star };
  if (target.star >= cfg.economy.maxStar) return { ok: false, reason: 'maxStar', requiredStar: target.star };
  if ((state.wildcards[target.star] ?? 0) <= 0) return { ok: false, reason: 'missingWildcard', requiredStar: target.star };
  return { ok: true, requiredStar: target.star, target };
}

export function grantWildcards(state: GameState, grants: WildcardGrant[]): GameEvent[] {
  const applied: WildcardGrant[] = [];
  for (const g of grants) {
    if (g.star < 1 || g.star >= cfg.economy.maxStar || g.count <= 0) continue;
    state.wildcards[g.star] = (state.wildcards[g.star] ?? 0) + g.count;
    applied.push(g);
  }
  return applied.length ? [{ type: 'wildcardsGranted', grants: applied }] : [];
}

export function useWildcardOnSlot(state: GameState, config: Config, rng: Rng, targetKind: SlotKind, targetIndex: number): GameEvent[] {
  const check = checkWildcardTarget(state, targetKind, targetIndex);
  if (!check.ok) return [{ type: 'wildcardMergeRejected', reason: check.reason, requiredStar: check.requiredStar }];

  const target = check.target;
  const consumedStar = check.requiredStar;
  state.wildcards[consumedStar]--;
  target.star++;
  if (targetKind === 'equipment') state.equipOps++;

  const events: GameEvent[] = [{
    type: 'wildcardMerged',
    cardType: target.type,
    consumedStar,
    resultStar: target.star,
    targetKind,
    targetIndex,
    targetCardId: target.id,
  }];
  const evolutionEvents = finalizeEvolutionUpgrade(state, target);
  events.push(...commitMerge(state, config, rng, target.type, target.star));
  events.push(...evolutionEvents);
  if (targetKind === 'cards') events.push(...autoMergeCards(state, config, rng).events);
  else events.push(...reconcileEquipmentPassives(state, config, rng));
  return events;
}
