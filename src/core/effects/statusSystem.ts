// 敌人状态效果：施加、查询、推进、过期。
// 原子交互冲突仲裁表（P2 §2 正交性约束要求集中于此，禁止散落在各原子里）：
//   1. 冻结/眩晕 → 不可移动（速度=0），且嘲讽在此期间不生效（反正动不了）。
//   2. 冻结中 → 击退无效（冻结体不可位移）。
//   3. 减速多来源 → 取最强 ratio，剩余时长取最大（不叠乘，防组合失控）。
//   4. 易伤多来源 → 同减速：取最强。
//   5. 索敌优先级（炮台）：紧急半径最近 > 活跃 bounty > 烙印 brand 权重降序 > 最近敌人。
//   6. 移动目标（敌人）：嘲讽（点/召唤物）> 炮台；嘲讽召唤物死亡即失效。
//   - 击退 × 类型抗性（boss/tank 减免）。
//   - 连续击退短窗递减，窗口过期重置。
//   - freeze/stun × 类型抗性（boss/tank 减免时长）。
//   - 硬控结束 → 免疫窗内免疫再控且不累积冻结层。
export const CONFLICT_RULES = [
  '击退 × 类型抗性(boss/tank 减免)',
  '连续击退短窗递减,窗口过期重置',
  'freeze/stun × 类型抗性(boss/tank 减免时长)',
  '硬控结束→免疫窗内免疫再控且不累积冻结层',
  'freeze/stun → 不可移动，嘲讽暂停',
  'freeze → 击退无效',
  'slow 多来源取最强，不叠乘',
  'vulnerable 多来源取最强',
  '索敌: 紧急半径最近 > 活跃 bounty > brand 权重 > 最近',
  '移动: taunt > 炮台；嘲讽源死亡即失效',
] as const;

import { cfg } from '../../config';
import type { Enemy, EnemyStatus, GameState } from '../types';

export function emptyStatus(): EnemyStatus {
  return { slow: null, frozen: 0, freezeStacks: 0, stunned: 0, ccImmune: 0, vulnerable: null, dots: [], brand: null, taunt: null, kbFatigue: null };
}

/** 冻结或眩晕 = 不可移动。 */
export function isImmobile(e: Enemy): boolean {
  return e.status.frozen > 0 || e.status.stunned > 0;
}

/** Controlled means any active slow, freeze, stun, or taunt. */
export function isControlled(e: Enemy): boolean {
  return e.status.slow !== null || e.status.frozen > 0 || e.status.stunned > 0 || e.status.taunt !== null;
}

/** 移动速度乘数：不可动=0；减速取最强单一来源。 */
export function speedMultiplier(e: Enemy): number {
  if (isImmobile(e)) return 0;
  return e.status.slow ? Math.max(0, 1 - e.status.slow.ratio) : 1;
}

/** 受到伤害乘数（易伤）。 */
export function damageTakenMultiplier(e: Enemy): number {
  return e.status.vulnerable ? 1 + e.status.vulnerable.ratio : 1;
}

/** 施加减速：取最强 ratio，时长取最大（仲裁规则 3）。 */
export function applySlow(e: Enemy, ratio: number, duration: number): void {
  const cur = e.status.slow;
  e.status.slow = {
    ratio: Math.max(cur?.ratio ?? 0, ratio),
    remaining: Math.max(cur?.remaining ?? 0, duration),
  };
}

/** 施加冻结；stacksToTrigger 模式下累计层数、叠满才冻结（frost 2★ 修饰）。 */
export function applyFreeze(e: Enemy, duration: number, stacksToTrigger?: number): void {
  if (e.status.ccImmune > 0) return;
  if (stacksToTrigger && stacksToTrigger > 1) {
    e.status.freezeStacks++;
    if (e.status.freezeStacks < stacksToTrigger) return;
    e.status.freezeStacks = 0;
  }
  const effective = duration * (1 - cfg.enemies.types[e.type].ccResist);
  e.status.frozen = Math.max(e.status.frozen, effective);
}

