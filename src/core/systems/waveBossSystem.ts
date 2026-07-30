import { cfg } from '../../config';
import type { GameConfig } from '../../config';
import type { ValidationRewardSpec } from '../../config/types';
import type { Config, Enemy, GameEvent, GameState, Rng } from '../types';
import { spawnGroundDrop, spawnWildcardDrop } from './dropSystem';
import type { WildcardGrant } from './wildcardSystem';
import { resolveActiveWavePlan, stageForWave } from '../runStage';
import {
  recordCardDropShown, selectBuildType, selectPivotType, selectUniformCardType,
} from './dropTypePolicy';
import { selectFocusGodCard } from './activePoolSystem';
import { getModifiers } from '../effects/interpreter';
import { autoMergeCards, getActiveMergeCopies } from './cardSystem';
import { createCardWithAffixes } from './cardAffixSystem';
import { finalizeEvolutionUpgrade } from './evolutionTreeSystem';
import { getOrCreateCardTypeRunStats } from './dropCommitment';
import { recomputeRecipeReadiness } from './recipeEvolutionSystem';

function stageWaveIndex(wave: number, game: GameConfig): number {
  const plan = game.waves.stagePlan;
  const stage = stageForWave(wave, game.waves.totalWaves, plan);
  if (stage === 'selection') return Math.max(0, wave - 1);
  if (stage === 'build') return Math.max(0, wave - plan.selectionWaves - 1);
  return Math.max(0, wave - (game.waves.totalWaves - plan.validationWaves + 1));
}

export function computeWaveBossReward(wave: number, game: GameConfig = cfg): WildcardGrant[] {
  const safeWave = Math.max(1, Math.min(game.waves.totalWaves, Math.trunc(wave)));
  const stage = stageForWave(safeWave, game.waves.totalWaves, game.waves.stagePlan);
  const schedule = game.waves.waveBoss.reward.schedule[stage];
  const star = schedule[Math.min(schedule.length - 1, stageWaveIndex(safeWave, game))];
  return [{ star, count: game.waves.waveBoss.reward.count }];
}

function recipeAssistReward(state: GameState): { cardType: string; star: number } | null {
  if (state.recipes.assistClosed
    || state.recipes.assistBudgetUsed >= cfg.economy.evolution.assistMaxCorrections
    || state.wave <= cfg.economy.evolution.assistCheckpoints[1]) return null;
  const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === state.recipes.pinnedRecipeId);
  if (!recipe) return null;
  const materials = [recipe.ingredientVariable.cardId, recipe.ingredientAnchor.cardId]
    .filter(type => (state.recipes.assistCorrectionsByMaterial[type] ?? 0)
      < cfg.economy.evolution.assistMaxCorrectionsPerMaterial)
    .map(type => ({
      type,
      gap: Math.max(0, 16 - [...state.cards, ...state.equipment]
        .filter(card => card?.type === type && !card.provisional)
        .reduce((sum, card) => sum + 2 ** ((card?.star ?? 1) - 1), 0)),
    }))
    .sort((left, right) => right.gap - left.gap || left.type.localeCompare(right.type));
  for (const material of materials) {
    for (let star = 1; star < 5; star++) {
      const copies = [...state.cards, ...state.equipment]
        .filter(card => card?.type === material.type && !card.provisional && card.star === star).length;
      if (copies < getActiveMergeCopies() - 1) continue;
      state.recipes.assistBudgetUsed++;
      state.recipes.assistCorrectionsByMaterial[material.type] =
        (state.recipes.assistCorrectionsByMaterial[material.type] ?? 0) + 1;
      return { cardType: material.type, star };
    }
  }
  return null;
}

function deliverValidationCard(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  cardType: string,
  star: number,
  typePolicy: Extract<ValidationRewardSpec, { kind: 'card' }>['typePolicy'],
  source: 'validationElite' | 'bossKill',
): GameEvent[] {
  recordCardDropShown(state, cardType, source);
  const empty = state.cards.findIndex(card => card === null);
  if (empty < 0) {
    spawnGroundDrop(state, config, rng, x, y, cardType, star, source);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    drop.secure = true;
    drop.validationRewardWave = state.wave;
    drop.validationTypePolicy = typePolicy;
    return [{ type: 'validationRewardGranted', wave: state.wave, cardType, star, delivery: 'drop' }];
  }
  const created = createCardWithAffixes(state, rng, cardType, star);
  state.cards[empty] = created.card;
  state.collected++;
  const stats = getOrCreateCardTypeRunStats(state, cardType);
  stats.collected++;
  stats.highestStarReached = Math.max(stats.highestStarReached, star);
  const events: GameEvent[] = [
    { type: 'validationRewardGranted', wave: state.wave, cardType, star, delivery: 'hand' },
    ...created.events,
    ...finalizeEvolutionUpgrade(state, created.card),
    ...autoMergeCards(state, config, rng).events,
  ];
  events.push(...recomputeRecipeReadiness(state));
  return events;
}

