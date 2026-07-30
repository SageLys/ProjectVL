/** Rewards are synchronous one-shot settlements. Future DOT/summon/zone rewards need persistent source tagging. */
import { AFFIX_SINKS } from '../../config/affixSinks';
import { cfg } from '../../config';
import type { RewardDef } from '../../config/types';
import { applyFreeze, applyVulnerable, controlBudgetDenies } from '../effects/statusSystem';
import { totalDamage } from '../stats';
import type { BuildTag } from '../effects/defs';
import type { Config, GameEvent, GameState, RewardExecutionResult, Rng } from '../types';
import { dealDamage } from './damageSystem';
import { dominantBuildTag } from './buildProfileSystem';
import { grantWildcards } from './wildcardSystem';
import { withRewardPointsSuppressed } from './rewardMeterSystem';

const SURGE_AXES: Record<BuildTag, Array<keyof typeof AFFIX_SINKS>> = {
  projectile: ['effectDamageMul', 'quantityAdd'],
  control: ['controlPotencyMul', 'controlledDamageTakenMul'],
  domain: ['areaScaleMul', 'dotDamageMul'],
  defense: ['defenseDurabilityMul', 'retaliationMul'],
  utility: ['dropRateMul', 'dropLifetimeMul'],
};

export function executeReward(state: GameState, config: Config, rng: Rng, reward: RewardDef, activationIndex = state.rewardMeter.activationCount - 1): { events: GameEvent[]; result: RewardExecutionResult } {
  return withRewardPointsSuppressed(state, () => {
    const events: GameEvent[] = [];
    const result: RewardExecutionResult = {};
    const action = reward.action;
    if (action.kind === 'globalDamage') {
      const beforeKills = state.kills;
      let dealt = 0;
      for (const enemy of [...state.enemies]) {
        const before = enemy.hp;
        const raw = Math.min(totalDamage(state, config) * action.damageMul,
          enemy.spawnKind === 'waveBoss' || enemy.type === 'boss' ? enemy.maxHp * action.bossMaxHpRatioCap : Infinity);
        events.push(...dealDamage(state, config, rng, enemy, raw, 'reward:heartbreakNova'));
        dealt += Math.max(0, before - Math.max(0, enemy.hp));
      }
      result.damageDealt = dealt;
      result.enemiesKilled = state.kills - beforeKills;
      const turret = cfg.combat.turret;
      state.vfx.push({ kind: 'retaliationNova', x: turret.x, y: turret.y, radius: Math.hypot(cfg.combat.canvas.width, cfg.combat.canvas.height), remaining: 0.4 });
    } else if (action.kind === 'globalControl') {
      let frozen = 0;
      for (const enemy of state.enemies) {
        if (controlBudgetDenies(state, enemy)) continue;
        applyFreeze(enemy, action.freezeSeconds);
        applyVulnerable(enemy, action.vulnerableRatio, action.vulnerableSeconds, 1);
        frozen++;
      }
      result.frozenCount = frozen;
    } else if (action.kind === 'restoreAndShield') {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + state.maxHp * action.healRatio);
      result.healingGranted = state.hp - before;
      const hits = Math.max(state.shield?.hits ?? 0, action.shieldHits);
      const maxHits = Math.max(state.shield?.maxHits ?? 0, action.shieldHits);
      state.shield = { hits, maxHits, regenRemaining: null, regenSeconds: null };
      result.shieldHitsGranted = action.shieldHits;
    } else if (action.kind === 'grantWildcards') {
      const star = action.starSchedule[Math.min(activationIndex, action.starSchedule.length - 1)];
      const grants = [{ star, count: action.count }];
      events.push(...grantWildcards(state, grants));
      result.wildcardGrants = grants;
    } else {
      const tag = dominantBuildTag(state);
      for (const axis of SURGE_AXES[tag]) state.statModifiers.push({
        sourceId: `reward:buildSurge:${activationIndex}:${axis}`,
        stat: axis,
        operation: AFFIX_SINKS[axis].operation,
        value: AFFIX_SINKS[axis].operation === 'mul' ? 1 + action.value : action.value,
        remaining: action.duration,
      });
      result.surgeTag = tag;
      result.surgeDuration = action.duration;
    }
    return { events, result };
  });
}
