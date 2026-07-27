// 重生成黄金 fixture 的 summary：`npm run replay:record`（可选传 fixture id 只重录部分）。
// 回放测试是只读的，唯有本脚本会写盘——避免 fixture 被无意覆盖。
import { runReplay } from '../src/core/replay/record.ts';
import { loadSpecs, writeSummary } from '../tests/golden/fixtures.ts';

function main(): void {
  const wanted = new Set(process.argv.slice(2));
  const specs = loadSpecs().filter(spec => wanted.size === 0 || wanted.has(spec.id));
  if (!specs.length) throw new Error(`没有匹配的 fixture: ${[...wanted].join(', ') || '(空)'}`);

  const rows = specs.map(spec => {
    const started = Date.now();
    const summary = runReplay(spec);
    writeSummary(spec.id, summary);
    return {
      fixture: spec.id,
      frames: `${summary.framesRun}/${spec.frames}`,
      mode: summary.mode,
      win: summary.win === null ? '—' : String(summary.win),
      wave: summary.wave.wave,
      hp: Number(summary.hp.toFixed(2)),
      kills: summary.counters.kills,
      merges: summary.counters.merges,
      consumes: summary.counters.consumes,
      equipOps: summary.counters.equipOps,
      drops: summary.dropSequence.length,
      events: summary.eventSequence.length,
      rngDraws: summary.rng.draws,
      ms: Date.now() - started,
    };
  });

  console.table(rows);
  console.log(`已写入 ${rows.length} 份 summary 到 tests/golden/`);
}

main();
