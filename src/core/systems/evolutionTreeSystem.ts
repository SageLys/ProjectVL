import { cfg } from '../../config';
import type { Card, CardType, GameEvent, GameState, RunDecision } from '../types';
import { reconcileEquipmentPassives } from '../effects/interpreter';
import { autoMergeCards } from './cardSystem';
import { enqueueDecision, registerDecisionResolver } from './decisionQueueSystem';

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

function definition(cardType: CardType) {
  return cfg.skills.cards.find(card => card.id === cardType);
}

export function evolutionCheckpointOptions(cardType: CardType, star: number) {
  return definition(cardType)?.evolutionTree?.checkpoints.find(checkpoint => checkpoint.star === star)?.options;
}

/** Copies material paths and all run-locked choices that the new star has reached. */
export function inheritEvolutionPath(state: GameState, result: Card, materials: Card[] = []): void {
  result.evolutionPath = [...new Set(materials.flatMap(card => card.evolutionPath ?? []))];
  const choices = state.runBuild.evolutionChoices[result.type] ?? {};
  for (const [star, optionId] of Object.entries(choices)) {
    if (Number(star) <= result.star) setPathChoice(result, Number(star), optionId);
  }
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

  const familyChoices = state.runBuild.evolutionChoices[decision.cardType] ?? {};
  familyChoices[decision.checkpointStar] = choice;
  state.runBuild.evolutionChoices[decision.cardType] = familyChoices;

  for (const card of [...state.cards, ...state.equipment]) {
    if (!card || card.type !== decision.cardType || card.star < decision.checkpointStar) continue;
    setPathChoice(card, decision.checkpointStar, choice);
  }
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
  events.push(...reconcileEquipmentPassives(state, config, rng));
  events.push(...autoMergeCards(state, config, rng).events);
  return events;
}

function ensureEvolutionResolver(): void {
  registerDecisionResolver('evolutionBranch', applyEvolutionChoice);
}

/**
 * Finalizes an upgrade when its route is already locked, or turns it into a
 * provisional product and queues the one-time family choice.
 */
export function finalizeEvolutionUpgrade(state: GameState, card: Card): GameEvent[] {
  const checkpoint = definition(card.type)?.evolutionTree?.checkpoints
    .filter(item => item.star <= card.star)
    .sort((a, b) => a.star - b.star)
    .find(item => !state.runBuild.evolutionChoices[card.type]?.[item.star]);
  if (!checkpoint) {
    inheritEvolutionPath(state, card, [card]);
    return [];
  }

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
