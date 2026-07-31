import { describe, expect, it } from 'vitest';
import {
  calculateStageMetrics,
  COMPACT_STAGE_HEIGHT,
  STANDARD_STAGE_HEIGHT,
  STAGE_WIDTH,
  type Insets,
} from '../src/platform/stageMetrics';

const none: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

describe('stage metrics', () => {
  it.each([
    [375, 667, 'compact'],
    [390, 744, 'compact'],
    [390, 844, 'standard'],
    [430, 932, 'standard'],
    [540, 960, 'compact'],
    [1280, 900, 'compact'],
  ] as const)('%d×%d selects %s and stays contained', (width, height, variant) => {
    const result = calculateStageMetrics({ x: 0, y: 0, width, height }, none);
    expect(result.variant).toBe(variant);
    expect(result.logicalWidth).toBe(STAGE_WIDTH);
    expect(result.logicalHeight).toBe(variant === 'standard' ? STANDARD_STAGE_HEIGHT : COMPACT_STAGE_HEIGHT);
    expect(result.stageRect.x).toBeGreaterThanOrEqual(result.availableRect.x);
    expect(result.stageRect.y).toBeGreaterThanOrEqual(result.availableRect.y);
    expect(result.stageRect.x + result.stageRect.width).toBeLessThanOrEqual(result.availableRect.x + result.availableRect.width + 0.001);
    expect(result.stageRect.y + result.stageRect.height).toBeLessThanOrEqual(result.availableRect.y + result.availableRect.height + 0.001);
  });

  it('subtracts notch and gesture insets before choosing layout', () => {
    const result = calculateStageMetrics(
      { x: 0, y: 0, width: 390, height: 844 },
      { top: 47, right: 0, bottom: 34, left: 0 },
    );
    expect(result.availableRect).toEqual({ x: 0, y: 47, width: 390, height: 763 });
    expect(result.variant).toBe('compact');
    expect(result.stageRect.y).toBeGreaterThanOrEqual(47);
  });

  it('toolbar height changes discretely from standard to compact', () => {
    expect(calculateStageMetrics({ x: 0, y: 0, width: 390, height: 844 }, none).variant).toBe('standard');
    expect(calculateStageMetrics({ x: 0, y: 0, width: 390, height: 744 }, none).variant).toBe('compact');
  });

  it('uses one contain scale only on the shortest screen', () => {
    const result = calculateStageMetrics({ x: 0, y: 0, width: 375, height: 667 }, none);
    expect(result.usedContainFallback).toBe(true);
    expect(result.scale).toBeCloseTo(667 / COMPACT_STAGE_HEIGHT);
    expect(result.stageRect.x).toBeGreaterThanOrEqual(0);
    expect(result.stageRect.y).toBe(0);
  });
});
