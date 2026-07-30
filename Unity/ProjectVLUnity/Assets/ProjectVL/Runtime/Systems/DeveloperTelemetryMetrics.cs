using System;
using System.Collections.Generic;

namespace ProjectVL.Systems
{
    public class TelemetryPercentiles
    {
        public float? p50;
        public float? p95;
    }

    public sealed class TelemetryOpportunityMetric : TelemetryPercentiles
    {
        public int max;
    }

    public sealed class TelemetryDangerMetric
    {
        public int count;
        public float? visibleSecondsP50;
    }

    public sealed class TelemetryWaveMetrics
    {
        public int wave;
        public string stage;
        public float start;
        public float end;
        public float activeRegularSeconds;
        public float? ordinaryDropsShownPerMinute;
        public float? eligibleKillsPerMinute;
        public float? ordinaryPickupRate;
        public float? ordinaryExpiryRate;
        public int dropRejectedFullHand;
        public int validationRewardDrops;
        public int validationOrdinaryDrops;
        public TelemetryPercentiles e1 = new TelemetryPercentiles();
        public float? e2;
        public TelemetryOpportunityMetric e3 =
            new TelemetryOpportunityMetric();
        public TelemetryDangerMetric e4 = new TelemetryDangerMetric();
        public float? e5;
        public int e6;
        public float? e7;
    }

    public sealed class TelemetryFirst90Metrics
    {
        public TelemetryPercentiles e1 = new TelemetryPercentiles();
        public float? e2;
        public TelemetryOpportunityMetric e3 =
            new TelemetryOpportunityMetric();
        public TelemetryDangerMetric e4 = new TelemetryDangerMetric();
        public int e6;
    }

    public sealed class TelemetryExperienceMetrics
    {
        public List<TelemetryWaveMetrics> waves =
            new List<TelemetryWaveMetrics>();
        public TelemetryFirst90Metrics first90 =
            new TelemetryFirst90Metrics();
    }

    public static class DeveloperTelemetryMetrics
    {
        private static readonly HashSet<string> EventUniverse =
            new HashSet<string>
            {
                "spawn",
                "kill",
                "dropLanded",
                "pickup",
                "dangerEnter",
                "waveStart",
                "waveCleared",
                "perkPopup",
                "decision_offered",
                "decision_resolved",
                "intermission_ready",
                "wave_rewards_granted",
                "wave_base_reward_offered",
                "wave_base_reward_resolved",
                "god_offer",
                "god_selected",
                "run_roster_created",
                "active_pool_created",
                "card_shown_by_god",
                "card_collected_by_god",
                "evolution_branch_offered",
                "evolution_branch_selected"
            };

        private static readonly HashSet<string> OpportunityEvents =
            new HashSet<string>
            {
                "dropLanded",
                "perkPopup",
                "mergeOpportunity",
                "decision_offered",
                "god_offer"
            };

        public static TelemetryExperienceMetrics Compute(
            TelemetrySession session)
        {
            if (session == null)
                throw new ArgumentNullException(nameof(session));

            var result = new TelemetryExperienceMetrics();
            List<WaveBounds> bounds = WaveBoundsFor(session);
            foreach (WaveBounds bound in bounds)
            {
                result.waves.Add(ComputeWave(session, bound));
            }

            List<float> first90Samples = SampleValues(
                session,
                0f,
                90f);
            result.first90.e1.p50 = Percentile(first90Samples, 0.5f);
            result.first90.e1.p95 = Percentile(first90Samples, 0.95f);
            var first90Events = EventsBetween(
                session.events,
                0f,
                90f);
            var first90Gaps = new List<float>();
            foreach (WaveBounds bound in bounds)
            {
                float end = Math.Min(bound.end, 90f);
                float? gap = MaxEventGap(
                    EventsForWave(first90Events, bound.wave),
                    bound.start,
                    end);
                if (gap.HasValue)
                    first90Gaps.Add(gap.Value);
            }

            result.first90.e2 = first90Gaps.Count == 0
                ? (float?)null
                : Max(first90Gaps);
            result.first90.e3 = OpportunityMetric(
                first90Events,
                0f,
                90f,
                SampleTimes(session, 0f, 90f));
            result.first90.e4 = DangerMetric(first90Events, 0f, 90f);
            result.first90.e6 = CountInputs(session, 90f);
            return result;
        }

