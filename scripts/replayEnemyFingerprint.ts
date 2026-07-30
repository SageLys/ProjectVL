import { createHash } from 'node:crypto';
import { runReplay } from '../src/core/replay/record';
import { loadSpecs } from '../tests/golden/fixtures';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

const traceId = process.env.REPLAY_TRACE_ID;
const traceSection = process.env.REPLAY_TRACE_SECTION ?? 'enemySequence';
for (const spec of loadSpecs().filter(candidate => !traceId || candidate.id === traceId)) {
  const summary = runReplay(spec);
  const generated = summary.enemySequence.map(({ frame: _frame, id: _id, ...enemy }) => enemy);
  if (traceId) {
    console.log(JSON.stringify(summary[traceSection as keyof typeof summary]));
    continue;
  }
  console.log(JSON.stringify({
    fixture: spec.id,
    enemies: generated.length,
    generationHash: hash(generated),
    timingHash: hash(summary.enemySequence),
    rngDraws: summary.rng.draws,
  }));
}
