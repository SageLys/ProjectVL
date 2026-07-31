import { describe, expect, it } from 'vitest';
import { simulationSteps } from '../src/core/simulationClock';

describe('simulation clock', () => {
  it('preserves elapsed time below the catch-up ceiling at low render FPS', () => {
    for (const fps of [60, 30, 20, 15, 10]) {
      const elapsed = 1 / fps;
      const steps = simulationSteps(elapsed, 0.033);
      expect(steps.reduce((sum, step) => sum + step, 0)).toBeCloseTo(elapsed);
      expect(Math.max(...steps)).toBeLessThanOrEqual(0.033);
    }
  });

  it('splits a 15 FPS frame instead of discarding half its time', () => {
    expect(simulationSteps(1 / 15, 0.033)).toEqual([
      0.033,
      0.033,
      expect.closeTo(1 / 15 - 0.066),
    ]);
  });

  it('caps a long background-tab gap to avoid a spiral of death', () => {
    const steps = simulationSteps(10, 0.033);
    expect(steps.reduce((sum, step) => sum + step, 0)).toBeCloseTo(0.5);
    expect(steps).toHaveLength(16);
  });
});
