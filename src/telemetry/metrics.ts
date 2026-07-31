import type { TelemetryEvent, TelemetrySession } from './types';
import type { RunStage } from '../config/types';

export const EVENT_UNIVERSE = new Set<TelemetryEvent['type']>([
  'spawn', 'kill', 'dropLanded', 'pickup', 'dangerEnter', 'waveStart', 'waveCleared', 'perkPopup',
  'decision_offered', 'decision_resolved', 'intermission_ready', 'wave_rewards_granted',
  'wave_base_reward_offered', 'wave_base_reward_resolved',
  'god_offer', 'god_selected', 'run_roster_created', 'active_pool_created',
  'card_shown_by_god', 'card_collected_by_god',
  'evolution_branch_offered', 'evolution_branch_selected',
]);
export const OPPORTUNITY_EVENTS = new Set<TelemetryEvent['type']>([
  'dropLanded', 'perkPopup', 'mergeOpportunity', 'decision_offered', 'god_offer',
]);

export interface WaveMetrics {
  wave: number;
  stage: RunStage | null;
  start: number;
  end: number;
  activeRegularSeconds: number;
  ordinaryDropsShownPerMinute: number | null;
  eligibleKillsPerMinute: number | null;
  ordinaryPickupRate: number | null;
  ordinaryExpiryRate: number | null;
  dropRejectedFullHand: number;
  validationRewardDrops: number;
  validationOrdinaryDrops: number;
  killsPerSecond: number | null;
  manualPickups: number;
  decisionPopups: number;
  rewardActivations: number;
  buildAtStart: { maturity: number | null; highestStar: number | null; equippedCount: number | null };
  e1: { p50: number | null; p95: number | null };
  e2: number | null;
  e3: { p50: number | null; p95: number | null; max: number };
  e4: { count: number; visibleSecondsP50: number | null };
  e5: { p50: number | null };
  e6: number;
  e7: number | null;
}

export interface ExperienceMetrics {
  waves: WaveMetrics[];
  first90: {
    e1: { p50: number | null; p95: number | null };
    e2: number | null;
    e3: { p50: number | null; p95: number | null; max: number };
    e4: { count: number; visibleSecondsP50: number | null };
    e6: number;
  };
}

export function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, ratio)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

function opportunityCounts(events: TelemetryEvent[], start: number, end: number, ticks?: number[]): number[] {
  const times = events.filter(event => OPPORTUNITY_EVENTS.has(event.type) && event.at >= start && event.at <= end).map(event => event.at);
  const points = ticks?.filter(at => at >= start && at <= end) ?? [...times, start, end];
  if (!points.length) return [0];
  return points.map(at => times.filter(time => time > at - 10 && time <= at).length);
}

function opportunityMetric(events: TelemetryEvent[], start: number, end: number, ticks?: number[]) {
  const counts = opportunityCounts(events, start, end, ticks);
  return { p50: percentile(counts, 0.5), p95: percentile(counts, 0.95), max: Math.max(0, ...counts) };
}

function maxEventGap(events: TelemetryEvent[], start: number, end: number): number | null {
  const times = events.filter(event => EVENT_UNIVERSE.has(event.type) && event.at >= start && event.at <= end)
    .map(event => event.at).sort((a, b) => a - b);
  if (!times.length) return null;
  if (times[0] > start) times.unshift(start);
  let max = 0;
  for (let index = 1; index < times.length; index++) max = Math.max(max, times[index] - times[index - 1]);
  return max;
}

function dangerMetric(events: TelemetryEvent[], start: number, end: number) {
  const entries = events.filter(event => event.type === 'dangerEnter' && event.at >= start && event.at <= end);
  return {
    count: entries.length,
    visibleSecondsP50: percentile(entries.map(event => Math.max(0, Math.min(event.visibleSeconds ?? end - event.at, end - event.at))), 0.5),
  };
}

function waveBounds(session: TelemetrySession): { wave: number; start: number; end: number }[] {
  const starts = session.events.filter(event => event.type === 'waveStart').sort((a, b) => a.at - b.at);
  const lastAt = Math.max(0, ...session.events.map(event => event.at), ...session.samples.map(sample => sample.at));
  return starts.map((event, index) => ({
    wave: event.wave,
    start: event.at,
    end: session.events.find(candidate => candidate.type === 'waveCleared' && candidate.wave === event.wave && candidate.at >= event.at)?.at
      ?? starts[index + 1]?.at
      ?? lastAt,
  }));
}

function sprintRatio(events: TelemetryEvent[], start: number, end: number): number | null {
  const duration = end - start;
  const restDuration = duration - 15;
  if (duration <= 0 || restDuration <= 0) return null;
  const universe = events.filter(event => EVENT_UNIVERSE.has(event.type) && event.at >= start && event.at <= end);
  const sprintStart = end - 15;
  const tailCount = universe.filter(event => event.at > sprintStart).length;
  const restCount = universe.filter(event => event.at <= sprintStart).length;
  const restDensity = restCount / restDuration;
  return restDensity > 0 ? (tailCount / 15) / restDensity : null;
}

