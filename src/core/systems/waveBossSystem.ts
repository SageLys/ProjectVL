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

function spawnValidationCardReward(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  spec: Extract<ValidationRewardSpec, { kind: 'card' }>,
  source: 'validationElite' | 'bossKill',
): void {
  for (let index = 0; index < spec.count; index++) {
    const type = spec.typePolicy === 'build'
      ? selectBuildType(state, rng)
      : spec.typePolicy === 'pivot'
        ? selectPivotType(state, rng)
        : spec.typePolicy === 'focusGod'
          ? selectFocusGodCard(state, rng)
          : selectUniformCardType(state, rng);
    spawnGroundDrop(state, config, rng, x, y, type, spec.star, source);
    recordCardDropShown(state, type, source);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    drop.secure = true;
    drop.validationRewardWave = state.wave;
    drop.validationTypePolicy = spec.typePolicy;
  }
}

function spawnValidationReward(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  spec: ValidationRewardSpec,
  source: 'validationElite' | 'bossKill',
): void {
  if (spec.kind === 'card') {
    spawnValidationCardReward(state, config, rng, x, y, spec, source);
    return;
  }
  spawnWildcardDrop(state, x, y, spec.star, spec.count, cfg.bounty.reward.dropLifetimeSeconds);
  const drop = state.groundDrops[state.groundDrops.length - 1];
  drop.source = source;
  drop.secure = true;
  drop.validationRewardWave = state.wave;
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
    if (spec.kind === 'card') {
      spawnValidationReward(state, config, rng, x, y, spec, 'bossKill');
    } else {
      spawnValidationReward(
        state, config, rng, x, y,
        { ...spec, count: spec.count + bossWildcardBonus(state, rng) },
        'bossKill',
      );
    }
    const drop = state.groundDrops[state.groundDrops.length - 1];
    if (drop.kind === 'wildcard') drop.bossRewardWave = state.wave;
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
  spawnValidationReward(state, config, rng, enemy.x, enemy.y, enemy.validationReward, 'validationElite');
  return [];
}
