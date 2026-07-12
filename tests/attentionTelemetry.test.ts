import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAttentionTelemetry,
  getAttentionTelemetry,
  recordAttentionEvent,
  recordPointerTelemetry,
} from '../src/telemetry/attentionTelemetry';

beforeEach(clearAttentionTelemetry);

describe('attentionTelemetry', () => {
  it('记录语义动作并返回不可共享引用的快照', () => {
    recordAttentionEvent({
      gameTime: 12,
      wave: 2,
      kind: 'semantic-action',
      action: 'bounty-accept',
      targetKind: 'bounty',
      targetId: 7,
    });
    const first = getAttentionTelemetry();
    expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({ action: 'bounty-accept', targetId: 7, sequence: 1 });
    first.events[0].action = 'mutated';
    expect(getAttentionTelemetry().events[0].action).toBe('bounty-accept');
  });

  it('把 pointerRouter 元数据投影为 T1 可导出的动作记录', () => {
    recordPointerTelemetry({
      type: 'pointer-action',
      action: 'arena-tap',
      source: 'arena',
      pointerId: 3,
      pointerType: 'touch',
      durationMs: 180,
      distancePx: 4,
      startClient: { x: 10, y: 20 },
      endClient: { x: 12, y: 23 },
      cancelled: false,
      canvasPoint: { x: 100, y: 200 },
      resolvedAction: 'drop-pickup',
      targetKind: 'drop',
      targetId: 11,
    }, 3.5, 1);
    expect(getAttentionTelemetry().events[0]).toMatchObject({
      action: 'drop-pickup',
      gameTime: 3.5,
      wave: 1,
      x: 100,
      y: 200,
      durationMs: 180,
      pointerType: 'touch',
    });
  });
});
