import { cfg } from '../../config';
import type { Card, CardType, GameEvent, GameState, RunDecision } from '../types';
import { reconcileEquipmentPassives } from '../effects/interpreter';
import { autoMergeCards } from './cardSystem';
import { enqueueDecision, registerDecisionResolver } from './decisionQueueSystem';
import { reconcileMaxHp } from '../stats';

function pathToken(checkpointStar: number, optionId: string): string {
  return `${checkpointStar}:${optionId}`;
}

function setPathChoice(card: Card, checkpointStar: number, optionId: string): void {
  const prefix = `${checkpointStar}:`;
  card.evolutionPath = [
    ...(card.evolutionPath ?? []).filter(entry => !entry.startsWith(prefix)),
    pathToken(checkpointStar, optionId),
  ].sort((a, b) => Number(a.split(':', 1)[0]) - Number(b.split(':', 1)[0]));
}

function hasPathChoice(card: Card, checkpointStar: number): boolean {
  const prefix = `${checkpointStar}:`;
  return (card.evolutionPath ?? []).some(entry => entry.startsWith(prefix));
}

function definition(cardType: CardType) {
  return cfg.skills.cards.find(card => card.id === cardType);
}

export function evolutionCheckpointOptions(cardType: CardType, star: number) {
  return definition(cardType)?.evolutionTree?.checkpoints.find(checkpoint => checkpoint.star === star)?.options;
}

/** The merge result continues the primary material's instance-specific route. */
export function inheritEvolutionPath(result: Card, materials: Card[] = []): void {
  result.evolutionPath = [...(materials[0]?.evolutionPath ?? [])];
}

function findCardById(state: GameState, cardId: number): Card | undefined {
  return [...state.cards, ...state.equipment].find(card => card?.id === cardId) ?? undefined;
}

function applyEvolutionChoice(
  state: GameState,
  config: Parameters<typeof autoMergeCards>[1],
  rng: Parameters<typeof autoMergeCards>[2],
  decision: RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'evolutionBranch') return [];
  const provisional = findCardById(state, decision.provisionalCardId);
  if (
    !provisional
    || !provisional.provisional
    || provisional.type !== decision.cardType
    || provisional.star < decision.checkpointStar
  ) return [];

  setPathChoice(provisional, decision.checkpointStar, choice);
  provisional.provisional = false;
  const continuedEvolutionEvents = finalizeEvolutionUpgrade(state, provisional);

  const events: GameEvent[] = [{
    type: 'evolutionBranchSelected',
    cardType: decision.cardType,
    checkpointStar: decision.checkpointStar,
    optionId: choice,
    provisionalCardId: decision.provisionalCardId,
  }];
  events.push(...continuedEvolutionEvents);
  reconcileMaxHp(state);
  events.push(...reconcileEquipmentPassives(state, config, rng));
  events.push(...autoMergeCards(state, config, rng).events);
  return events;
}

function ensureEvolutionResolver(): void {
  registerDecisionResolver('evolutionBranch', applyEvolutionChoice);
}

/**
 * Finalizes an upgrade when this card already has a route, or turns it into a
 * provisional product and queues an instance-specific branch choice.
 */
export function finalizeEvolutionUpgrade(state: GameState, card: Card): GameEvent[] {
  const checkpoint = definition(card.type)?.evolutionTree?.checkpoints
    .filter(item => item.star <= card.star)
    .sort((a, b) => a.star - b.star)
    .find(item => !hasPathChoice(card, item.star));
  if (!checkpoint) return [];

  ensureEvolutionResolver();
  card.provisional = true;
  const decision: RunDecision = {
    kind: 'evolutionBranch',
    cardType: card.type,
    checkpointStar: checkpoint.star,
    options: checkpoint.options.map(option => option.id),
    provisionalCardId: card.id,
  };
  return [
    {
      type: 'evolutionBranchOffered',
      cardType: card.type,
      checkpointStar: card.star,
      options: decision.options,
      provisionalCardId: card.id,
    },
    ...enqueueDecision(state, decision),
  ];
}
