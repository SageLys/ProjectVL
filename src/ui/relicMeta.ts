import { cfg } from '../config';
import type { RelicDef } from '../config/types';
import { resolveText } from '../data';

export interface RelicCopy {
  name: string;
  desc: string;
}

/** 遗物文案唯一入口：配置只留 textKey，文本一律来自 texts.json。缺文案时回退到 id，不空白。 */
export function relicCopy(relic: RelicDef): RelicCopy {
  return {
    name: resolveText(`${relic.textKey}.name`) ?? relic.id,
    desc: resolveText(`${relic.textKey}.desc`) ?? '',
  };
}

export function relicCopyById(relicId: string): RelicCopy {
  const relic = cfg.relics.relics.find(item => item.id === relicId);
  return relic ? relicCopy(relic) : { name: relicId, desc: '' };
}

export function relicDisplayName(relicId: string): string {
  return relicCopyById(relicId).name;
}