        public static float? Percentile(
            IList<float> values,
            float ratio)
        {
            if (values == null || values.Count == 0)
                return null;

            var sorted = new List<float>(values);
            sorted.Sort();
            if (sorted.Count == 1)
                return sorted[0];

            float bounded = Math.Max(0f, Math.Min(1f, ratio));
            float position = bounded * (sorted.Count - 1);
            int lower = (int)Math.Floor(position);
            int upper = Math.Min(lower + 1, sorted.Count - 1);
            float fraction = position - lower;
            return sorted[lower]
                + (sorted[upper] - sorted[lower]) * fraction;
        }

        private static TelemetryWaveMetrics ComputeWave(
            TelemetrySession session,
            WaveBounds bound)
        {
            List<TelemetryEventRecord> events = EventsForWave(
                EventsBetween(session.events, bound.start, bound.end),
                bound.wave);
            List<float> samples = SampleValues(
                session,
                bound.start,
                bound.end,
                bound.wave);
            TelemetryEventRecord startEvent = FindFirst(
                events,
                "waveStart");
            TelemetryEventRecord clearEvent = FindLast(
                events,
                "waveCleared");
            float activeSeconds = clearEvent == null
                ? 0f
                : clearEvent.activeRegularSeconds;
            int ordinaryShown = clearEvent != null
                && clearEvent.ordinaryDropsShown > 0
                    ? clearEvent.ordinaryDropsShown
                    : CountEvents(events, "dropLanded", "normalKill");
            int eligibleKills = clearEvent == null
                ? 0
                : clearEvent.eligibleKills;
            int ordinaryPickups =
                CountEvents(events, "pickup", "normalKill");
            int ordinaryExpired =
                CountEvents(events, "dropExpired", "normalKill");
            int outcomes = ordinaryPickups + ordinaryExpired;
            string stage = startEvent?.stage ?? clearEvent?.stage;
            var metric = new TelemetryWaveMetrics
            {
                wave = bound.wave,
                stage = stage,
                start = bound.start,
                end = bound.end,
                activeRegularSeconds = activeSeconds,
                ordinaryDropsShownPerMinute = activeSeconds > 0f
                    ? ordinaryShown / activeSeconds * 60f
                    : (float?)null,
                eligibleKillsPerMinute = activeSeconds > 0f
                    ? eligibleKills / activeSeconds * 60f
                    : (float?)null,
                ordinaryPickupRate = outcomes > 0
                    ? ordinaryPickups / (float)outcomes
                    : (float?)null,
                ordinaryExpiryRate = outcomes > 0
                    ? ordinaryExpired / (float)outcomes
                    : (float?)null,
                dropRejectedFullHand =
                    CountEvents(events, "dropRejectedFullHand"),
                validationRewardDrops =
                    CountEvents(events, "validationRewardLanded"),
                validationOrdinaryDrops = stage == "Validation"
                    || stage == "validation"
                        ? CountEvents(events, "dropLanded", "normalKill")
                        : 0,
                e2 = MaxEventGap(events, bound.start, bound.end),
                e3 = OpportunityMetric(
                    events,
                    bound.start,
                    bound.end,
                    SampleTimes(
                        session,
                        bound.start,
                        bound.end,
                        bound.wave)),
                e4 = DangerMetric(events, bound.start, bound.end),
                e5 = KillDistanceMetric(events),
                e6 = CountInputs(session, 90f),
                e7 = SprintRatio(events, bound.start, bound.end)
            };
            metric.e1.p50 = Percentile(samples, 0.5f);
            metric.e1.p95 = Percentile(samples, 0.95f);
            return metric;
        }

