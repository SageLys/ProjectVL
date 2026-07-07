import type { CardType, Config, SlotKind } from '../core/types';
import type { SlotSource } from '../ui/slotFactory';

/** window.__game 调试接口，供人工控制台与 Playwright 浏览器测试使用。 */
export interface DebugApi {
  getState(): unknown;
  start(): void;
  reset(): void;
  spawnGroundDrop(x: number, y: number, type?: CardType | null): void;
  addTestPair(): void;
  moveOrSwap(source: SlotSource, index: number, targetKind: SlotKind, targetIndex: number): void;
  setConfig(patch: Partial<Config>): void;
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

/** 仅在 DEV 构建下把调试接口挂到 window.__game。生产构建不注入。 */
export function exposeDebugApi(api: DebugApi): void {
  if (!import.meta.env.DEV) return;
  window.__game = api;
}
