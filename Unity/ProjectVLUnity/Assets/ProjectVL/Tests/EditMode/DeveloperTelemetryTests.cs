using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class DeveloperTelemetryTests
    {
        [Test]
        public void CapturesWaveSpawnSamplesInputsAndJson()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            BountyConfig bounty = GameConfigLoader.LoadBounty();
            GameState state = GameStateFactory.Create(combat, economy);
            var telemetry = new DeveloperTelemetrySystem(
                state, 42, "test", combat, enemies, waves, economy, bounty);

            state.BeginWave(1);
            state.Enemies.Add(new EnemyState(
                17,
                EnemyKind.Normal,
                new Float2(20f, 30f),
                10f,
                1f,
                5f,
                2f));
            telemetry.RecordInput(state, "pickupClick", "test");
            telemetry.Step(state, 0.016f);

            Assert.That(telemetry.Session.events.Exists(
                item => item.type == "waveStart"), Is.True);
            Assert.That(telemetry.Session.events.Exists(
                item => item.type == "spawn" && item.entityId == 17), Is.True);
            Assert.That(telemetry.Session.samples.Count, Is.EqualTo(1));
            Assert.That(telemetry.Session.inputs.Count, Is.EqualTo(1));
            telemetry.GetEnemyPercentiles(1, out float p50, out float p95);
            Assert.That(p50, Is.EqualTo(1f));
            Assert.That(p95, Is.EqualTo(1f));

            string json = telemetry.ToJson();
            StringAssert.Contains("\"seed\": 42", json);
            StringAssert.Contains("\"waveStart\"", json);
            StringAssert.Contains("\"pickupClick\"", json);
        }

        [Test]
        public void ExportsSessionToTimestampedJsonFile()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            string directory = Path.Combine(
                Path.GetTempPath(),
                "ProjectVLTelemetryTests-" + Guid.NewGuid().ToString("N"));

            try
            {
                var telemetry = new DeveloperTelemetrySystem(
                    GameStateFactory.Create(combat, economy),
                    73,
                    "test",
                    combat,
                    GameConfigLoader.LoadEnemies(),
                    GameConfigLoader.LoadWaves(),
                    economy,
                    GameConfigLoader.LoadBounty());

                string path = telemetry.Export(directory);

                Assert.That(File.Exists(path), Is.True);
                StringAssert.Contains(
                    "\"seed\": 73",
                    File.ReadAllText(path));
            }
            finally
            {
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory, true);
                }
            }
        }

        [Test]
        public void ExportsCompleteMetadataAndAutoClosesIdempotently()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            BountyConfig bounty = GameConfigLoader.LoadBounty();
            ProgressionConfig progression =
                GameConfigLoader.LoadProgression();
            DifficultyConfig difficulty =
                GameConfigLoader.LoadDifficulty();
            GodsConfig gods = GameConfigLoader.LoadGods();
            CardsConfig cards = GameConfigLoader.LoadCards();
            CardAffixesConfig affixes =
                GameConfigLoader.LoadCardAffixes();
            RelicsConfig relics = GameConfigLoader.LoadRelics();
            EvolutionRecipesConfig recipes =
                GameConfigLoader.LoadEvolutionRecipes();
            EvolutionTextConfig evolutionText =
                GameConfigLoader.LoadEvolutionText();
            WaveRewardsConfig waveRewards =
                GameConfigLoader.LoadWaveRewards();
            GameState state = GameStateFactory.Create(combat, economy);
            state.SelectDifficulty(DifficultyId.Hard);
            string directory = Path.Combine(
                Path.GetTempPath(),
                "ProjectVLTelemetryAutoCloseTests-"
                    + Guid.NewGuid().ToString("N"));

            try
            {
                var telemetry = new DeveloperTelemetrySystem(
                    state,
                    42,
                    "test-build",
                    combat,
                    enemies,
                    waves,
                    economy,
                    bounty,
                    progression,
                    difficulty,
                    gods,
                    cards,
                    affixes,
                    relics,
                    recipes,
                    evolutionText,
                    waveRewards,
                    () => "stress-preset",
                    "abc123",
                    directory,
                    rewardMeter: GameConfigLoader.LoadRewardMeter(),
                    settlement: GameConfigLoader.LoadSettlement(),
                    recipeProductEffects:
                        GameConfigLoader.LoadRecipeProductEffects());

                state.EndRun();
                telemetry.Step(state, 0.016f);
                string autoPath = telemetry.LastExportPath;
                string manualPath = telemetry.Export(directory);
                string json = File.ReadAllText(autoPath);

                Assert.That(File.Exists(autoPath), Is.True);
                Assert.That(manualPath, Is.EqualTo(autoPath));
                StringAssert.Contains("\"presetName\": \"stress-preset\"", json);
                StringAssert.Contains("\"gitCommit\": \"abc123\"", json);
                StringAssert.Contains("\"id\": \"hard\"", json);
                StringAssert.Contains("\"progression\":", json);
                StringAssert.Contains("\"cards\":", json);
                StringAssert.Contains("\"waveRewards\":", json);
                StringAssert.Contains("\"rewardMeter\":", json);
                StringAssert.Contains("\"settlement\":", json);
                StringAssert.Contains("\"recipeProductEffects\":", json);
            }
            finally
            {
                if (Directory.Exists(directory))
                    Directory.Delete(directory, true);
            }
        }

        [Test]
        public void EventContractMatchesWebAndCoreSystemsPublishIntoSession()
        {
            Assert.That(TelemetryEventContract.Types.Length, Is.EqualTo(46));
            Assert.That(
                new HashSet<string>(TelemetryEventContract.Types).Count,
                Is.EqualTo(46));
            Assert.That(TelemetryEventContract.Contains("spawn"), Is.True);
            Assert.That(
                TelemetryEventContract.Contains("affix_rolled"),
                Is.True);
            Assert.That(
                TelemetryEventContract.Contains("rewardTriggered"),
                Is.True);
            Assert.That(
                TelemetryEventContract.Contains("wavePhase"),
                Is.False);

            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            GameState state = GameStateFactory.Create(combat, economy);
            var telemetry = new DeveloperTelemetrySystem(
                state,
                42,
                "test",
                combat,
                GameConfigLoader.LoadEnemies(),
                GameConfigLoader.LoadWaves(),
                economy,
                GameConfigLoader.LoadBounty());
            var drops = new DropSystem(
                economy,
                new SystemRandomSource(42));

            GroundDropState drop = drops.SpawnTestDrop(
                state,
                new Float2(10f, 20f));
            drops.Step(state, drop.MaxLife + 0.1f);
            var gods = new GodPoolSystem(
                GameConfigLoader.LoadGods(),
                new SystemRandomSource(42));
            Assert.That(gods.OfferInitial(state), Is.True);

            Assert.That(
                telemetry.Session.events.Exists(
                    item => item.type == "dropLanded"
                        && item.dropId == drop.Id),
                Is.True);
            Assert.That(
                telemetry.Session.events.Exists(
                    item => item.type == "dropExpired"
                        && item.dropId == drop.Id),
                Is.True);
            Assert.That(
                telemetry.Session.events.Exists(
                    item => item.type == "god_offer"),
                Is.True);
            Assert.That(
                telemetry.Session.events.Exists(
                    item => item.type == "decision_offered"
                        && item.decisionKind == "god"),
                Is.True);
        }

        [Test]
        public void ComputesWebCompatibleE1ThroughE7Metrics()
        {
            var session = new TelemetrySession();
            session.events.Add(Event("waveStart", 0f, stage: "Selection"));
            session.events.Add(Event("spawn", 0f));
            session.events.Add(Event(
                "dropLanded",
                5f,
                source: "normalKill"));
            session.events.Add(Event(
                "dangerEnter",
                10f,
                visibleSeconds: 2f));
            session.events.Add(Event(
                "kill",
                15f,
                distance: 75f,
                range: 150f));
            session.events.Add(Event(
                "dropLanded",
                20f,
                source: "normalKill"));
            session.events.Add(Event(
                "pickup",
                21f,
                source: "normalKill"));
            session.events.Add(Event(
                "dropExpired",
                22f,
                source: "normalKill"));
            session.events.Add(Event(
                "waveCleared",
                30f,
                stage: "Selection",
                activeRegularSeconds: 30f,
                ordinaryDropsShown: 2,
                eligibleKills: 6));
            session.samples.Add(Sample(0f, 1));
            session.samples.Add(Sample(10f, 3));
            session.samples.Add(Sample(20f, 5));
            session.samples.Add(Sample(30f, 7));
            session.inputs.Add(new TelemetryInputRecord { at = 12f });
            session.inputs.Add(new TelemetryInputRecord { at = 95f });

            TelemetryExperienceMetrics metrics =
                DeveloperTelemetryMetrics.Compute(session);
            TelemetryWaveMetrics wave = metrics.waves[0];

            Assert.That(wave.e1.p50, Is.EqualTo(4f));
            Assert.That(wave.e1.p95, Is.EqualTo(6.7f).Within(0.001f));
            Assert.That(wave.e2, Is.EqualTo(9f));
            Assert.That(wave.e3.max, Is.EqualTo(1));
            Assert.That(wave.e4.count, Is.EqualTo(1));
            Assert.That(wave.e4.visibleSecondsP50, Is.EqualTo(2f));
            Assert.That(wave.e5, Is.EqualTo(0.5f));
            Assert.That(wave.e6, Is.EqualTo(1));
            Assert.That(wave.e7, Is.EqualTo(0.6f).Within(0.001f));
            Assert.That(
                wave.ordinaryDropsShownPerMinute,
                Is.EqualTo(4f));
            Assert.That(
                wave.eligibleKillsPerMinute,
                Is.EqualTo(12f));
            Assert.That(wave.ordinaryPickupRate, Is.EqualTo(0.5f));
            Assert.That(wave.ordinaryExpiryRate, Is.EqualTo(0.5f));
            Assert.That(metrics.first90.e1.p50, Is.EqualTo(4f));
            Assert.That(metrics.first90.e6, Is.EqualTo(1));
        }

        [Test]
        public void TelemetryPercentileHandlesEmptySingleAndClampedRatios()
        {
            Assert.That(
                DeveloperTelemetryMetrics.Percentile(
                    new List<float>(),
                    0.5f),
                Is.Null);
            Assert.That(
                DeveloperTelemetryMetrics.Percentile(
                    new List<float> { 7f },
                    0.95f),
                Is.EqualTo(7f));
            Assert.That(
                DeveloperTelemetryMetrics.Percentile(
                    new List<float> { 2f, 6f },
                    -1f),
                Is.EqualTo(2f));
            Assert.That(
                DeveloperTelemetryMetrics.Percentile(
                    new List<float> { 2f, 6f },
                    2f),
                Is.EqualTo(6f));
        }

        private static TelemetryEventRecord Event(
            string type,
            float at,
            string source = null,
            string stage = null,
            float distance = -1f,
            float range = 0f,
            float visibleSeconds = 0f,
            float activeRegularSeconds = 0f,
            int ordinaryDropsShown = 0,
            int eligibleKills = 0)
        {
            return new TelemetryEventRecord
            {
                type = type,
                at = at,
                wave = 1,
                source = source,
                stage = stage,
                distance = distance,
                range = range,
                visibleSeconds = visibleSeconds,
                activeRegularSeconds = activeRegularSeconds,
                ordinaryDropsShown = ordinaryDropsShown,
                eligibleKills = eligibleKills
            };
        }

        private static TelemetrySampleRecord Sample(float at, int enemies)
        {
            return new TelemetrySampleRecord
            {
                at = at,
                wave = 1,
                enemies = enemies
            };
        }
    }
}
