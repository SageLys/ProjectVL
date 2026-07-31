using System;
using System.Collections.Generic;
using System.IO;
using ProjectVL.Config;
using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Systems
{
    public static class TelemetryEventContract
    {
        public static readonly string[] Types =
        {
            "spawn",
            "kill",
            "dropLanded",
            "pickup",
            "dropExpired",
            "dropRejectedFullHand",
            "validationRewardLanded",
            "validationRewardPickup",
            "dangerEnter",
            "waveStart",
            "waveCleared",
            "waveBossSpawned",
            "waveBossKilled",
            "bossRewardGranted",
            "perkPopup",
            "mergeOpportunity",
            "bountyOffer",
            "bountyOfferExpired",
            "bountyAccepted",
            "bountyMemberSpawned",
            "bountyCompleted",
            "bountyFailed",
            "bountyRewardLanded",
            "bountyRewardPickup",
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
            "relic_offered",
            "relic_selected",
            "evolution_branch_offered",
            "evolution_branch_selected",
            "recipe_available",
            "recipe_completed",
            "affix_rolled",
            "rewardPointsGained",
            "rewardTriggered",
            "rewardConfirmed"
        };

        private static readonly HashSet<string> TypeSet =
            new HashSet<string>(Types);

        public static bool Contains(string type)
        {
            return !string.IsNullOrEmpty(type) && TypeSet.Contains(type);
        }
    }

    [Serializable]
    public sealed class TelemetryConfigSnapshot
    {
        public CombatConfig combat;
        public EnemiesConfig enemies;
        public WavesConfig waves;
        public EconomyConfig economy;
        public BountyConfig bounty;
        public ProgressionConfig progression;
        public DifficultyConfig difficulty;
        public GodsConfig gods;
        public CardsConfig cards;
        public CardAffixesConfig cardAffixes;
        public RelicsConfig relics;
        public EvolutionRecipesConfig evolutionRecipes;
        public EvolutionTextConfig evolutionText;
        public WaveRewardsConfig waveRewards;
        public RewardMeterConfig rewardMeter;
        public SettlementConfig settlement;
        public RecipeProductEffectsConfig recipeProductEffects;
        public EvolutionBranchEffectsConfig evolutionBranchEffects;
    }

    [Serializable]
    public sealed class TelemetryDifficultyMeta
    {
        public string id;
        public float hpMultiplierAtWave1;
        public float damageMultiplierAtWave1;
    }

    [Serializable]
    public sealed class TelemetryMeta
    {
        public string startedAt;
        public string exportedAt;
        public int seed;
        public string build;
        public string presetName;
        public string gitCommit;
        public TelemetryDifficultyMeta difficulty;
        public TelemetryConfigSnapshot config;
    }

    [Serializable]
    public sealed class TelemetryWaveRewardRecord
    {
        public string id;
        public string stat;
        public float add;
    }

    [Serializable]
    public sealed class TelemetryEventRecord
    {
        public string type;
        public float at;
        public int wave;
        public int entityId;
        public int enemyId;
        public int dropId;
        public int offerId;
        public int encounterId;
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
        public string cardType;
        public string rewardCardType;
        public int rewardCardStar;
        public int wildcardStar;
        public int wildcardCount;
        public bool guaranteed;
        public int memberCount;
        public float decisionSeconds;
        public float clearSeconds;
        public float hpAtAccept;
        public float hpAtComplete;
        public string lane;
        public bool laneMatch;
        public float difficultyHpMultiplier;
        public float difficultyDamageMultiplier;
        public int star;
        public bool secure;
        public string rewardKind;
        public string typePolicy;
        public string firstOperation;
        public float firstOperationSeconds;
        public bool reached5BeforeFinalBoss;
        public bool reached6BeforeFinalBoss;
        public float maturity;
        public int highestStar;
        public int equippedCount;
        public string decisionKind;
        public string choice;
        public bool automatic;
        public TelemetryWaveRewardRecord[] waveRewards;
        public string waveRewardStat;
        public float waveRewardAdd;
        public string godId;
        public string focusGod;
        public string godRole;
        public string[] candidates;
        public string[] cardTypes;
        public string relicId;
        public int relicIndex;
        public string rarity;
        public int checkpointStar;
        public string optionId;
        public int provisionalCardId;
        public string recipeId;
        public string[] recipeIds;
        public int outputStar;
        public string affixStat;
        public float affixValue;
        public float consumableDuration;
        public string rewardId;
        public int activationIndex;
        public float rewardPoints;
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

    public sealed class DeveloperTelemetrySystem : IDisposable
    {
        private const float SampleInterval = 0.25f;
        private readonly TelemetrySession _session = new TelemetrySession();
        private readonly HashSet<int> _enemyIds = new HashSet<int>();
        private readonly HashSet<int> _dropIds = new HashSet<int>();
        private readonly HashSet<int> _offerIds = new HashSet<int>();
        private readonly HashSet<int> _encounterIds = new HashSet<int>();
        private readonly HashSet<int> _dangerEnemyIds = new HashSet<int>();
        private readonly Dictionary<int, TelemetryEventRecord> _dangerEntries =
            new Dictionary<int, TelemetryEventRecord>();
        private readonly CombatConfig _combat;
        private readonly GameState _state;
        private readonly DifficultySystem _difficultySystem;
        private readonly Func<string> _presetName;
        private readonly string _autoExportDirectory;
        private readonly string _filename;
        private int _lastWave;
        private int _lastKills;
        private WavePhase _lastWavePhase;
        private float _nextSampleAt;
        private float _lastEventAt;
        private float _currentTime;
        private int _dangerEntriesThisWave;
        private bool _autoClosed;
        private bool _disposed;

        public TelemetrySession Session => _session;
        public string LastExportPath { get; private set; }
        public float IdleSeconds => Math.Max(0f, _currentTime - _lastEventAt);
        public int DangerEntriesThisWave => _dangerEntriesThisWave;
        public int First90SecondInputs =>
            _session.inputs.FindAll(item => item.at <= 90f).Count;
        public int RecentOpportunities =>
            _session.events.FindAll(item =>
                item.at >= _currentTime - 10f
                && (item.type == "dropLanded"
                    || item.type == "perkPopup"
                    || item.type == "mergeOpportunity"
                    || item.type == "decision_offered"
                    || item.type == "god_offer")).Count;

        public DeveloperTelemetrySystem(
            GameState state,
            int seed,
            string build,
            CombatConfig combat,
            EnemiesConfig enemies,
            WavesConfig waves,
            EconomyConfig economy,
            BountyConfig bounty,
            ProgressionConfig progression = null,
            DifficultyConfig difficulty = null,
            GodsConfig gods = null,
            CardsConfig cards = null,
            CardAffixesConfig cardAffixes = null,
            RelicsConfig relics = null,
            EvolutionRecipesConfig evolutionRecipes = null,
            EvolutionTextConfig evolutionText = null,
            WaveRewardsConfig waveRewards = null,
            Func<string> presetName = null,
            string gitCommit = null,
            string autoExportDirectory = null,
            RewardMeterConfig rewardMeter = null,
            SettlementConfig settlement = null,
            RecipeProductEffectsConfig recipeProductEffects = null,
            EvolutionBranchEffectsConfig evolutionBranchEffects = null)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            _state = state;
            _combat = combat ?? throw new ArgumentNullException(nameof(combat));
            _difficultySystem = difficulty == null
                ? null
                : new DifficultySystem(difficulty, waves.totalWaves);
            _presetName = presetName;
            _autoExportDirectory = autoExportDirectory;
            _lastWave = state.Wave;
            _lastKills = state.Kills;
            _lastWavePhase = state.WavePhase;
            _session.meta.startedAt = DateTime.UtcNow.ToString("O");
            _session.meta.seed = seed;
            _session.meta.build = build ?? "unknown";
            _session.meta.gitCommit =
                string.IsNullOrWhiteSpace(gitCommit)
                    ? ResolveGitCommit()
                    : gitCommit;
            _filename =
                $"session_{DateTime.UtcNow:yyyy-MM-ddTHH-mm-ss.fffZ}_{seed}.json";
            _session.meta.config = new TelemetryConfigSnapshot
            {
                combat = combat,
                enemies = enemies,
                waves = waves,
                economy = economy,
                bounty = bounty,
                progression = progression,
                difficulty = difficulty,
                gods = gods,
                cards = cards,
                cardAffixes = cardAffixes,
                relics = relics,
                evolutionRecipes = evolutionRecipes,
                evolutionText = evolutionText,
                waveRewards = waveRewards,
                rewardMeter = rewardMeter,
                settlement = settlement,
                recipeProductEffects = recipeProductEffects,
                evolutionBranchEffects = evolutionBranchEffects
            };
            _state.TelemetryEvent += RecordCoreEvent;
            RefreshMetadata();
        }

        public void Step(GameState state, float deltaTime)
        {
            if (_disposed || state == null)
            {
                return;
            }

            _currentTime = state.Time;
            if (state.Wave != _lastWave)
            {
                _dangerEnemyIds.Clear();
                _dangerEntries.Clear();
                _dangerEntriesThisWave = 0;
                AddEvent(state, "waveStart", detail: state.WavePhase.ToString());
                _lastWave = state.Wave;
            }

            if (state.WavePhase != _lastWavePhase)
            {
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
                    _dangerEntries[enemy.Id] = AddEvent(
                        state,
                        "dangerEnter",
                        enemy.Id,
                        enemy.Kind.ToString(),
                        enemy.Position.X,
                        enemy.Position.Y);
                }
            }

            foreach (KeyValuePair<int, TelemetryEventRecord> entry
                in _dangerEntries)
            {
                if (entry.Value.visibleSeconds <= 0f
                    && !state.Enemies.Exists(
                        enemy => enemy.Id == entry.Key))
                {
                    entry.Value.visibleSeconds = Math.Max(
                        0f,
                        state.Time - entry.Value.at);
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

            if (!_autoClosed
                && state.Mode == GameMode.Ended
                && !string.IsNullOrEmpty(_autoExportDirectory))
            {
                Export(_autoExportDirectory);
                _autoClosed = true;
            }
        }

        public void RecordInput(GameState state, string type, string detail = null)
        {
            if (_disposed || state == null || string.IsNullOrEmpty(type))
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
            RefreshMetadata();
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
            if (string.IsNullOrEmpty(LastExportPath))
                LastExportPath = Path.Combine(directory, _filename);
            File.WriteAllText(
                LastExportPath,
                ToJson(true) + Environment.NewLine);
            return LastExportPath;
        }

        public void Dispose()
        {
            if (_disposed)
                return;

            _state.TelemetryEvent -= RecordCoreEvent;
            _disposed = true;
        }

        private void RefreshMetadata()
        {
            _session.meta.presetName = _presetName?.Invoke() ?? "Default";
            if (_difficultySystem == null)
                return;

            DifficultyMultipliers multipliers = _difficultySystem.Get(
                _state.Difficulty,
                EnemyKind.Normal,
                1);
            _session.meta.difficulty = new TelemetryDifficultyMeta
            {
                id = DifficultySystem.ToConfigId(_state.Difficulty),
                hpMultiplierAtWave1 = multipliers.Hp,
                damageMultiplierAtWave1 = multipliers.Damage
            };
        }

        private static string ResolveGitCommit()
        {
            string fromEnvironment =
                Environment.GetEnvironmentVariable("PROJECTVL_GIT_COMMIT");
            if (!string.IsNullOrWhiteSpace(fromEnvironment))
                return fromEnvironment.Trim();

            try
            {
                DirectoryInfo directory =
                    new DirectoryInfo(Application.dataPath);
                while (directory != null)
                {
                    string gitDirectory =
                        Path.Combine(directory.FullName, ".git");
                    string headPath = Path.Combine(gitDirectory, "HEAD");
                    if (File.Exists(headPath))
                    {
                        string head = File.ReadAllText(headPath).Trim();
                        if (!head.StartsWith("ref: ", StringComparison.Ordinal))
                            return head;

                        string reference = head.Substring(5).Trim();
                        string referencePath = Path.Combine(
                            gitDirectory,
                            reference.Replace('/', Path.DirectorySeparatorChar));
                        if (File.Exists(referencePath))
                            return File.ReadAllText(referencePath).Trim();

                        string packedRefs = Path.Combine(
                            gitDirectory,
                            "packed-refs");
                        if (File.Exists(packedRefs))
                        {
                            foreach (string line in File.ReadAllLines(packedRefs))
                            {
                                if (!line.StartsWith("#")
                                    && !line.StartsWith("^")
                                    && line.EndsWith(
                                        " " + reference,
                                        StringComparison.Ordinal))
                                    return line.Split(' ')[0];
                            }
                        }
                    }

                    directory = directory.Parent;
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }

            return "unknown";
        }

        private TelemetryEventRecord AddEvent(
            GameState state,
            string type,
            int entityId = 0,
            string detail = null,
            float x = 0f,
            float y = 0f,
            float value = 0f)
        {
            var item = new TelemetryEventRecord
            {
                type = type,
                at = state.Time,
                wave = state.Wave,
                entityId = entityId,
                value = value,
                detail = detail,
                x = x,
                y = y
            };
            _session.events.Add(item);
            _lastEventAt = state.Time;
            return item;
        }

        private void RecordCoreEvent(TelemetryEventRecord item)
        {
            if (_disposed
                || item == null
                || string.IsNullOrEmpty(item.type))
                return;
            if (!TelemetryEventContract.Contains(item.type))
                throw new InvalidOperationException(
                    $"Unsupported telemetry event type: {item.type}");

            _session.events.Add(item);
            _lastEventAt = item.at;
            if (item.type == "waveStart")
                _lastWave = item.wave;
            if (item.type == "kill")
                _lastKills = Math.Max(_lastKills, _state.Kills);
            if (item.enemyId > 0)
                _enemyIds.Add(item.enemyId);
            if (item.dropId > 0)
                _dropIds.Add(item.dropId);
            if (item.offerId > 0)
                _offerIds.Add(item.offerId);
            if (item.encounterId > 0)
                _encounterIds.Add(item.encounterId);
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
