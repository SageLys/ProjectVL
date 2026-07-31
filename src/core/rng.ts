import type { Rng } from './types';

/**
 * mulberry32：32 位整数 seed → 稳定的 [0,1) 序列。**跨引擎黄金回放的唯一 rng 实现**。
 *
 * 只用 uint32 加法、异或、右移与 Math.imul（32 位有符号乘法），不依赖任何浮点细节，
 * 因此 C#/C++ 可逐位复刻；唯一的浮点动作是最后一步除以 2^32。
 * 算法与常量另见 `docs/黄金回放_fixture规格.md` §RNG，Unity 侧必须实现同一份。
 */
export function makeRng(seed: number): Rng {
  let value = Math.trunc(seed) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CountingRng {
  rng: Rng;
  /** 已抽取次数：rng 调用次序的指纹，任一系统多抽/少抽一次都会暴露。 */
  draws(): number;
  /** 最近一次抽取的返回值；未抽取过为 null。 */
  last(): number | null;
}

/** 包一层计数器：黄金回放用它把「rng 调用次序」也纳入可比摘要。 */
export function makeCountingRng(seed: number): CountingRng {
  const source = makeRng(seed);
  let count = 0;
  let last: number | null = null;
  return {
    rng: () => { count++; last = source(); return last; },
    draws: () => count,
    last: () => last,
  };
}
