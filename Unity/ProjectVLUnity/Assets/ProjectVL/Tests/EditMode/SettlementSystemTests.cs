using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class SettlementSystemTests
    {
        private CombatConfig _combat;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
        }

        [Test]
        public void VictoryUsesTheSameSixScoreBucketsAsTheWebVersion()
        {
            GameState state = GameStateFactory.Create(_combat);
            state.Hand[0] = state.CreateCard("pierce", 2);
            state.Equipment[0] = state.CreateCard("frost", 3);
            state.Wildcards[1] = 2;
            state.Wildcards[3] = 1;
            state.BeginWave(10);

            RunSummary summary = new SettlementSystem().Build(state, true);

            Assert.That(summary.ClearedWaves, Is.EqualTo(10));
            Assert.That(summary.HighestCard.Type, Is.EqualTo("frost"));
            Assert.That(summary.HighestCard.Star, Is.EqualTo(3));
            Assert.That(summary.Score.Win, Is.EqualTo(500));
            Assert.That(summary.Score.Waves, Is.EqualTo(400));
            Assert.That(summary.Score.Hp, Is.EqualTo(200));
            Assert.That(summary.Score.Build, Is.EqualTo(130));
            Assert.That(summary.Score.Wildcards, Is.EqualTo(130));
            Assert.That(summary.Score.Total, Is.EqualTo(1360));
        }

        [Test]
        public void DefeatCountsOnlyFullyClearedWavesAndNoHpBonus()
        {
            GameState state = GameStateFactory.Create(_combat);
            state.BeginWave(4);

            RunSummary summary = new SettlementSystem().Build(state, false);

            Assert.That(summary.Won, Is.False);
            Assert.That(summary.WaveReached, Is.EqualTo(4));
            Assert.That(summary.ClearedWaves, Is.EqualTo(3));
            Assert.That(summary.Score.Waves, Is.EqualTo(120));
            Assert.That(summary.Score.Hp, Is.Zero);
        }

        [Test]
        public void SummaryCapturesRelicRarityAndOwnsCollectionSnapshots()
        {
            GameState state = GameStateFactory.Create(_combat);
            state.SubGods.Add("winter");
            state.CompletedRecipes.Add("frozenThunder");
            state.RelicStacks["winter_frozen_marrow"] = 2;
            var relics = new RelicsConfig
            {
                relics = new[]
                {
                    new RelicConfig
                    {
                        id = "winter_frozen_marrow",
                        rarity = "rare"
                    }
                }
            };

            RunSummary summary = new SettlementSystem(
                new ProgressionConfig(),
                relics).Build(state, false);
            state.SubGods.Add("storm");
            state.CompletedRecipes.Clear();
            state.RelicStacks["winter_frozen_marrow"] = 9;

            Assert.That(summary.SubGods, Is.EqualTo(new[] { "winter" }));
            Assert.That(
                summary.CompletedRecipes,
                Is.EqualTo(new[] { "frozenThunder" }));
            Assert.That(summary.RelicKinds, Is.EqualTo(1));
            Assert.That(summary.RelicStacks, Is.EqualTo(2));
            Assert.That(summary.RelicRarity.Rare, Is.EqualTo(2));
        }

        [Test]
        public void EndRunCreatesOneStableSummary()
        {
            GameState state = GameStateFactory.Create(_combat);
            state.StartRun();
            state.BeginWave(2);

            state.EndRun(false);
            RunSummary first = state.RunSummary;
            state.EndRun(true);

            Assert.That(first, Is.Not.Null);
            Assert.That(state.RunSummary, Is.SameAs(first));
            Assert.That(state.Won, Is.False);
            Assert.That(state.Mode, Is.EqualTo(GameMode.Ended));
        }
    }
}
