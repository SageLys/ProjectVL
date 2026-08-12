using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class RewardMeterSystemTests
    {
        [Test]
        public void LoadsReviewedRewardAndSettlementConfigs()
        {
            RewardMeterConfig meter = GameConfigLoader.LoadRewardMeter();
            SettlementConfig settlement = GameConfigLoader.LoadSettlement();

            Assert.That(meter.version, Is.EqualTo("0.1.0"));
            Assert.That(meter.thresholds, Is.EqualTo(
                new[] { 10f, 12f, 16f, 24f, 33f, 45f, 60f, 80f }));
            Assert.That(meter.rewards, Has.Length.EqualTo(5));
            Assert.That(settlement.version, Is.EqualTo("0.1.0"));
            Assert.That(settlement.wildcardStarValue.star5, Is.EqualTo(600));
        }

        [Test]
        public void ReachingThresholdExecutesRewardAndLocksUntilConfirmed()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            RewardMeterSystem system = CreateDefault(0f);
            system.Initialize(state);

            system.AddPoints(state, 10f);

            Assert.That(state.PendingRewardReceipt, Is.Not.Null);
            Assert.That(
                state.PendingRewardReceipt.RewardId,
                Is.EqualTo("heartbreakNova"));
            Assert.That(state.RewardActivationCount, Is.EqualTo(1));
            Assert.That(state.RewardThreshold, Is.EqualTo(12f));
            Assert.That(state.DecisionLocked, Is.True);

            Assert.That(system.ConfirmReceipt(state), Is.True);
            Assert.That(state.PendingRewardReceipt, Is.Null);
            Assert.That(state.DecisionLocked, Is.False);
        }

        [Test]
        public void PendingReceiptRetainsOverflowAndChainsAfterConfirmation()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            RewardMeterConfig config = SingleReward(
                "wildHeart",
                "grantWildcards");
            config.thresholds = new[] { 1f };
            config.rewards[0].action.count = 1;
            config.rewards[0].action.starSchedule = new[] { 1, 2, 3 };
            var system = new RewardMeterSystem(
                config,
                new ConstantRandomSource(0f));
            system.Initialize(state);

            system.AddPoints(state, 3f);
            Assert.That(state.Wildcards[1], Is.EqualTo(1));
            Assert.That(state.RewardPoints, Is.EqualTo(2f));

            system.ConfirmReceipt(state);
            Assert.That(state.Wildcards[2], Is.EqualTo(1));
            Assert.That(state.RewardPoints, Is.EqualTo(1f));
            Assert.That(state.PendingRewardReceipt, Is.Not.Null);
        }

        [Test]
        public void GlobalControlFreezesAndVulnerablesEveryEnemy()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            state.Enemies.Add(MakeEnemy(1, 100f));
            state.Enemies.Add(MakeEnemy(2, 100f));
            RewardMeterConfig config = SingleReward(
                "absoluteStillness",
                "globalControl");
            config.rewards[0].action.freezeSeconds = 2.5f;
            config.rewards[0].action.vulnerableRatio = 0.3f;
            config.rewards[0].action.vulnerableSeconds = 5f;
            var system = new RewardMeterSystem(
                config,
                new ConstantRandomSource(0f));
            system.Initialize(state);

            system.AddPoints(state, 1f);

            Assert.That(
                state.PendingRewardReceipt.Result.FrozenCount,
                Is.EqualTo(2));
            Assert.That(state.Enemies[0].FrozenRemaining, Is.EqualTo(2.5f));
            Assert.That(state.Enemies[1].VulnerableRatio, Is.EqualTo(0.3f));
        }

        [Test]
        public void GlobalDamageUsesCombatKillPipelineWithoutRecursivePoints()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            state.Enemies.Add(MakeEnemy(1, 1f));
            RewardMeterConfig config = SingleReward(
                "heartbreakNova",
                "globalDamage");
            config.rewards[0].action.damageMul = 8f;
            config.rewards[0].action.bossMaxHpRatioCap = 0.1f;
            var system = new RewardMeterSystem(
                config,
                new ConstantRandomSource(0f));
            var combatSystem = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies(),
                rewardMeter: system);
            system.AttachDamageHandler(combatSystem.ApplyRewardDamage);
            system.Initialize(state);

            system.AddPoints(state, 1f);

            Assert.That(state.Enemies, Is.Empty);
            Assert.That(state.Kills, Is.EqualTo(1));
            Assert.That(state.RewardPoints, Is.Zero);
            Assert.That(
                state.PendingRewardReceipt.Result.EnemiesKilled,
                Is.EqualTo(1));
        }

        [Test]
        public void BuildSurgeUsesDominantEquippedCardCategoryAndExpires()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            state.Equipment[0] = state.CreateCard("pierce", 5);
            RewardMeterConfig config = SingleReward(
                "buildResonance",
                "buildSurge");
            config.rewards[0].action.duration = 12f;
            config.rewards[0].action.value = 0.25f;
            var system = new RewardMeterSystem(
                config,
                new ConstantRandomSource(0f),
                new CardCatalog(GameConfigLoader.LoadCards()));
            system.Initialize(state);

            system.AddPoints(state, 1f);

            Assert.That(state.RewardSurgeTag, Is.EqualTo("projectile"));
            Assert.That(state.RewardDamageMultiplier, Is.EqualTo(1.25f));
            Assert.That(state.RewardFireRateMultiplier, Is.EqualTo(1.25f));
            system.Step(state, 12f);
            Assert.That(state.RewardSurgeTag, Is.Null);
            Assert.That(state.RewardDamageMultiplier, Is.EqualTo(1f));
        }

        [Test]
        public void PreventsImmediateRewardRepeat()
        {
            RewardMeterConfig config = GameConfigLoader.LoadRewardMeter();
            config.thresholds = new[] { 1f };
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            var system = new RewardMeterSystem(
                config,
                new ConstantRandomSource(0f));
            system.Initialize(state);

            system.AddPoints(state, 1f);
            string first = state.PendingRewardReceipt.RewardId;
            system.ConfirmReceipt(state);
            system.AddPoints(state, 1f);
            string second = state.PendingRewardReceipt.RewardId;

            Assert.That(second, Is.Not.EqualTo(first));
        }

        private static RewardMeterSystem CreateDefault(float random)
        {
            return new RewardMeterSystem(
                GameConfigLoader.LoadRewardMeter(),
                new ConstantRandomSource(random),
                new CardCatalog(GameConfigLoader.LoadCards()));
        }

        private static RewardMeterConfig SingleReward(
            string id,
            string kind)
        {
            return new RewardMeterConfig
            {
                thresholds = new[] { 1f },
                rewards = new[]
                {
                    new RewardDefinitionConfig
                    {
                        id = id,
                        action = new RewardActionConfig { kind = kind }
                    }
                }
            };
        }

        private static EnemyState MakeEnemy(int id, float hp)
        {
            return new EnemyState(
                id,
                EnemyKind.Normal,
                new Float2(100f + id, 100f),
                hp,
                10f,
                8f,
                1f,
                xpReward: 1f);
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
