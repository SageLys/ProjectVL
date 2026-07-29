using System.Linq;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class DifficultyAndProgressionTests
    {
        [Test]
        public void DifficultyCurvesMatchWebAtFirstAndFinalWave()
        {
            DifficultyConfig config = GameConfigLoader.LoadDifficulty();
            var system = new DifficultySystem(config, 10);

            DifficultyMultipliers relaxedFirst = system.Get(
                DifficultyId.Relaxed,
                EnemyKind.Normal,
                1);
            DifficultyMultipliers relaxedLast = system.Get(
                DifficultyId.Relaxed,
                EnemyKind.Normal,
                10);
            DifficultyMultipliers bossFirst = system.Get(
                DifficultyId.Relaxed,
                EnemyKind.Boss,
                1);

            Assert.That(relaxedFirst.Hp, Is.EqualTo(0.45f).Within(0.0001f));
            Assert.That(relaxedFirst.Damage, Is.EqualTo(0.35f).Within(0.0001f));
            Assert.That(relaxedLast.Hp, Is.EqualTo(0.85f).Within(0.0001f));
            Assert.That(relaxedLast.Speed, Is.EqualTo(1f).Within(0.0001f));
            Assert.That(bossFirst.Hp, Is.EqualTo(0.6f).Within(0.0001f));
            Assert.That(bossFirst.Speed, Is.EqualTo(0.95f).Within(0.0001f));
        }

        [Test]
        public void HellDifficultyRemainsIdentityAtEveryWave()
        {
            var system = new DifficultySystem(
                GameConfigLoader.LoadDifficulty(),
                10);

            DifficultyMultipliers first = system.Get(
                DifficultyId.Hell,
                EnemyKind.Normal,
                1);
            DifficultyMultipliers last = system.Get(
                DifficultyId.Hell,
                EnemyKind.Boss,
                10);

            Assert.That(first.Hp, Is.EqualTo(1f));
            Assert.That(first.Damage, Is.EqualTo(1f));
            Assert.That(first.Speed, Is.EqualTo(1f));
            Assert.That(last.Hp, Is.EqualTo(1f));
            Assert.That(last.Damage, Is.EqualTo(1f));
            Assert.That(last.Speed, Is.EqualTo(1f));
        }

        [Test]
        public void DifficultyCanOnlyChangeBeforeRunStarts()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());

            state.SelectDifficulty(DifficultyId.Hard);
            state.StartRun();
            state.SelectDifficulty(DifficultyId.Relaxed);

            Assert.That(state.Difficulty, Is.EqualTo(DifficultyId.Hard));
        }

        [Test]
        public void CumulativeExperienceQueuesEveryCrossedLevelChoice()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            var progression = new ProgressionSystem(
                GameConfigLoader.LoadProgression(),
                combat,
                new ConstantRandomSource(0f));
            GameState state = GameStateFactory.Create(combat);
            state.StartRun();

            progression.AddExperience(state, 40f);

            Assert.That(state.Level, Is.EqualTo(4));
            Assert.That(state.ExperienceNeeded, Is.EqualTo(62f));
            Assert.That(state.PendingLevelUpgradeCount, Is.EqualTo(3));
            Assert.That(state.DecisionLocked, Is.True);
            Assert.That(
                state.PendingLevelUpgrade.Options.Select(option => option.id),
                Is.EqualTo(new[] { "damage", "fireRate", "maxHp" }));
        }

        [Test]
        public void ChoosingUpgradeAppliesEffectAndContinuesQueuedChoices()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            var progression = new ProgressionSystem(
                GameConfigLoader.LoadProgression(),
                combat,
                new ConstantRandomSource(0f));
            GameState state = GameStateFactory.Create(combat);
            state.StartRun();
            progression.AddExperience(state, 22f);

            Assert.That(progression.Choose(state, 0), Is.True);
            Assert.That(combat.defaults.damage, Is.EqualTo(20f));
            Assert.That(state.PendingLevelUpgradeCount, Is.EqualTo(1));
            Assert.That(state.DecisionLocked, Is.True);

            Assert.That(progression.Choose(state, 2), Is.True);
            Assert.That(state.MaxHp, Is.EqualTo(110f));
            Assert.That(state.Hp, Is.EqualTo(110f));
            Assert.That(state.PendingLevelUpgradeCount, Is.Zero);
            Assert.That(state.DecisionLocked, Is.False);
        }

        private sealed class ConstantRandomSource : IRandomSource
        {
            private readonly float _value;

            public ConstantRandomSource(float value)
            {
                _value = value;
            }

            public float NextFloat()
            {
                return _value;
            }
        }
    }
}
