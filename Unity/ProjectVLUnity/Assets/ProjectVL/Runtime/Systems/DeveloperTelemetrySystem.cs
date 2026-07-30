using System;
using System.Collections.Generic;
using System.IO;
using ProjectVL.Config;
using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Systems
{
    [Serializable]
    public sealed class TelemetryConfigSnapshot
    {
        public CombatConfig combat;
        public EnemiesConfig enemies;
        public WavesConfig waves;
        public EconomyConfig economy;
        public BountyConfig bounty;
    }

    [Serializable]
    public sealed class TelemetryMeta
    {
        public string startedAt;
        public string exportedAt;
        public int seed;
        public string build;
        public TelemetryConfigSnapshot config;
    }

    [Serializable]
    public sealed class TelemetryEventRecord
    {
        public string type;
        public float at;
        public int wave;
        public int entityId;
        public float value;
        public string detail;
        public float x;
        public float y;
        public float distance = -1f;
        public float range;
        public float visibleSeconds;
        public string source;
        public string stage;
        public float activeRegularSeconds;
        public int ordinaryDropsShown;
        public int eligibleKills;
    }

    [Serializable]
    public sealed class TelemetrySampleRecord
    {
        public float at;
        public int wave;
        public int enemies;
        public int spawnLeft;
        public int drops;
        public float hp;
        public float maxHp;
    }

    [Serializable]
    public sealed class TelemetryInputRecord
    {
        public string type;
        public float at;
        public int wave;
        public string detail;
    }

    [Serializable]
    public sealed class TelemetrySession
    {
        public TelemetryMeta meta = new TelemetryMeta();
        public List<TelemetryEventRecord> events =
            new List<TelemetryEventRecord>();
        public List<TelemetrySampleRecord> samples =
            new List<TelemetrySampleRecord>();
        public List<TelemetryInputRecord> inputs =
            new List<TelemetryInputRecord>();
    }

    public sealed class DeveloperTelemetrySystem
    {
        private const float SampleInterval = 0.25f;
        private readonly TelemetrySession _session = new TelemetrySession();
        private readonly HashSet<int> _enemyIds = new HashSet<int>();
        private readonly HashSet<int> _dropIds = new HashSet<int>();
        private readonly HashSet<int> _offerIds = new HashSet<int>();
        private readonly HashSet<int> _encounterIds = new HashSet<int>();
        private readonly HashSet<int> _dangerEnemyIds = new HashSet<int>();
        private readonly CombatConfig _combat;
        private int _lastWave;
        private int _lastKills;
        private WavePhase _lastWavePhase;
        private float _nextSampleAt;
        private float _lastEventAt;
        private float _currentTime;
        private int _dangerEntriesThisWave;

        public TelemetrySession Session => _session;
        public float IdleSeconds => Math.Max(0f, _currentTime - _lastEventAt);
        public int DangerEntriesThisWave => _dangerEntriesThisWave;
        public int First90SecondInputs =>
            _session.inputs.FindAll(item => item.at <= 90f).Count;
        public int RecentOpportunities =>
            _session.events.FindAll(item =>
                item.at >= _currentTime - 10f
                && (item.type == "dropLanded"
                    || item.type == "bountyOffer")).Count;

        public DeveloperTelemetrySystem(
            GameState state,
            int seed,
            string build,
            CombatConfig combat,
            EnemiesConfig enemies,
            WavesConfig waves,
            EconomyConfig economy,
            BountyConfig bounty)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            _combat = combat ?? throw new ArgumentNullException(nameof(combat));
            _lastWave = state.Wave;
            _lastKills = state.Kills;
            _lastWavePhase = state.WavePhase;
            _session.meta.startedAt = DateTime.UtcNow.ToString("O");
            _session.meta.seed = seed;
            _session.meta.build = build ?? "unknown";
            _session.meta.config = new TelemetryConfigSnapshot
            {
                combat = combat,
                enemies = enemies,
                waves = waves,
                economy = economy,
                bounty = bounty
            };
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state == null)
            {
                return;
            }

            _currentTime = state.Time;
            if (state.Wave != _lastWave)
            {
                _dangerEnemyIds.Clear();
                _dangerEntriesThisWave = 0;
                AddEvent(state, "waveStart", detail: state.WavePhase.ToString());
                _lastWave = state.Wave;
            }

            if (state.WavePhase != _lastWavePhase)
            {
                AddEvent(state, "wavePhase", detail: state.WavePhase.ToString());
                if (state.WavePhase == WavePhase.BossReward
                    || state.WavePhase == WavePhase.Intermission)
                {
                    AddEvent(state, "waveCleared");
                }

                _lastWavePhase = state.WavePhase;
            }

            if (state.Kills > _lastKills)
            {
                AddEvent(state, "kill", value: state.Kills - _lastKills);
                _lastKills = state.Kills;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                if (_enemyIds.Add(enemy.Id))
                {
                    AddEvent(
                        state,
                        enemy.Kind == EnemyKind.Boss
                            ? "waveBossSpawned"
                            : "spawn",
                        enemy.Id,
                        enemy.Kind.ToString(),
                        enemy.Position.X,
                        enemy.Position.Y);
                }

                float dangerDistance =
                    _combat.breakthroughDist + _combat.dangerZoneWidth;
                if (!_dangerEnemyIds.Contains(enemy.Id)
                    && Float2.Distance(enemy.Position, new Float2(
                        _combat.turret.x,
                        _combat.turret.y)) < dangerDistance)
                {
                    _dangerEnemyIds.Add(enemy.Id);
                    _dangerEntriesThisWave++;
                    AddEvent(
                        state,
                        "dangerEnter",
                        enemy.Id,
                        enemy.Kind.ToString(),
                        enemy.Position.X,
                        enemy.Position.Y);
                }
            }

            foreach (GroundDropState drop in state.GroundDrops)
            {
                if (_dropIds.Add(drop.Id))
                {
                    AddEvent(
                        state,
                        "dropLanded",
                        drop.Id,
                        drop.CardType + ":" + drop.Star,
                        drop.Position.X,
                        drop.Position.Y);
                }
            }

            foreach (BountyOfferState offer in state.BountyOffers)
            {
                if (_offerIds.Add(offer.Id))
                {
                    AddEvent(
                        state,
                        "bountyOffer",
                        offer.Id,
                        offer.RewardCardType,
                        offer.Position.X,
                        offer.Position.Y);
                }
            }

            foreach (BountyEncounterState encounter in state.BountyEncounters)
            {
                if (_encounterIds.Add(encounter.Id))
                {
                    AddEvent(
                        state,
                        "bountyAccepted",
                        encounter.Id,
                        encounter.RewardCardType);
                }
            }

            if (state.Time + 0.0001f >= _nextSampleAt)
            {
                _session.samples.Add(new TelemetrySampleRecord
                {
                    at = state.Time,
                    wave = state.Wave,
                    enemies = state.Enemies.Count,
                    spawnLeft = state.SpawnLeft,
                    drops = state.GroundDrops.Count,
                    hp = state.Hp,
                    maxHp = state.MaxHp
                });
                _nextSampleAt = state.Time + SampleInterval;
            }
        }

        public void RecordInput(GameState state, string type, string detail = null)
        {
            if (state == null || string.IsNullOrEmpty(type))
            {
                return;
            }

            _session.inputs.Add(new TelemetryInputRecord
            {
                type = type,
                at = state.Time,
                wave = state.Wave,
                detail = detail
            });
        }

        public void GetEnemyPercentiles(
            int wave,
            out float p50,
            out float p95)
        {
            var values = new List<int>();
            foreach (TelemetrySampleRecord sample in _session.samples)
            {
                if (sample.wave == wave)
                {
                    values.Add(sample.enemies);
                }
            }

            values.Sort();
            p50 = Percentile(values, 0.5f);
            p95 = Percentile(values, 0.95f);
        }

        public string ToJson(bool prettyPrint = true)
        {
            _session.meta.exportedAt = DateTime.UtcNow.ToString("O");
            return JsonUtility.ToJson(_session, prettyPrint);
        }

        public string Export(string directory)
        {
            if (string.IsNullOrEmpty(directory))
            {
                throw new ArgumentException(
                    "A telemetry directory is required.",
                    nameof(directory));
            }

            Directory.CreateDirectory(directory);
            string timestamp =
                DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss.fffZ");
            string filename =
                $"session_{timestamp}_{_session.meta.seed}.json";
            string path = Path.Combine(directory, filename);
            File.WriteAllText(path, ToJson(true) + Environment.NewLine);
            return path;
        }

        private void AddEvent(
            GameState state,
            string type,
            int entityId = 0,
            string detail = null,
            float x = 0f,
            float y = 0f,
            float value = 0f)
        {
            _session.events.Add(new TelemetryEventRecord
            {
                type = type,
                at = state.Time,
                wave = state.Wave,
                entityId = entityId,
                value = value,
                detail = detail,
                x = x,
                y = y
            });
            _lastEventAt = state.Time;
        }

        private static float Percentile(List<int> values, float ratio)
        {
            if (values.Count == 0)
            {
                return 0f;
            }

            float index = (values.Count - 1) * ratio;
            int lower = (int)Math.Floor(index);
            int upper = (int)Math.Ceiling(index);
            if (lower == upper)
            {
                return values[lower];
            }

            float weight = index - lower;
            return values[lower] * (1f - weight) + values[upper] * weight;
        }
    }
}
