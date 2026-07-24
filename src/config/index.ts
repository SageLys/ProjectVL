// 运行配置单例。core 与表现层一律 `import { cfg } from '../config'` 并在函数内读取，
// 禁止模块顶层解构缓存（否则 variant 切换/测试注入失效）。
import { buildConfig, variantsFromSearch } from './loader';
import type { GameConfig } from './types';

export type {
  CardAffixCandidateDef,
  CardAffixPoolDef,
  CardStatKind,
  EvolutionRecipeDef,
  EvolutionRecipesConfig,
  EvolutionTreeDef,
  GameConfig,
  GodDef,
  GodId,
  GodsConfig,
  RelicDef,
  RelicsConfig,
  RunBaseStatKind,
  WaveRewardDef,
  WaveRewardsConfig,
} from './types';
export { buildConfig, deepMerge, normalizeBossWaves, parseBossWavesInput, variantsFromSearch, VARIANTS } from './loader';

/** 当前生效的 variant 名单（浏览器读 URL；node/vitest 下为空 = 纯 base）。 */
export const activeVariants: string[] =
  typeof window !== 'undefined' && typeof window.location !== 'undefined'
    ? variantsFromSearch(window.location.search)
    : [];

/** 运行配置单例（对象引用稳定，属性可被 applyConfig 整域替换）。 */
export const cfg: GameConfig = buildConfig(activeVariants);

/** 整体替换单例内容（保持引用）。测试与 variant 热切换入口。 */
export function applyConfig(next: GameConfig): void {
  for (const key of Object.keys(next) as (keyof GameConfig)[]) {
    (cfg as unknown as Record<string, unknown>)[key] = next[key];
  }
}

/** 按 variant 名单重建并应用配置。 */
export function applyVariants(names: string[]): void {
  applyConfig(buildConfig(names));
}
