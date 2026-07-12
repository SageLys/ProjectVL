// variant 加载器：base（六域）+ 若干覆盖文件深合并 → 运行配置。
// A/B 测试基建：URL 参数 ?variant=a,b 或调参面板切换（切换=带参重载，保证一局内配置不漂移）。
import combat from './base/combat.json';
import waves from './base/waves.json';
import enemies from './base/enemies.json';
import skills from './base/skills.json';
import progression from './base/progression.json';
import economy from './base/economy.json';
import tuner from './base/tuner.json';
import equipSlots from '../config/variants/equip-slots.json';
import devShort from '../config/variants/dev-short.json';
import difficultyEasy from '../config/variants/difficulty-easy.json';
import difficultyHard from '../config/variants/difficulty-hard.json';
import type { DeepPartial, GameConfig } from './types';

/** 已注册 variant。新增覆盖文件后在此登记（key = URL 参数名）。 */
export const VARIANTS: Record<string, DeepPartial<GameConfig>> = {
  'equip-slots': equipSlots as DeepPartial<GameConfig>,
  'dev-short': devShort as DeepPartial<GameConfig>,
  'difficulty-easy': difficultyEasy as DeepPartial<GameConfig>,
  'difficulty-hard': difficultyHard as DeepPartial<GameConfig>,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 深合并：对象递归合并，数组与标量整体替换。不修改入参，返回新对象。 */
export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    if (key === '$comment') continue;
    const pv = (patch as Record<string, unknown>)[key];
    const bv = (base as Record<string, unknown>)[key];
    out[key] = isPlainObject(bv) && isPlainObject(pv) ? deepMerge(bv, pv as DeepPartial<unknown>) : pv;
  }
  return out as T;
}

function assembleBase(): GameConfig {
  return structuredClone({
    combat,
    waves,
    enemies,
    skills,
    progression,
    economy,
    tuner,
  }) as unknown as GameConfig;
}

/** base + 依序叠加各 variant。未注册的名字忽略并告警（不炸整局）。 */
export function buildConfig(variantNames: string[] = []): GameConfig {
  let cfg = assembleBase();
  for (const name of variantNames) {
    const patch = VARIANTS[name];
    if (!patch) {
      console.warn(`[config] 未知 variant: ${name}（可用: ${Object.keys(VARIANTS).join(', ')}）`);
      continue;
    }
    cfg = deepMerge<GameConfig>(cfg, patch);
  }
  return cfg;
}

/** 解析 URL search 中的 variant 列表：?variant=a,b 与 ?variant=a&variant=b 均支持。 */
export function variantsFromSearch(search: string): string[] {
  const params = new URLSearchParams(search);
  return params.getAll('variant').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
}
