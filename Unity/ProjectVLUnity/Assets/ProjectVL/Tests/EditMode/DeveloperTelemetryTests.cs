using System;
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
    }
}
