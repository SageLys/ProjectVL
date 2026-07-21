// 共享伤害/击杀管线：子弹、连锁、爆发、区域 dot、镜像炮台一律走这里，
// 保证易伤乘数、击杀结算（计分/掉落/经验/onKill 触发）语义唯一。
import { cfg } from '../../config';
import type { Config, Enemy, GameEvent, GameState, Rng } from '../types';
import { damageTakenMultiplier, isControlled } from '../effects/statusSystem';
import { spawnParticle } from './particleSystem';
import { rollDropOnKill } from './dropSystem';
import { addXp } from './progressionSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { notifyBountyMemberKilled } from './bountySystem';
import { controlledDamageTakenBonus } from './buildModifierSystem';
import { grantValidationEliteReward, grantWaveBossReward } from './waveBossSystem';

/**
 * 击杀结算：计分、粒子、掉落判定、经验（×xpMul）、onKill 触发。调用前敌人须已移出数组。
 * source：击杀来源标签（如 'chain'），供 onKill 绑定的 triggerParams.requiresSource 过滤用；
 * 死亡时刻的 enemy.status（frozen/dots 等）原样保留，供 triggerParams.requiresStatus 过滤用。
 */
export function killEnemy(state: GameState, config: Config, rng: Rng, enemy: Enemy, source?: string): GameEvent[] {
  const events: GameEvent[] = [];
  state.kills++;
  for (let i = 0; i < cfg.combat.vfx.killParticles; i++) spawnParticle(state, rng, enemy.x, enemy.y, '#8793a3', 150);
  if (enemy.spawnKind === 'waveBoss') {
    for (let i = 0; i < cfg.combat.vfx.killParticles * 2; i++) spawnParticle(state, rng, enemy.x, enemy.y, '#d6b06f', 220);
    events.push(...grantWaveBossReward(state, enemy.x, enemy.y));
  } else if (enemy.spawnKind === 'validationElite') {
    events.push(...grantValidationEliteReward(state, enemy));
  } else if (enemy.bountyEncounterId !== undefined) events.push(...notifyBountyMemberKilled(state, enemy, config, rng));
  else rollDropOnKill(state, config, rng, enemy);
  const xpGain = enemy.xp * cfg.progression.killXpMul * (1 + state.xpGainBonus) * getModifiers(state).xpMul;
  events.push(...addXp(state, xpGain, rng));
  events.push(...fireTrigger(state, config, rng, 'onKill', { enemy, point: { x: enemy.x, y: enemy.y }, source }));
  return events;
}

/**
 * 对敌人造成伤害（应用易伤乘数），死亡则移出数组并走击杀结算。
 * 返回衍生事件；敌人若已不在 state.enemies 中则不动作。
 */
export function dealDamage(state: GameState, config: Config, rng: Rng, enemy: Enemy, rawDamage: number, source?: string): GameEvent[] {
  const idx = state.enemies.indexOf(enemy);
  if (idx < 0) return [];
  const controlledMul = isControlled(enemy) ? 1 + controlledDamageTakenBonus(state) : 1;
  enemy.hp -= rawDamage * damageTakenMultiplier(enemy) * controlledMul;
  enemy.hit = 0.08;
  if (enemy.hp <= 0) {
    state.enemies.splice(idx, 1);
    return killEnemy(state, config, rng, enemy, source);
  }
  return [];
}

/** 处决判定：血线低于阈值直接致死（execute 原子/修饰共用）。 */
export function tryExecute(state: GameState, config: Config, rng: Rng, enemy: Enemy, thresholdRatio: number): GameEvent[] {
  if (thresholdRatio <= 0) return [];
  if (enemy.hp > 0 && enemy.hp / enemy.maxHp <= thresholdRatio) {
    return dealDamage(state, config, rng, enemy, enemy.hp * 1000);
  }
  return [];
}
