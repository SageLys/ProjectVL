// 调参元数据的读取与校验。**唯一来源是 `base/tuner.json`**（TunerParamMeta[]）：
// 范围、标签键、分组、生效策略、控件形态合一；面板、测试与后续配置编辑器都从这里取。
import type { GameConfig, TunerGroup, TunerParamMeta } from './types';

/** 面板分组的渲染顺序；p2 单独折叠展示，不在此列。 */
export const TUNER_GROUP_ORDER: readonly TunerGroup[] = [
  'waves', 'combat', 'enemies', 'drops', 'progression', 'bounty',
];

/** exposed 缺省视为 true；false = 已声明范围但当前不在面板暴露。 */
export function isExposed(param: TunerParamMeta): boolean {
  return param.exposed !== false;
}

export function exposedParams(tuner: GameConfig['tuner']): TunerParamMeta[] {
  return tuner.params.filter(isExposed);
}

/** 面板中的数值滑杆（专用控件为 boolean/enum/text，不在此列）。 */
export function sliderParams(tuner: GameConfig['tuner']): TunerParamMeta[] {
  return tuner.params.filter(param => isExposed(param) && param.type === 'number');
}

export function paramsInGroup(tuner: GameConfig['tuner'], group: TunerGroup): TunerParamMeta[] {
  return sliderParams(tuner).filter(param => param.group === group);
}

export function findParam(tuner: GameConfig['tuner'], path: string): TunerParamMeta {
  const param = tuner.params.find(item => item.path === path);
  if (!param) throw new Error(`[tuner] 未声明的调参路径: ${path}`);
  return param;
}

export function getNumberAt(root: unknown, path: string): number {
  let value: unknown = root;
  for (const key of path.split('.')) value = (value as Record<string, unknown>)[key];
  if (typeof value !== 'number') throw new Error(`调参路径不是数值: ${path}`);
  return value;
}

export function setNumberAt(root: unknown, path: string, value: number): void {
  const keys = path.split('.');
  let target = root as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys[keys.length - 1]] = value;
}

function fail(path: string, message: string): never {
  throw new Error(`[tuner-schema v0.2.0] ${path}: ${message}`);
}

/**
 * 启动即校验：路径唯一、指向真实配置值、数值参数范围合法、枚举有候选。
 * 迁移前这些错误要等到面板渲染时才以 `tuner.json 缺少范围` 抛出。
 */
export function validateTunerConfig(config: GameConfig): void {
  const tuner = config.tuner;
  if (!tuner || typeof tuner.version !== 'string') fail('$.tuner.version', '必须是字符串');
  if (!Array.isArray(tuner.params)) fail('$.tuner.params', '必须是数组');
  const seen = new Set<string>();
  tuner.params.forEach((param, index) => {
    const at = `$.tuner.params[${index}]`;
    if (typeof param.path !== 'string' || !param.path) fail(`${at}.path`, '必须是非空字符串');
    if (seen.has(param.path)) fail(`${at}.path`, `重复的调参路径: ${param.path}`);
    seen.add(param.path);
    if (typeof param.labelKey !== 'string' || !param.labelKey) fail(`${at}.labelKey`, '必须是非空字符串');
    if (!TUNER_GROUP_ORDER.includes(param.group) && param.group !== 'p2') fail(`${at}.group`, '非法分组');
    if (param.applyPolicy !== 'immediate' && param.applyPolicy !== 'waveDeferred') {
      fail(`${at}.applyPolicy`, '必须是 immediate 或 waveDeferred');
    }
    if (param.type === 'number') {
      for (const key of ['min', 'max', 'step'] as const) {
        if (typeof param[key] !== 'number' || !Number.isFinite(param[key])) fail(`${at}.${key}`, '必须是有限数值');
      }
      if (param.min! >= param.max!) fail(`${at}.min`, 'min 必须小于 max');
      if (param.step! <= 0) fail(`${at}.step`, 'step 必须大于 0');
      // 路径必须真的指向一个数值，否则面板会滑动一个不存在的字段。
      try { getNumberAt(config, param.path); } catch { fail(`${at}.path`, '未指向配置中的数值'); }
    } else if (param.type === 'enum') {
      if (!Array.isArray(param.options) || !param.options.length) fail(`${at}.options`, 'enum 必须声明候选值');
    } else if (param.type !== 'boolean' && param.type !== 'text') {
      fail(`${at}.type`, '非法控件形态');
    }
  });
}
