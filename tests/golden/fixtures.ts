// 黄金 fixture 的读写入口。spec 与 summary 都是 JSON——Unity 侧直接读同一批文件重放比对。
// 录制走 `npm run replay:record`；回放测试只读，绝不写盘。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplaySpec, ReplaySummary } from '../../src/core/replay/record';

export const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));

const specPath = (id: string): string => join(GOLDEN_DIR, `${id}.spec.json`);
const summaryPath = (id: string): string => join(GOLDEN_DIR, `${id}.summary.json`);

/** 按文件名排序返回全部 spec，保证录制与回放顺序稳定。 */
export function loadSpecs(): ReplaySpec[] {
  return readdirSync(GOLDEN_DIR)
    .filter(name => name.endsWith('.spec.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(join(GOLDEN_DIR, name), 'utf8')) as ReplaySpec);
}

export function loadSpec(id: string): ReplaySpec {
  return JSON.parse(readFileSync(specPath(id), 'utf8')) as ReplaySpec;
}

export function loadSummary(id: string): ReplaySummary {
  return JSON.parse(readFileSync(summaryPath(id), 'utf8')) as ReplaySummary;
}

/** 只由录制脚本调用。 */
export function writeSummary(id: string, summary: ReplaySummary): string {
  const path = summaryPath(id);
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return path;
}