function spawnValidationCardReward(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  spec: Extract<ValidationRewardSpec, { kind: 'card' }>,
  source: 'validationElite' | 'bossKill',
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let index = 0; index < spec.count; index++) {
    const assist = source === 'validationElite' ? recipeAssistReward(state) : null;
    const type = assist?.cardType ?? (spec.typePolicy === 'build'
      ? selectBuildType(state, rng)
      : spec.typePolicy === 'pivot'
        ? selectPivotType(state, rng)
        : spec.typePolicy === 'focusGod'
          ? selectFocusGodCard(state, rng)
          : selectUniformCardType(state, rng));
    events.push(...deliverValidationCard(
      state, config, rng, x, y, type, assist?.star ?? spec.star, spec.typePolicy, source,
    ));
  }
  return events;
}

function spawnValidationReward(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  spec: ValidationRewardSpec,
  source: 'validationElite' | 'bossKill',
): GameEvent[] {
  if (spec.kind === 'card') {
    return spawnValidationCardReward(state, config, rng, x, y, spec, source);
  }
  spawnWildcardDrop(state, x, y, spec.star, spec.count, cfg.bounty.reward.dropLifetimeSeconds);
  const drop = state.groundDrops[state.groundDrops.length - 1];
  drop.source = source;
  drop.secure = true;
  drop.validationRewardWave = state.wave;
  return [];
}

function bossWildcardBonus(state: GameState, rng: Rng): number {
  const rules = getModifiers(state).wildcardRewardBonuses.filter(
    rule => rule.scope === 'both' || rule.scope === 'boss',
  );
  if (rules.length === 0) return 0;
  let count = 0;
  for (const rule of rules) if (rng() < rule.bonusChance) count += rule.count;
  return count;
}

/** Drops the Boss reward for manual pickup. Validation rewards are secure and gate wave completion. */
export function grantWaveBossReward(state: GameState, config: Config, rng: Rng, x: number, y: number): GameEvent[] {
  if (state.bossRewardClaimedWave >= state.wave) return [];
  const plan = resolveActiveWavePlan(cfg, state.wave);
  if (plan.validation) {
    const spec = plan.validation.bossReward;
    let events: GameEvent[] = [];
    if (spec.kind === 'card') {
      events = spawnValidationReward(state, config, rng, x, y, spec, 'bossKill');
    } else {
      events = spawnValidationReward(
        state, config, rng, x, y,
        { ...spec, count: spec.count + bossWildcardBonus(state, rng) },
        'bossKill',
      );
    }
    if (spec.kind === 'wildcard') {
      const drop = state.groundDrops[state.groundDrops.length - 1];
      if (drop?.kind === 'wildcard') drop.bossRewardWave = state.wave;
    }
    state.bossRewardClaimedWave = state.wave;
    return events;
  } else {
    const grants = computeWaveBossReward(state.wave);
    const bonus = bossWildcardBonus(state, rng);
    if (grants.length > 0) grants[0] = { ...grants[0], count: grants[0].count + bonus };
    for (const grant of grants) {
      spawnWildcardDrop(state, x, y, grant.star, grant.count, cfg.bounty.reward.dropLifetimeSeconds);
      const drop = state.groundDrops[state.groundDrops.length - 1];
      if (drop.kind !== 'wildcard') throw new Error('Boss reward must be a wildcard drop');
      drop.bossRewardWave = state.wave;
      drop.source = 'bossKill';
    }
  }
  state.bossRewardClaimedWave = state.wave;
  return [];
}

/** Drops the configured secure reward for a defeated validation elite. */
export function grantValidationEliteReward(
  state: GameState,
  config: Config,
  rng: Rng,
  enemy: Enemy,
): GameEvent[] {
  if (!enemy.validationReward) return [];
  return spawnValidationReward(state, config, rng, enemy.x, enemy.y, enemy.validationReward, 'validationElite');
}
