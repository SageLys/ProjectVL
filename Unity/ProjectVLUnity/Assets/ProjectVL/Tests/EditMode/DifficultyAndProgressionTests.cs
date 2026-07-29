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
            ProgressionConfig config = GameConfigLoader.LoadProgression();
            RelicsConfig relics = GameConfigLoader.LoadRelics();
            var progression = new ProgressionSystem(
                config,
                relics,
                new ConstantRandomSource(0f));
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            state.StartRun();
            SelectInitialGod(state);

            progression.AddExperience(state, 40f);

            Assert.That(state.Level, Is.EqualTo(4));
            Assert.That(state.ExperienceNeeded, Is.EqualTo(62f));
            Assert.That(state.PendingLevelUpgradeCount, Is.EqualTo(3));
            Assert.That(state.DecisionLocked, Is.True);
            Assert.That(
                state.PendingLevelUpgrade.Options.Select(option => option.Id),
                Is.EqualTo(new[]
                {
                    "proj_damage",
                    "neutral_calibrator",
                    "neutral_redundant_armor"
                }));
        }

        [Test]
        public void ChoosingRelicRecordsFormalScalingAndContinuesQueue()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            var progression = new ProgressionSystem(
                GameConfigLoader.LoadProgression(),
                GameConfigLoader.LoadRelics(),
                new ConstantRandomSource(0f));
            GameState state = GameStateFactory.Create(combat);
            state.StartRun();
            SelectInitialGod(state);
            progression.AddExperience(state, 22f);

            Assert.That(progression.Choose(state, 0), Is.True);
            Assert.That(state.RelicStacks["proj_damage"], Is.EqualTo(1));
            Assert.That(
                state.RelicScaling["projectile:effectDamageMul"],
                Is.EqualTo(0.15f).Within(0.0001f));
            Assert.That(state.GodAffinity["storm"], Is.EqualTo(1));
            Assert.That(state.PendingLevelUpgradeCount, Is.EqualTo(1));
            Assert.That(state.DecisionLocked, Is.True);

            Assert.That(progression.Choose(state, 1), Is.True);
            Assert.That(
                state.RelicStacks["neutral_calibrator"],
                Is.EqualTo(1));
            Assert.That(state.PendingLevelUpgradeCount, Is.Zero);
            Assert.That(state.DecisionLocked, Is.False);
        }

        [Test]
        public void GodDraftFollowsMainThenTwoSubGods()
        {
            var system = new GodPoolSystem(
                GameConfigLoader.LoadGods(),
                new ConstantRandomSource(0f));
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            state.StartRun();

            Assert.That(system.OfferInitial(state), Is.True);
            Assert.That(state.PendingGodChoice.Role, Is.EqualTo(GodChoiceRole.Main));
            Assert.That(state.PendingGodChoice.Options, Has.Length.EqualTo(3));
            Assert.That(system.Choose(state, 0), Is.True);
            Assert.That(state.MainGod, Is.EqualTo("storm"));
            Assert.That(state.FocusGod, Is.EqualTo("storm"));

            Assert.That(system.OfferForAfterWave(state, 1), Is.True);
            Assert.That(state.PendingGodChoice.Role, Is.EqualTo(GodChoiceRole.Sub));
            Assert.That(system.Choose(state, 0), Is.True);
            Assert.That(state.SubGods, Is.EqualTo(new[] { "winter" }));

            Assert.That(system.OfferForAfterWave(state, 2), Is.True);
            Assert.That(system.Choose(state, 0), Is.True);
            Assert.That(state.SubGods, Is.EqualTo(new[] { "winter", "inferno" }));
        }

        [Test]
        public void FormalGodAndRelicConfigsAreLoaded()
        {
            GodsConfig gods = GameConfigLoader.LoadGods();
            RelicsConfig relics = GameConfigLoader.LoadRelics();
            ProgressionConfig progression = GameConfigLoader.LoadProgression();

            Assert.That(gods.gods, Has.Length.EqualTo(5));
            Assert.That(relics.relics, Has.Length.EqualTo(22));
            Assert.That(
                relics.relics.Select(relic => relic.id),
                Does.Contain("storm_overload_coil"));
            Assert.That(
                progression.rarityByRelicIndex,
                Has.Length.EqualTo(5));
        }

        private static void SelectInitialGod(GameState state)
        {
            var gods = new GodPoolSystem(
                GameConfigLoader.LoadGods(),
                new ConstantRandomSource(0f));
            Assert.That(gods.OfferInitial(state), Is.True);
            Assert.That(gods.Choose(state, 0), Is.True);
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
