using NUnit.Framework;
using ProjectVL.Config;

namespace ProjectVL.Tests
{
    public sealed class CombatConfigTests
    {
        [Test]
        public void DefaultConfigMatchesWebBaseline()
        {
            CombatConfig config = CombatConfigLoader.LoadDefault();

            Assert.That(config.canvas.width, Is.EqualTo(540f));
            Assert.That(config.canvas.height, Is.EqualTo(730f));
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
    }
}
