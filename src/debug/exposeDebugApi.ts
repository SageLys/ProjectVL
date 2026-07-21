import type { CardType, Config, SlotKind } from '../core/types';
import type { SlotSource } from '../ui/slotFactory';
import type { DifficultyId } from '../config/types';

/** window.__game 调试接口，供人工控制台与 Playwright 浏览器测试使用。 */
export interface DebugApi {
  getState(): unknown;
  start(): void;
  reset(): void;
  setDifficulty(id: DifficultyId): void;
  spawnGroundDrop(x: number, y: number, type?: CardType | null, star?: number): void;
  addTestPair(): void;
  grantWildcard(star: number, count?: number): void;
  moveOrSwap(source: SlotSource, index: number, targetKind: SlotKind, targetIndex: number): void;
  /** 消耗释放：手牌 index 卡在画布坐标 (x,y) 落点释放。 */
  consumeAt(index: number, x: number, y: number): void;
  setConfig(patch: Partial<Config>): void;
  /** 当前生效的 variant 名单。 */
  getVariants(): string[];
  jumpToWave(wave: number): void;
  restartWave(): void;
  setInvincible(value: boolean): void;
  setTimeScale(scale: number): void;
  setSeed(seed: number): void;
  getDebugSettings(): { seed: number; timeScale: number; invincible: boolean };
  getBountyTelemetry(): {
    chance: number;
    noDamageSeconds: number;
    offersThisWave: number;
    maxOffersPerWave: number;
    checkTimer: number;
    cooldownRemaining: number;
    currentRewardType: string | null;
    encounterAlive: number;
    encounterTotal: number;
    guaranteedThisWave: boolean;
  };
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

/** 面板启用时把调试接口挂到 window.__game；是否挂载由调用方统一控制。 */
export function exposeDebugApi(api: DebugApi): void {
  window.__game = api;
}

/** mulberry32：32 位整数 seed 对应稳定的 [0,1) 序列。 */
export function createSeededRng(seed: number): () => number {
  let value = Math.trunc(seed) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
