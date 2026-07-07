import { createInitialState, createDefaultConfig } from '../src/core/createInitialState';
import type { Card, CardType, Enemy, EnemyType, GameState } from '../src/core/types';

let idSeed = 1000;

/** 构造一张卡牌。id 自增，避免测试间碰撞。 */
export function card(type: CardType, star: number): Card {
  return { id: idSeed++, type, star };
}

/** 构造一只敌人（仅填测试关心的字段，其余给合理默认）。 */
export function enemy(partial: Partial<Enemy> & { type?: EnemyType } = {}): Enemy {
  return {
    x: 0, y: 0, type: 'normal', label: 't', hp: 10, maxHp: 10, speed: 20,
    r: 16, color: '#fff', damage: 8, xp: 1, hit: 0, ...partial,
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

export { createInitialState, createDefaultConfig };
