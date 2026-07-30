using System;
using System.IO;
using NUnit.Framework;
using ProjectVL.Core;
using ProjectVL.Config;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CombatConfigTests
    {
        [Test]
        public void DefaultConfigMatchesWebBaseline()
        {
            CombatConfig config = CombatConfigLoader.LoadDefault();

            Assert.That(config.canvas.width, Is.EqualTo(402f));
            Assert.That(config.canvas.height, Is.EqualTo(874f));
            Assert.That(config.hp.max, Is.EqualTo(100f));
            Assert.That(config.defaults.damage, Is.EqualTo(18f));
            Assert.That(config.defaults.fireRate, Is.EqualTo(5f));
            Assert.That(config.defaults.range, Is.EqualTo(150f));
            Assert.That(config.bullet.speed, Is.EqualTo(465f));
            Assert.That(config.dtCap, Is.EqualTo(0.033f).Within(0.00001f));
        }

        [Test]
        public void RejectsNonPositiveDeltaTimeCap()
        {
            CombatConfig config = CombatConfigLoader.LoadDefault();
            config.dtCap = 0f;

            Assert.Throws<System.InvalidOperationException>(
                () => CombatConfigValidator.ValidateOrThrow(config));
        }

        [Test]
        public void RuntimeTuningMutatesAndRestoresLiveConfigs()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            BountyConfig bounty = GameConfigLoader.LoadBounty();
            var tuning = new RuntimeTuningSystem(
                combat, enemies, waves, economy, bounty);

            TuningParameter damage = Find(tuning, "Combat", "Damage");
            TuningParameter quota =
                Find(tuning, "Waves", "Build quota start");
            float originalDamage = damage.Value;
            float originalQuota = quota.Value;

            damage.Set(41f);
            quota.Set(177f);

            Assert.That(combat.defaults.damage, Is.EqualTo(41f));
            Assert.That(waves.stagePlan.build.waveQuota.start, Is.EqualTo(177f));
            Assert.That(quota.AppliesNextWave, Is.True);

            tuning.ResetAll();
            Assert.That(damage.Value, Is.EqualTo(originalDamage));
            Assert.That(quota.Value, Is.EqualTo(originalQuota));
        }

        [Test]
        public void RuntimeTuningCapturesAppliesAndHighlightsPresetChanges()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            var tuning = new RuntimeTuningSystem(
                combat,
                GameConfigLoader.LoadEnemies(),
                GameConfigLoader.LoadWaves(),
                GameConfigLoader.LoadEconomy(),
                GameConfigLoader.LoadBounty());
            TuningParameter damage = Find(tuning, "Combat", "Damage");
            TuningPreset preset = tuning.CapturePreset("baseline");

            damage.Set(72f);
            int changed = tuning.ApplyPreset(preset);

            Assert.That(damage.Value, Is.EqualTo(18f));
            Assert.That(changed, Is.EqualTo(1));
            Assert.That(tuning.WasChangedByLastPreset(damage), Is.True);
            Assert.That(tuning.AppliedPresetName, Is.EqualTo("baseline"));
        }

        [Test]
        public void TuningPresetStorePersistsExportsImportsAndDeletes()
        {
            string directory = Path.Combine(
                Path.GetTempPath(),
                "ProjectVLTuningTests-" + Guid.NewGuid().ToString("N"));
            try
            {
                var tuning = new RuntimeTuningSystem(
                    CombatConfigLoader.LoadDefault(),
                    GameConfigLoader.LoadEnemies(),
                    GameConfigLoader.LoadWaves(),
                    GameConfigLoader.LoadEconomy(),
                    GameConfigLoader.LoadBounty());
                var store = new TuningPresetStore(directory);

                string exportPath = store.Save(
                    tuning.CapturePreset("fast test"));
                File.Copy(exportPath, store.ImportPath);
                TuningPreset imported = store.Import();
                var reloaded = new TuningPresetStore(directory);

                Assert.That(File.Exists(exportPath), Is.True);
                Assert.That(imported.name, Is.EqualTo("fast test"));
                Assert.That(reloaded.Presets.Count, Is.EqualTo(1));
                Assert.That(reloaded.DeleteAt(0), Is.True);
                Assert.That(reloaded.Presets, Is.Empty);
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
        public void SystemRandomSourceCanReplayFromSeed()
        {
            var random = new SystemRandomSource(99);
            float first = random.NextFloat();
            float second = random.NextFloat();

            random.Reset(99);

            Assert.That(random.Seed, Is.EqualTo(99));
            Assert.That(random.NextFloat(), Is.EqualTo(first));
            Assert.That(random.NextFloat(), Is.EqualTo(second));
        }

        private static TuningParameter Find(
            RuntimeTuningSystem tuning,
            string group,
            string label)
        {
            foreach (TuningParameter parameter in tuning.Parameters)
            {
                if (parameter.Group == group && parameter.Label == label)
                {
                    return parameter;
                }
            }

            Assert.Fail($"Missing tuning parameter {group}/{label}");
            return null;
        }
    }
}
