import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeExperienceMetrics } from '../src/telemetry/metrics';
import type { TelemetrySession } from '../src/telemetry/types';

describe('seed=42 cross-engine golden telemetry', () => {
  it('recomputes the canonical fixture to the Unity-shared metrics', () => {
    const session = JSON.parse(readFileSync(
      new URL('./fixtures/telemetry_session_seed42.json', import.meta.url),
      'utf8',
    )) as TelemetrySession;
    const metrics = computeExperienceMetrics(session);
    const wave = metrics.waves[0];

    expect(session.meta.seed).toBe(42);
    expect(session.meta.presetName).toBe('seed42_acceptance');
    expect(wave.e1.p50).toBe(4);
    expect(wave.e1.p95).toBeCloseTo(7.4);
    expect(wave.e2).toBe(13);
    expect(wave.e3.max).toBe(3);
    expect(wave.e4).toEqual({ count: 1, visibleSecondsP50: 2 });
    expect(wave.e5.p50).toBe(.5);
    expect(wave.e6).toBe(3);
    expect(wave.e7).toBe(3);
    expect(metrics.first90.e1.p50).toBe(4);
    expect(metrics.first90.e6).toBe(3);
  });
});
