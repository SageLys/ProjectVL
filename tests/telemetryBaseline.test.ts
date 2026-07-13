import { describe, expect, it } from 'vitest';
import { mergeBaselineDocument, type BaselinePayload } from '../src/telemetry/baseline';

function payload(id: string, busy: number, overall: number): BaselinePayload {
  return {
    meta: { date: '2026-07-13', gitCommit: 'abc', spawnMode: 'interval', presetName: 'feel-v1', player: 'tester' },
    config: { combat: { dangerZoneWidth: 72 } },
    session: { id, seed: 42, ratingPerWave: [{ busy, watch: 4, tension: 3 }], overall, telemetryFile: `telemetry/${id}.json` },
  };
}

describe('手感基线导出', () => {
  it('评分字段原样写入，多个 session 累加', () => {
    const first = mergeBaselineDocument({}, payload('session-a', 5, 4));
    const second = mergeBaselineDocument(first, payload('session-b', 3, 5));
    expect(second.sessions).toHaveLength(2);
    expect(second.sessions[0].ratingPerWave[0]).toEqual({ busy: 5, watch: 4, tension: 3 });
    expect(second.sessions[0].overall).toBe(4);
    expect(second.sessions[1].id).toBe('session-b');
  });

  it('同一 session 重复导出覆盖评分而不重复追加', () => {
    const first = mergeBaselineDocument({}, payload('session-a', 2, 2));
    const updated = mergeBaselineDocument(first, payload('session-a', 4, 5));
    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0].ratingPerWave[0].busy).toBe(4);
    expect(updated.sessions[0].overall).toBe(5);
  });
});
