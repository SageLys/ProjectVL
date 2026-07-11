// 敌人状态效果：施加、查询、推进、过期。
// 原子交互冲突仲裁表（P2 §2 正交性约束要求集中于此，禁止散落在各原子里）：
//   1. 冻结/眩晕 → 不可移动（速度=0），且嘲讽在此期间不生效（反正动不了）。
//   2. 冻结中 → 击退无效（冻结体不可位移）。
//   3. 减速多来源 → 取最强 ratio，剩余时长取最大（不叠乘，防组合失控）。
//   4. 易伤多来源 → 同减速：取最强。
//   5. 索敌优先级（炮台）：bounty(P5) > 烙印 brand 权重降序 > 最近敌人。
//   6. 移动目标（敌人）：嘲讽（点/召唤物）> 炮台；嘲讽召唤物死亡即失效。
export const CONFLICT_RULES = [
  'freeze/stun → 不可移动，嘲讽暂停',
  'freeze → 击退无效',
  'slow 多来源取最强，不叠乘',
  'vulnerable 多来源取最强',
  '索敌: bounty > brand 权重 > 最近',
  '移动: taunt > 炮台；嘲讽源死亡即失效',
] as const;

import type { Enemy, EnemyStatus, GameState } from '../types';

export function emptyStatus(): EnemyStatus {
  return { slow: null, frozen: 0, freezeStacks: 0, stunned: 0, vulnerable: null, dots: [], brand: null, taunt: null };
}

/** 冻结或眩晕 = 不可移动。 */
export function isImmobile(e: Enemy): boolean {
  return e.status.frozen > 0 || e.status.stunned > 0;
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
  if (stacksToTrigger && stacksToTrigger > 1) {
    e.status.freezeStacks++;
    if (e.status.freezeStacks < stacksToTrigger) return;
    e.status.freezeStacks = 0;
  }
  e.status.frozen = Math.max(e.status.frozen, duration);
}

export function applyStun(e: Enemy, duration: number): void {
  e.status.stunned = Math.max(e.status.stunned, duration);
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
  const dx = e.x - fromX;
  const dy = e.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  e.x += (dx / len) * distance;
  e.y += (dy / len) * distance;
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
    if (s.frozen > 0) s.frozen -= dt;
    if (s.stunned > 0) s.stunned -= dt;
    if (s.vulnerable && (s.vulnerable.remaining -= dt) <= 0) s.vulnerable = null;
    if (s.brand && (s.brand.remaining -= dt) <= 0) s.brand = null;
    if (s.taunt) {
      s.taunt.remaining -= dt;
      const sourceGone = s.taunt.summonId != null && !state.summons.some(sum => sum.id === s.taunt!.summonId);
      if (s.taunt.remaining <= 0 || sourceGone) s.taunt = null;
    }
    for (const dot of s.dots) dot.remaining -= dt;
  }
}
