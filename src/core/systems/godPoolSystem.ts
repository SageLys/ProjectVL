import { cfg } from '../../config';
import type { GodDef, GodId } from '../../config/types';
import type { CardType, Config, GameEvent, GameState, Rng, RunDecision } from '../types';
import {
  enqueueDecision,
  registerDecisionResolver,
} from './decisionQueueSystem';

function randomIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

function shuffle<T>(values: readonly T[], rng: Rng): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.min(index, Math.floor(rng() * (index + 1)));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function godDef(id: GodId): GodDef | undefined {
  return cfg.gods.gods.find(god => god.id === id);
}

export function getSelectedGods(state: GameState): GodId[] {
  return unique([
    ...(state.godPool.mainGod ? [state.godPool.mainGod] : []),
    ...state.godPool.subGods,
  ]);
}

function unselectedGods(state: GameState): GodId[] {
  const selected = new Set(getSelectedGods(state));
  return cfg.gods.gods.map(god => god.id).filter(id => !selected.has(id));
}

/**
 * Draws and freezes one god's roster. The global fallback is only exercised by
 * the C0 eleven-card compatibility data, whose god variable slots are incomplete.
 */
function drawRoster(state: GameState, id: GodId, role: 'main' | 'sub', rng: Rng): CardType[] {
  const def = godDef(id);
  if (!def) return [];
  const target = role === 'main' ? def.mainRosterSize : def.subRosterSize;
  const anchors = unique(def.anchorCardIds);
  const variableCount = Math.max(0, target - anchors.length);
  const variables = shuffle(
    unique(def.variableCardIds).filter(card => !anchors.includes(card)),
    rng,
  ).slice(0, variableCount);
  const roster = unique([...anchors, ...variables]);
  if (roster.length < target) {
    const unclaimed = cfg.skills.cards.map(card => card.id).filter(
      card => !roster.includes(card) && !state.godPool.runRoster.includes(card),
    );
    const fallback = shuffle(
      unclaimed.length >= target - roster.length
        ? unclaimed
        : cfg.skills.cards.map(card => card.id).filter(card => !roster.includes(card)),
      rng,
    );
    roster.push(...fallback.slice(0, target - roster.length));
  }
  return roster.slice(0, target);
}

function sampleGods(values: GodId[], count: number, rng: Rng): GodId[] {
  return shuffle(values, rng).slice(0, Math.min(count, values.length));
}

export function createGodDraftDecision(
  state: GameState,
  role: 'main' | 'sub',
  wave: number,
  rng: Rng,
): Extract<RunDecision, { kind: 'godDraft' }> | null {
  const count = role === 'main' ? 3 : 2;
  const candidates = sampleGods(unselectedGods(state), count, rng);
  if (!candidates.length) return null;
  state.godPool.offerRosterPreviews = Object.fromEntries(candidates.map(id => [
    id,
    drawRoster(state, id, role, rng),
  ]));
  return { kind: 'godDraft', wave, candidates, role };
}

export function createGodFocusDecision(
  state: GameState,
  wave: number,
  candidateCount: number,
  rng: Rng,
): Extract<RunDecision, { kind: 'godFocus' }> | null {
  const selected = getSelectedGods(state);
  if (!selected.length) return null;
  const count = Math.min(candidateCount, selected.length);
  const forced = [...selected]
    .filter(id => (state.godPool.offerDrought[id] ?? 0) >= 2)
    .sort((left, right) => (state.godPool.offerDrought[right] ?? 0) - (state.godPool.offerDrought[left] ?? 0)
      || left.localeCompare(right))
    .slice(0, count);
  const remainder = shuffle(selected.filter(id => !forced.includes(id)), rng);
  return {
    kind: 'godFocus',
    wave,
    candidates: [...forced, ...remainder].slice(0, count),
  };
}

function updateIncrementalRoster(state: GameState): void {
  state.godPool.runRoster = unique(
    getSelectedGods(state).flatMap(id => state.godPool.rosterByGod[id] ?? []),
  );
}

function lockRunRoster(state: GameState): CardType[] {
  updateIncrementalRoster(state);
  const target = Math.min(11, cfg.skills.cards.length);
  if (state.godPool.runRoster.length < target) {
    const remaining = cfg.skills.cards
      .map(card => card.id)
      .filter(card => !state.godPool.runRoster.includes(card));
    state.godPool.runRoster.push(...remaining.slice(0, target - state.godPool.runRoster.length));
  }
  state.godPool.runRoster = unique(state.godPool.runRoster).slice(0, target);
  return [...state.godPool.runRoster];
}

