// variant 加载器：base（六域）+ 若干覆盖文件深合并 → 运行配置。
// A/B 测试基建：URL 参数 ?variant=a,b 或调参面板切换（切换=带参重载，保证一局内配置不漂移）。
import combat from './base/combat.json';
import waves from './base/waves.json';
import enemies from './base/enemies.json';
import difficulty from './base/difficulty.json';
import skills from './base/skills.json';
import progression from './base/progression.json';
import economy from './base/economy.json';
import bounty from './base/bounty.json';
import tuner from './base/tuner.json';
import input from './base/input.json';
import devShort from '../config/variants/dev-short.json';
import type { DeepPartial, GameConfig } from './types';
import { validateSkillsConfig } from './skillValidator';
import { validateProgressionConfig } from './progressionValidator';
import { validateDifficultyConfig } from './difficultyValidator';
import { validateIntermissionConfig, validateStagePlanConfig } from './stagePlanValidator';
import { validateGodConfig } from './godValidator';

const optionalBaseModules = import.meta.glob<{ default: unknown }>(
  './base/{gods,relics,evolutionRecipes,waveRewards}.json',
  { eager: true },
);

function optionalBaseConfig<K extends 'gods' | 'relics' | 'evolutionRecipes' | 'waveRewards'>(
  fileName: string,
  fallback: GameConfig[K],
): GameConfig[K] {
  const loaded = optionalBaseModules[`./base/${fileName}`];
  return (loaded?.default ?? fallback) as GameConfig[K];
}

// C0 兼容层：新文件尚未部署时回落为空域，旧战斗路径仍可启动。
const gods = optionalBaseConfig('gods.json', { version: '0.1.0', gods: [] });
const relics = optionalBaseConfig('relics.json', { version: '0.1.0', relics: [] });
const evolutionRecipes = optionalBaseConfig('evolutionRecipes.json', { version: '0.1.0', recipes: [] });
const waveRewards = optionalBaseConfig('waveRewards.json', { version: '0.1.0', rewards: [] });

function normalizeValidationRewards(config: GameConfig): void {
  for (const wave of config.waves.stagePlan.validation) {
    for (const enemy of wave.enemies) {
      const reward = enemy.reward as unknown as Record<string, unknown>;
      if (!reward.kind) reward.kind = 'wildcard';
    }
    const bossReward = wave.bossReward as unknown as Record<string, unknown>;
    if (!bossReward.kind) bossReward.kind = 'wildcard';
  }
}

/** 将配置中的 Boss 波次限制为可达、唯一且升序的整数列表。 */
export function normalizeBossWaves(values: readonly number[], totalWaves: number): number[] {
  return [...new Set(values)]
    .filter(value => Number.isInteger(value) && value >= 1 && value <= totalWaves)
    .sort((a, b) => a - b);
}

export interface BossWavesParseResult {
  values: number[];
  invalid: string[];
}

/** 解析调参面板的逗号分隔输入；空输入表示本局没有 Boss。 */
export function parseBossWavesInput(input: string, totalWaves: number): BossWavesParseResult {
  const text = input.trim();
  if (!text) return { values: [], invalid: [] };
  const tokens = text.replace(/，/g, ',').split(',').map((token: string) => token.trim());
  const invalid: string[] = [];
  const values: number[] = [];
  for (const token of tokens) {
    const value = Number(token);
    if (!token || !Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > totalWaves) {
      invalid.push(token || '空值');
    } else values.push(value);
  }
  return { values: normalizeBossWaves(values, totalWaves), invalid };
}

/** 已注册 variant。新增覆盖文件后在此登记（key = URL 参数名）。 */
export const VARIANTS: Record<string, DeepPartial<GameConfig>> = {
  'dev-short': devShort as DeepPartial<GameConfig>,
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
  validateSkillsConfig(skills);
  validateProgressionConfig(progression);
  validateDifficultyConfig(difficulty as GameConfig['difficulty']);
  const config = structuredClone({
    combat,
    waves,
    enemies,
    difficulty,
    skills,
    gods,
    relics,
    evolutionRecipes,
    waveRewards,
    progression,
    economy,
    bounty,
    input,
    // 可玩原型的构建预览也保留调参面板；可在运行时用 ?devtools=0 隐藏。
    tuner,
  }) as unknown as GameConfig;
  normalizeValidationRewards(config);
  validateGodConfig(config);
  validateIntermissionConfig(config.waves.intermission);
  validateStagePlanConfig(config.waves.stagePlan, config.waves.totalWaves, config.economy.maxStar, config.waves.waveBoss.reward);
  return config;
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
  cfg.waves.bossWaves = normalizeBossWaves(cfg.waves.bossWaves, cfg.waves.totalWaves);
  normalizeValidationRewards(cfg);
  validateSkillsConfig(cfg.skills);
  validateGodConfig(cfg);
  validateIntermissionConfig(cfg.waves.intermission);
  validateProgressionConfig(cfg.progression);
  validateDifficultyConfig(cfg.difficulty);
  validateStagePlanConfig(cfg.waves.stagePlan, cfg.waves.totalWaves, cfg.economy.maxStar, cfg.waves.waveBoss.reward);
  return cfg;
}

/** 解析 URL search 中的 variant 列表：?variant=a,b 与 ?variant=a&variant=b 均支持。 */
export function variantsFromSearch(search: string): string[] {
  const params = new URLSearchParams(search);
  return params.getAll('variant').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
}
