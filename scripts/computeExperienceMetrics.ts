import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeExperienceMetrics } from '../src/telemetry/metrics.ts';
import type { TelemetrySession } from '../src/telemetry/types.ts';

function value(number: number | null, digits = 2): string {
  return number == null || !Number.isFinite(number) ? '—' : number.toFixed(digits);
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error('用法: npm run metrics -- telemetry/session_<时间戳>_<seed>.json');
  for (const path of paths) {
    const absolute = resolve(process.cwd(), path);
    const session = JSON.parse(await readFile(absolute, 'utf8')) as TelemetrySession;
    if (!session.meta || !Array.isArray(session.events) || !Array.isArray(session.samples) || !Array.isArray(session.inputs)) throw new Error(`${path}: 不是有效 session JSON`);
    const result = computeExperienceMetrics(session);
    console.log(`\n${path}  seed=${session.meta.seed}  preset=${session.meta.presetName || '—'}`);
    console.table(result.waves.map(wave => ({
      wave: wave.wave,
      'E1 P50': value(wave.e1.p50, 1),
      'E1 P95': value(wave.e1.p95, 1),
      'E2 max gap(s)': value(wave.e2),
      'E3 10s P50': value(wave.e3.p50, 1),
      'E3 10s max': wave.e3.max,
      'E4 danger': wave.e4.count,
      'E4 visible P50(s)': value(wave.e4.visibleSecondsP50),
      'E5 depth P50': value(wave.e5.p50, 3),
      'E6 first90 inputs': wave.e6,
      'E7 sprint ratio': value(wave.e7, 3),
    })));
    console.table([{
      slice: 'first 90s',
      'E1 P50/P95': `${value(result.first90.e1.p50, 1)} / ${value(result.first90.e1.p95, 1)}`,
      E2: value(result.first90.e2),
      'E3 P50/max': `${value(result.first90.e3.p50, 1)} / ${result.first90.e3.max}`,
      E4: result.first90.e4.count,
      E6: result.first90.e6,
    }]);
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
