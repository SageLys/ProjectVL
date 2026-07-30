using NUnit.Framework;
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