        private static List<WaveBounds> WaveBoundsFor(
            TelemetrySession session)
        {
            var starts = new List<TelemetryEventRecord>();
            float lastAt = 0f;
            foreach (TelemetryEventRecord item in session.events)
            {
                lastAt = Math.Max(lastAt, item.at);
                if (item.type == "waveStart")
                    starts.Add(item);
            }

            foreach (TelemetrySampleRecord item in session.samples)
                lastAt = Math.Max(lastAt, item.at);
            starts.Sort((left, right) => left.at.CompareTo(right.at));
            var result = new List<WaveBounds>();
            for (int index = 0; index < starts.Count; index++)
            {
                TelemetryEventRecord start = starts[index];
                TelemetryEventRecord clear = null;
                foreach (TelemetryEventRecord item in session.events)
                {
                    if (item.type == "waveCleared"
                        && item.wave == start.wave
                        && item.at >= start.at
                        && (clear == null || item.at < clear.at))
                        clear = item;
                }

                result.Add(new WaveBounds
                {
                    wave = start.wave,
                    start = start.at,
                    end = clear?.at
                        ?? (index + 1 < starts.Count
                            ? starts[index + 1].at
                            : lastAt)
                });
            }

            return result;
        }

        private static float? MaxEventGap(
            IList<TelemetryEventRecord> events,
            float start,
            float end)
        {
            var times = new List<float>();
            foreach (TelemetryEventRecord item in events)
            {
                if (EventUniverse.Contains(item.type)
                    && item.at >= start
                    && item.at <= end)
                    times.Add(item.at);
            }

            if (times.Count == 0)
                return null;
            times.Sort();
            if (times[0] > start)
                times.Insert(0, start);
            float max = 0f;
            for (int index = 1; index < times.Count; index++)
                max = Math.Max(max, times[index] - times[index - 1]);
            return max;
        }

        private static TelemetryOpportunityMetric OpportunityMetric(
            IList<TelemetryEventRecord> events,
            float start,
            float end,
            IList<float> ticks)
        {
            var times = new List<float>();
            foreach (TelemetryEventRecord item in events)
            {
                if (OpportunityEvents.Contains(item.type)
                    && item.at >= start
                    && item.at <= end)
                    times.Add(item.at);
            }

            var points = new List<float>();
            if (ticks != null)
            {
                foreach (float tick in ticks)
                {
                    if (tick >= start && tick <= end)
                        points.Add(tick);
                }
            }

            if (points.Count == 0)
            {
                points.AddRange(times);
                points.Add(start);
                points.Add(end);
            }

            var counts = new List<float>();
            int maximum = 0;
            foreach (float point in points)
            {
                int count = 0;
                foreach (float time in times)
                {
                    if (time > point - 10f && time <= point)
                        count++;
                }

                maximum = Math.Max(maximum, count);
                counts.Add(count);
            }

            return new TelemetryOpportunityMetric
            {
                p50 = Percentile(counts, 0.5f),
                p95 = Percentile(counts, 0.95f),
                max = maximum
            };
        }

        private static TelemetryDangerMetric DangerMetric(
            IList<TelemetryEventRecord> events,
            float start,
            float end)
        {
            var durations = new List<float>();
            int count = 0;
            foreach (TelemetryEventRecord item in events)
            {
                if (item.type != "dangerEnter"
                    || item.at < start
                    || item.at > end)
                    continue;
                count++;
                durations.Add(Math.Max(
                    0f,
                    Math.Min(
                        item.visibleSeconds > 0f
                            ? item.visibleSeconds
                            : end - item.at,
                        end - item.at)));
            }

            return new TelemetryDangerMetric
            {
                count = count,
                visibleSecondsP50 = Percentile(durations, 0.5f)
            };
        }

