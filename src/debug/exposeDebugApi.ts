import type { CardType, Config, SlotKind } from '../core/types';
import type { SlotSource } from '../ui/slotFactory';
import type { AttentionTelemetrySnapshot } from '../telemetry/attentionTelemetry';

/** window.__game 调试接口，供人工控制台与 Playwright 浏览器测试使用。 */
export interface DebugApi {
  getState(): unknown;
  start(): void;
  reset(): void;
  spawnGroundDrop(x: number, y: number, type?: CardType | null, star?: number): void;
  /** 确定性浏览器验收入口：生成 offered Bounty，返回后由真实画布点击接单。 */
  offerBounty(x: number, y: number): void;
  addTestPair(): void;
  moveOrSwap(source: SlotSource, index: number, targetKind: SlotKind, targetIndex: number): void;
  /** 消耗释放：手牌 index 卡在画布坐标 (x,y) 落点释放。 */
  consumeAt(index: number, x: number, y: number): void;
  /** 锁定即装备（方案B）：切换手牌 index 卡的锁定态。 */
  toggleLock(index: number): void;
  setConfig(patch: Partial<Config>): void;
  /** 当前生效的 variant 名单。 */
  getVariants(): string[];
  /** P4.1 触控与语义动作遥测；用于 T1/T2 导出。 */
  getAttentionTelemetry(): AttentionTelemetrySnapshot;
  /** P5 T2 导出：结算指标 + 最终构筑。 */
  getRunStats(): unknown;
  clearAttentionTelemetry(): void;
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
