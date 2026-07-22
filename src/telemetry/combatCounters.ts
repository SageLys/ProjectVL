import type { GameState, PerCardCombatTelemetry } from '../core/types';

function counter(state: GameState, cardId: number): PerCardCombatTelemetry {
  return state.combatTelemetry.perCard[cardId] ??= { triggers: 0, hits: 0, damage: 0 };
}

export function recordCardTrigger(state: GameState, cardId?: number): void {
  if (cardId == null) return;
  counter(state, cardId).triggers++;
}

export function recordCardImpact(state: GameState, cardId: number | undefined, damage: number, hits = 1): void {
  if (cardId == null) return;
  const item = counter(state, cardId);
  item.hits += hits;
  item.damage += Math.max(0, damage);
}

export function recordFusionSuppression(state: GameState, cardId?: number): void {
  if (cardId == null) return;
  const item = counter(state, cardId);
  item.suppressedByFusion = (item.suppressedByFusion ?? 0) + 1;
}

export function totalEnemyHp(state: GameState): number {
  return state.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0);
}