        private static float? KillDistanceMetric(
            IList<TelemetryEventRecord> events)
        {
            var ratios = new List<float>();
            foreach (TelemetryEventRecord item in events)
            {
                if (item.type == "kill"
                    && item.distance >= 0f
                    && item.range > 0f)
                    ratios.Add(item.distance / item.range);
            }

            return Percentile(ratios, 0.5f);
        }

        private static float? SprintRatio(
            IList<TelemetryEventRecord> events,
            float start,
            float end)
        {
            float duration = end - start;
            float restDuration = duration - 15f;
            if (duration <= 0f || restDuration <= 0f)
                return null;

            float sprintStart = end - 15f;
            int tail = 0;
            int rest = 0;
            foreach (TelemetryEventRecord item in events)
            {
                if (!EventUniverse.Contains(item.type)
                    || item.at < start
                    || item.at > end)
                    continue;
                if (item.at > sprintStart)
                    tail++;
                else
                    rest++;
            }

            float restDensity = rest / restDuration;
            return restDensity > 0f
                ? (tail / 15f) / restDensity
                : (float?)null;
        }

        private static List<TelemetryEventRecord> EventsBetween(
            IList<TelemetryEventRecord> events,
            float start,
            float end)
        {
            var result = new List<TelemetryEventRecord>();
            foreach (TelemetryEventRecord item in events)
            {
                if (item.at >= start && item.at <= end)
                    result.Add(item);
            }

            return result;
        }

        private static List<TelemetryEventRecord> EventsForWave(
            IList<TelemetryEventRecord> events,
            int wave)
        {
            var result = new List<TelemetryEventRecord>();
            foreach (TelemetryEventRecord item in events)
            {
                if (item.wave == wave)
                    result.Add(item);
            }

            return result;
        }

        private static List<float> SampleValues(
            TelemetrySession session,
            float start,
            float end,
            int? wave = null)
        {
            var result = new List<float>();
            foreach (TelemetrySampleRecord item in session.samples)
            {
                if (item.at >= start
                    && item.at <= end
                    && (!wave.HasValue || item.wave == wave.Value))
                    result.Add(item.enemies);
            }

            return result;
        }

        private static List<float> SampleTimes(
            TelemetrySession session,
            float start,
            float end,
            int? wave = null)
        {
            var result = new List<float>();
            foreach (TelemetrySampleRecord item in session.samples)
            {
                if (item.at >= start
                    && item.at <= end
                    && (!wave.HasValue || item.wave == wave.Value))
                    result.Add(item.at);
            }

            return result;
        }

        private static int CountInputs(
            TelemetrySession session,
            float end)
        {
            int count = 0;
            foreach (TelemetryInputRecord input in session.inputs)
            {
                if (input.at <= end)
                    count++;
            }

            return count;
        }

        private static int CountEvents(
            IList<TelemetryEventRecord> events,
            string type,
            string source = null)
        {
            int count = 0;
            foreach (TelemetryEventRecord item in events)
            {
                if (item.type == type
                    && (source == null || item.source == source))
                    count++;
            }

            return count;
        }

        private static TelemetryEventRecord FindFirst(
            IList<TelemetryEventRecord> events,
            string type)
        {
            TelemetryEventRecord result = null;
            foreach (TelemetryEventRecord item in events)
            {
                if (item.type == type
                    && (result == null || item.at < result.at))
                    result = item;
            }

            return result;
        }

        private static TelemetryEventRecord FindLast(
            IList<TelemetryEventRecord> events,
            string type)
        {
            TelemetryEventRecord result = null;
            foreach (TelemetryEventRecord item in events)
            {
                if (item.type == type
                    && (result == null || item.at > result.at))
                    result = item;
            }

            return result;
        }

        private static float Max(IList<float> values)
        {
            float result = values[0];
            for (int index = 1; index < values.Count; index++)
                result = Math.Max(result, values[index]);
            return result;
        }

        private sealed class WaveBounds
        {
            public int wave;
            public float start;
            public float end;
        }
    }
}