export function computeExperienceMetrics(session: TelemetrySession): ExperienceMetrics {
  const waves = waveBounds(session).map(({ wave, start, end }): WaveMetrics => {
    const samples = session.samples.filter(sample => sample.wave === wave && sample.at >= start && sample.at <= end);
    const sampleValues = samples.map(sample => sample.enemies);
    const kills = session.events.filter(event => event.type === 'kill' && event.wave === wave && event.at >= start && event.at <= end);
    const waveEvents = session.events.filter(event => event.wave === wave && event.at >= start && event.at <= end);
    const startEvent = waveEvents.find(event => event.type === 'waveStart');
    const clearEvent = [...waveEvents].reverse().find(event => event.type === 'waveCleared');
    const activeRegularSeconds = clearEvent?.activeRegularSeconds ?? 0;
    const ordinaryShown = clearEvent?.ordinaryDropsShown
      ?? waveEvents.filter(event => event.type === 'dropLanded' && event.source === 'normalKill').length;
    const eligibleKills = clearEvent?.eligibleKills ?? 0;
    const ordinaryPickups = waveEvents.filter(event => event.type === 'pickup' && event.source === 'normalKill').length;
    const ordinaryExpired = waveEvents.filter(event => event.type === 'dropExpired' && event.source === 'normalKill').length;
    const ordinaryOutcomes = ordinaryPickups + ordinaryExpired;
    return {
      wave, stage: startEvent?.stage ?? clearEvent?.stage ?? null, start, end,
      activeRegularSeconds,
      ordinaryDropsShownPerMinute: activeRegularSeconds > 0 ? ordinaryShown / activeRegularSeconds * 60 : null,
      eligibleKillsPerMinute: activeRegularSeconds > 0 ? eligibleKills / activeRegularSeconds * 60 : null,
      ordinaryPickupRate: ordinaryOutcomes > 0 ? ordinaryPickups / ordinaryOutcomes : null,
      ordinaryExpiryRate: ordinaryOutcomes > 0 ? ordinaryExpired / ordinaryOutcomes : null,
      dropRejectedFullHand: waveEvents.filter(event => event.type === 'dropRejectedFullHand').length,
      validationRewardDrops: waveEvents.filter(event => event.type === 'validationRewardLanded').length,
      validationOrdinaryDrops: (startEvent?.stage ?? clearEvent?.stage) === 'validation'
        ? waveEvents.filter(event => event.type === 'dropLanded' && event.source === 'normalKill').length
        : 0,
      killsPerSecond: end > start ? kills.length / (end - start) : null,
      manualPickups: waveEvents.filter(event => event.type === 'pickup' || event.type === 'validationRewardPickup').length,
      decisionPopups: waveEvents.filter(event => event.type === 'decision_offered' || event.type === 'perkPopup').length,
      rewardActivations: waveEvents.filter(event => event.type === 'reward_triggered').length,
      buildAtStart: {
        maturity: startEvent?.maturity ?? null,
        highestStar: startEvent?.highestStar ?? null,
        equippedCount: startEvent?.equippedCount ?? null,
      },
      e1: { p50: percentile(sampleValues, 0.5), p95: percentile(sampleValues, 0.95) },
      e2: maxEventGap(session.events.filter(event => event.wave === wave), start, end),
      e3: opportunityMetric(session.events.filter(event => event.wave === wave), start, end, samples.map(sample => sample.at)),
      e4: dangerMetric(session.events.filter(event => event.wave === wave), start, end),
      e5: { p50: percentile(kills.flatMap(event => event.distance != null && event.range != null && event.range > 0 ? [event.distance / event.range] : []), 0.5) },
      e6: session.inputs.filter(input => input.at <= 90).length,
      e7: sprintRatio(session.events.filter(event => event.wave === wave), start, end),
    };
  });

  const first90Samples = session.samples.filter(sample => sample.at <= 90);
  const first90Events = session.events.filter(event => event.at <= 90);
  const gapByWave = waveBounds(session).map(({ wave, start, end }) => maxEventGap(first90Events.filter(event => event.wave === wave), start, Math.min(end, 90)))
    .filter((value): value is number => value != null);
  return {
    waves,
    first90: {
      e1: { p50: percentile(first90Samples.map(sample => sample.enemies), 0.5), p95: percentile(first90Samples.map(sample => sample.enemies), 0.95) },
      e2: gapByWave.length ? Math.max(...gapByWave) : null,
      e3: opportunityMetric(first90Events, 0, 90, first90Samples.map(sample => sample.at)),
      e4: dangerMetric(first90Events, 0, 90),
      e6: session.inputs.filter(input => input.at <= 90).length,
    },
  };
}