export function applyStun(e: Enemy, duration: number): void {
  if (e.status.ccImmune > 0) return;
  const effective = duration * (1 - cfg.enemies.types[e.type].ccResist);
  e.status.stunned = Math.max(e.status.stunned, effective);
}

/** 施加易伤：取最强（仲裁规则 4）。 */
export function applyVulnerable(e: Enemy, ratio: number, duration: number): void {
  const cur = e.status.vulnerable;
  e.status.vulnerable = {
    ratio: Math.max(cur?.ratio ?? 0, ratio),
    remaining: Math.max(cur?.remaining ?? 0, duration),
  };
}

/** 击退：冻结中无效（仲裁规则 2）。返回是否实际发生位移。 */
export function applyKnockback(e: Enemy, fromX: number, fromY: number, distance: number): boolean {
  if (e.status.frozen > 0) return false;
  const fatigueMultiplier = e.status.kbFatigue?.multiplier ?? 1;
  const resistance = cfg.enemies.types[e.type].knockbackResist;
  const effective = distance * (1 - resistance) * fatigueMultiplier;
  if (!(effective > 0)) return false;
  const dx = e.x - fromX;
  const dy = e.y - fromY;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return false;
  e.x += (dx / len) * effective;
  e.y += (dy / len) * effective;
  const fatigue = cfg.combat.knockbackFatigue;
  e.status.kbFatigue = {
    multiplier: Math.max(fatigue.minMultiplier, fatigueMultiplier * fatigue.decayFactor),
    remaining: fatigue.windowSeconds,
  };
  return true;
}

export function applyBrand(e: Enemy, weight: number, duration: number): void {
  const cur = e.status.brand;
  e.status.brand = {
    weight: Math.max(cur?.weight ?? 0, weight),
    remaining: Math.max(cur?.remaining ?? 0, duration),
  };
}

export function applyTaunt(e: Enemy, x: number, y: number, duration: number, summonId?: number): void {
  e.status.taunt = { x, y, remaining: duration, summonId };
}

export function applyDot(e: Enemy, dps: number, duration: number): void {
  e.status.dots.push({ dps, remaining: duration });
}

/**
 * 推进所有敌人状态计时（不含 dot 伤害结算——那需要伤害管线，见 runtime.tickEffects）。
 * 嘲讽源召唤物已消失时立刻失效（仲裁规则 6）。
 */
export function tickStatusTimers(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    const s = e.status;
    if (s.slow && (s.slow.remaining -= dt) <= 0) s.slow = null;
    if (s.ccImmune > 0) s.ccImmune = Math.max(0, s.ccImmune - dt);
    if (s.frozen > 0 && (s.frozen -= dt) <= 0) {
      s.frozen = 0;
      s.ccImmune = Math.max(s.ccImmune, cfg.combat.ccImmunity.afterFreezeSeconds);
      s.freezeStacks = 0;
    }
    if (s.stunned > 0 && (s.stunned -= dt) <= 0) {
      s.stunned = 0;
      s.ccImmune = Math.max(s.ccImmune, cfg.combat.ccImmunity.afterStunSeconds);
    }
    if (s.vulnerable && (s.vulnerable.remaining -= dt) <= 0) s.vulnerable = null;
    if (s.brand && (s.brand.remaining -= dt) <= 0) s.brand = null;
    if (s.kbFatigue && (s.kbFatigue.remaining -= dt) <= 0) s.kbFatigue = null;
    if (s.taunt) {
      s.taunt.remaining -= dt;
      const sourceGone = s.taunt.summonId != null && !state.summons.some(sum => sum.id === s.taunt!.summonId);
      if (s.taunt.remaining <= 0 || sourceGone) s.taunt = null;
    }
    for (const dot of s.dots) dot.remaining -= dt;
  }
}
