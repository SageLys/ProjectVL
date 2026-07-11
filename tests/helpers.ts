import { createInitialState, createDefaultConfig } from '../src/core/createInitialState';
import { applyVariants } from '../src/config';
import { emptyStatus } from '../src/core/effects/statusSystem';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import type { Card, CardType, Enemy, EnemyType, GameState } from '../src/core/types';

let idSeed = 1000;

/** 构造一张卡牌。id 自增，避免测试间碰撞。 */
export function card(type: CardType, star: number, locked = false): Card {
  const c: Card = { id: idSeed++, type, star };
  if (locked) c.locked = true;
  return c;
}

/** 构造一只敌人（仅填测试关心的字段，其余给合理默认）。 */
export function enemy(partial: Partial<Enemy> & { type?: EnemyType } = {}): Enemy {
  return {
    id: idSeed++, x: 0, y: 0, type: 'normal', label: 't', hp: 10, maxHp: 10, speed: 20,
    r: 16, color: '#fff', damage: 8, xp: 1, hit: 0, status: emptyStatus(), ...partial,
  };
}

/** 脚本化 rng：按序返回给定值，耗尽后重复最后一个（避免下标越界）。 */
export function seqRng(...values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : values[values.length - 1] ?? 0);
}

/** 恒定 rng。 */
export function constRng(v: number): () => number {
  return () => v;
}

export function freshState(): GameState {
  const s = createInitialState();
  s.mode = 'playing';
  return s;
}

/** 测试环境复位：回到 base 配置、清空技能定义注册表。 */
export function resetTestEnv(): void {
  applyVariants([]);
  registerSkillDefs([]);
}

export { createInitialState, createDefaultConfig, applyVariants, registerSkillDefs };
