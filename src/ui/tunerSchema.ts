// 调参面板的取数视图：元数据本身来自 `config/base/tuner.json`（唯一来源），
// 这里只负责「按面板需要切片」+「把 labelKey 解析成显示文案」。
import { cfg } from '../config';
import {
  TUNER_GROUP_ORDER, exposedParams, findParam, getNumberAt, paramsInGroup, setNumberAt, sliderParams,
} from '../config/tunerMeta';
import type { TunerGroup, TunerParamMeta } from '../config/types';
import { resolveText, resolveTextNode } from '../data';

export type { TunerGroup, TunerParamMeta };
export { TUNER_GROUP_ORDER, getNumberAt, setNumberAt };

/** 面板中全部可操作参数（含 boolean/enum/text 专用控件），顺序即 JSON 声明顺序。 */
export function panelTunerParams(): TunerParamMeta[] {
  return exposedParams(cfg.tuner);
}

/** 面板中的数值滑杆；`data-tuner-index` 即本数组下标。 */
export function tunerSliders(): TunerParamMeta[] {
  return sliderParams(cfg.tuner);
}

export function tunerSlidersInGroup(group: TunerGroup): TunerParamMeta[] {
  return paramsInGroup(cfg.tuner, group);
}

export function tunerParam(path: string): TunerParamMeta {
  return findParam(cfg.tuner, path);
}

/** 参数标签；缺文案时回退到路径本身，面板不会因缺 key 而空白。 */
export function tunerLabel(param: TunerParamMeta): string {
  return resolveText(param.labelKey) ?? param.path;
}

export function tunerParamLabel(path: string): string {
  return tunerLabel(tunerParam(path));
}

/** 分组标题与角标；缺文案时回退到分组键。 */
export function tunerGroupCopy(group: TunerGroup): { title: string; note?: string } {
  const node = resolveTextNode(`tuner.groups.${group}`) as { title?: string; note?: string } | undefined;
  return { title: node?.title ?? group, note: node?.note };
}

/** Preset 中的 Boss 波次统一保存为规范字符串，避免数组引用造成错误 diff。 */
export function formatBossWaves(values: readonly number[]): string {
  return [...new Set(values)].sort((a, b) => a - b).join(', ');
}

/** 兼容旧 Preset；新字段存在时优先使用新字段。 */
export function migratePresetValues(values: Record<string, number | string | boolean>): Record<string, number | string | boolean> {
  const migrated = { ...values };
  if (migrated['rewardMeter.pointMul'] === undefined && migrated['progression.killXpMul'] !== undefined) {
    migrated['rewardMeter.pointMul'] = migrated['progression.killXpMul'];
  }
  delete migrated['progression.killXpMul'];
  delete migrated['progression.relicChoices'];
  if (migrated['waves.bossWaves'] === undefined && migrated['waves.bossWave'] !== undefined) {
    migrated['waves.bossWaves'] = String(migrated['waves.bossWave']);
  }
  delete migrated['waves.bossWave'];
  return migrated;
}
