import { describe, expect, it } from 'vitest';
import { computeExperienceMetrics, percentile } from '../src/telemetry/metrics';
import type { TelemetryEvent, TelemetrySession } from '../src/telemetry/types';

function session(events: TelemetryEvent[], enemies: number[] = [], inputTimes: number[] = []): TelemetrySession {
  return {
    meta: { startedAt: '2026-07-13T00:00:00.000Z', exportedAt: '2026-07-13T00:01:00.000Z', config: {}, presetName: 'fixture', seed: 42, gitCommit: 'test' },
    events,
    samples: enemies.map((count, index) => ({ at: index * 5, wave: 1, enemies: count })),
    inputs: inputTimes.map(at => ({ type: 'pickupClick', at, wave: 1 })),
  };
}

const event = (type: TelemetryEvent['type'], at: number, extra: Partial<TelemetryEvent> = {}): TelemetryEvent => ({ type, at, wave: 1, ...extra });

describe('stage and drop telemetry metrics', () => {
  it('separates cadence, abandonment, rejection and validation rewards by source', () => {
    const result = computeExperienceMetrics(session([
      event('waveStart', 0, { stage: 'validation', maturity: .72, highestStar: 4, equippedCount: 3 }),
      event('dropLanded', 1, { source: 'normalKill' }),
      event('pickup', 2, { source: 'normalKill' }),
      event('dropExpired', 3, { source: 'normalKill' }),
      event('dropExpired', 4, { source: 'bounty' }),
      event('dropRejectedFullHand', 5, { source: 'normalKill' }),
      event('validationRewardLanded', 6, { secure: true, star: 4, rewardKind: 'card', typePolicy: 'build' }),
      event('validationRewardLanded', 7, { secure: true, star: 5, rewardKind: 'wildcard' }),
      event('waveCleared', 10, { stage: 'validation', activeRegularSeconds: 30, ordinaryDropsShown: 20, eligibleKills: 40 }),
    ])).waves[0];
    expect(result).toMatchObject({
      stage: 'validation', activeRegularSeconds: 30, ordinaryDropsShownPerMinute: 40,
      eligibleKillsPerMinute: 80, ordinaryPickupRate: .5, ordinaryExpiryRate: .5,
      dropRejectedFullHand: 1, validationRewardDrops: 2, validationOrdinaryDrops: 1,
      buildAtStart: { maturity: .72, highestStar: 4, equippedCount: 3 },
    });
  });
});

describe('E1–E7 指标重算', () => {
  it('E1 对空样本返回 null，并按线性分位数计算 P50/P95', () => {
    expect(percentile([], .5)).toBeNull();
    const result = computeExperienceMetrics(session([event('waveStart', 0), event('waveCleared', 20)], [0, 2, 4, 6, 8])).waves[0];
    expect(result.e1.p50).toBe(4);
    expect(result.e1.p95).toBeCloseTo(7.6);
  });

  it('E2 包含波开始到首个 spawn，且不把 mergeOpportunity 算进事件全集', () => {
    const result = computeExperienceMetrics(session([event('waveStart', 0), event('mergeOpportunity', 3), event('spawn', 4), event('kill', 7), event('waveCleared', 8)])).waves[0];
    expect(result.e2).toBe(4);
  });

  it('E3 只计掉落落地、perk 弹出、可合成机会，滚动 10s 左开右闭', () => {
    const result = computeExperienceMetrics(session([
      event('waveStart', 0), event('dropLanded', 1), event('pickup', 2), event('perkPopup', 10), event('mergeOpportunity', 11), event('waveCleared', 20),
    ], [1, 1, 1, 1, 0])).waves[0];
    expect(result.e3.max).toBe(2);
  });

  it('E4 每敌只记一次危险区进入，并截断辅助存活时长到切片末尾', () => {
    const result = computeExperienceMetrics(session([
      event('waveStart', 0), event('dangerEnter', 4, { enemyId: 1, visibleSeconds: 3 }), event('dangerEnter', 8, { enemyId: 2, visibleSeconds: 99 }), event('waveCleared', 10),
    ])).waves[0];
    expect(result.e4.count).toBe(2);
    expect(result.e4.visibleSecondsP50).toBe(2.5);
  });

  it('E5 忽略缺少 range/距离及 range=0 的 kill，按 distance/range 算 P50', () => {
    const result = computeExperienceMetrics(session([
      event('waveStart', 0), event('kill', 4, { distance: 50, range: 100 }), event('kill', 5, { distance: 75, range: 100 }), event('kill', 6, { distance: 1, range: 0 }), event('waveCleared', 20),
    ])).waves[0];
    expect(result.e5.p50).toBe(.625);
  });

  it('E6 包含恰好发生在 90.000s 的有效输入，排除其后输入', () => {
    const result = computeExperienceMetrics(session([event('waveStart', 0), event('waveCleared', 100)], [], [0, 89.999, 90, 90.001]));
    expect(result.first90.e6).toBe(3);
    expect(result.waves[0].e6).toBe(3);
  });

  it('E7 以末 15s 密度除以此前密度；不足 15s 或此前零密度返回 null', () => {
    const result = computeExperienceMetrics(session([
      event('waveStart', 0), event('spawn', 5), event('kill', 20), event('dropLanded', 25), event('waveCleared', 30),
    ])).waves[0];
    expect(result.e7).toBeCloseTo(1.5);
    expect(computeExperienceMetrics(session([event('waveStart', 0), event('waveCleared', 10)])).waves[0].e7).toBeNull();
  });

  it('前 90s 切片独立重算 E1–E4，不吸收 90s 后事件', () => {
    const events = [event('waveStart', 0), event('dangerEnter', 80, { visibleSeconds: 2 }), event('dangerEnter', 95), event('waveCleared', 100)];
    const result = computeExperienceMetrics(session(events, Array.from({ length: 21 }, (_, index) => index)));
    expect(result.first90.e4.count).toBe(1);
    expect(result.waves[0].e4.count).toBe(2);
    expect(result.first90.e1.p95).toBeLessThan(result.waves[0].e1.p95!);
  });
});
