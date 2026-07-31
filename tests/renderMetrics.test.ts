import { describe, expect, it } from 'vitest';
import { calculateCanvasBacking, logicalFontPx, MAX_RENDER_DPR, renderDpr } from '../src/render/renderMetrics';

describe('canvas render metrics', () => {
  it.each([1, 2, 3])('uses DPR %d only for backing store', dpr => {
    const result = calculateCanvasBacking(270, 365, dpr);
    expect(result.backingWidth).toBe(270 * dpr);
    expect(result.backingHeight).toBe(365 * dpr);
    expect(result.logicalWidth).toBe(540);
    expect(result.logicalHeight).toBe(730);
    expect(result.cssWidth).toBe(270);
  });

  it('derives a logical font size from target screen size and clamps it', () => {
    expect(logicalFontPx(11, 0.5)).toBe(22);
    expect(logicalFontPx(11, 0.1)).toBe(30);
  });

  it('caps the runtime render DPR budget without changing the pure DPR calculation', () => {
    expect(MAX_RENDER_DPR).toBe(2);
    expect(renderDpr(3)).toBe(2);
    expect(renderDpr(2)).toBe(2);
    expect(renderDpr(1)).toBe(1);
    expect(calculateCanvasBacking(270, 365, 3).dpr).toBe(3);
  });
});