function applyGodDraft(
  state: GameState,
  decision: Extract<RunDecision, { kind: 'godDraft' }>,
  choice: GodId,
  rng: Rng,
): GameEvent[] {
  if (decision.role === 'main') {
    if (state.godPool.mainGod) return [];
    state.godPool.mainGod = choice;
    state.godPool.focusGod = choice;
  } else {
    if (state.godPool.subGods.includes(choice) || state.godPool.subGods.length >= 2) return [];
    state.godPool.subGods.push(choice);
    state.godPool.focusGod = choice;
  }

  const frozen = state.godPool.offerRosterPreviews[choice];
  state.godPool.rosterByGod[choice] = frozen?.length
    ? [...frozen]
    : drawRoster(state, choice, decision.role, rng);
  state.godPool.offerDrought[choice] = 0;
  updateIncrementalRoster(state);
  state.normalDropDirector.roleBag.length = 0;
  state.bountyDirector.rewardBag.length = 0;

  const events: GameEvent[] = [{
    type: 'godSelected',
    wave: decision.wave,
    role: decision.role,
    god: choice,
  }];
  if (decision.role === 'sub') {
    state.godPool.bootstrapQueue = [...state.godPool.rosterByGod[choice]];
    state.godPool.bootstrapDropsRemaining = 9;
    if (state.godPool.subGods.length === 2) {
      events.push({ type: 'runRosterCreated', cardTypes: lockRunRoster(state) });
    }
  }
  return events;
}

function applyGodFocus(
  state: GameState,
  decision: Extract<RunDecision, { kind: 'godFocus' }>,
  choice: GodId,
): GameEvent[] {
  state.godPool.focusGod = choice;
  for (const id of getSelectedGods(state)) {
    if (id === choice) state.godPool.offerDrought[id] = 0;
    else if (!decision.candidates.includes(id)) {
      state.godPool.offerDrought[id] = (state.godPool.offerDrought[id] ?? 0) + 1;
    }
  }
  state.normalDropDirector.roleBag.length = 0;
  state.bountyDirector.rewardBag.length = 0;
  return [{ type: 'godSelected', wave: decision.wave, role: 'focus', god: choice }];
}

function godDraftResolver(
  state: GameState,
  _config: Config,
  rng: Rng,
  decision: RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'godDraft') return [];
  return applyGodDraft(state, decision, choice, rng);
}

function godFocusResolver(
  state: GameState,
  _config: Config,
  _rng: Rng,
  decision: RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'godFocus') return [];
  return applyGodFocus(state, decision, choice);
}

export function registerGodPoolDecisionResolvers(): void {
  registerDecisionResolver('godDraft', godDraftResolver);
  registerDecisionResolver('godFocus', godFocusResolver);
}

/**
 * Enqueues the one god decision belonging to this intermission. A persisted
 * after-wave marker makes repeated decide ticks and restored frames idempotent.
 */
export function enqueueGodPoolDecisionForIntermission(state: GameState, rng: Rng): GameEvent[] {
  const afterWave = state.intermission.afterWave;
  if (state.godPool.lastDecisionAfterWave === afterWave) return [];

  let decision: RunDecision | null = null;
  if (afterWave === 0 && state.godPool.mainGod === null) {
    decision = createGodDraftDecision(state, 'main', 1, rng);
  } else if (afterWave === 1 && state.godPool.mainGod !== null && state.godPool.subGods.length === 0) {
    decision = createGodDraftDecision(state, 'sub', 2, rng);
  } else if (afterWave === 2 && state.godPool.mainGod !== null && state.godPool.subGods.length === 1) {
    decision = createGodDraftDecision(state, 'sub', 3, rng);
  } else if (afterWave >= 3 && afterWave <= 7) {
    decision = createGodFocusDecision(state, afterWave + 1, 2, rng);
  } else if (afterWave >= 8 && afterWave <= 9) {
    decision = createGodFocusDecision(state, afterWave + 1, 3, rng);
  }

  state.godPool.lastDecisionAfterWave = afterWave;
  if (!decision) return [];
  registerGodPoolDecisionResolvers();
  const role = decision.kind === 'godDraft' ? decision.role : 'focus';
  return [
    { type: 'godOffer', wave: decision.wave, role, candidates: [...decision.candidates] },
    ...enqueueDecision(state, decision),
  ];
}

export function randomSelectedGod(state: GameState, rng: Rng): GodId | null {
  const selected = getSelectedGods(state);
  return selected.length ? selected[randomIndex(selected.length, rng)] : null;
}
