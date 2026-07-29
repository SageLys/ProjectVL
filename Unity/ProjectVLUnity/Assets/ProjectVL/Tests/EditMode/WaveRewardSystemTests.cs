using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class WaveRewardSystemTests
    {
        private CombatConfig _combat;
        private WaveRewardsConfig _config;
        private WaveRewardSystem _rewards;
        private GameState _state;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _config = GameConfigLoader.LoadWaveRewards();
            _rewards = new WaveRewardSystem(_config, _combat);
            _state = GameStateFactory.Create(_combat);
            _state.StartRun();
            _state.BeginWave(1);
        }

        [Test]
        public void FloorRewardsMatchWebConfigAndAreIdempotent()
        {
            Assert.That(_rewards.GrantFloorRewards(_state, 1), Is.True);
            Assert.That(_state.RunDamageAdd, Is.EqualTo(1f));
            Assert.That(_state.RunRangeAdd, Is.Zero);
            Assert.That(_state.LastFloorRewards, Has.Count.EqualTo(2));

            Assert.That(_rewards.GrantFloorRewards(_state, 1), Is.False);
            Assert.That(_state.RunDamageAdd, Is.EqualTo(1f));
            Assert.That(_state.RunRangeAdd, Is.Zero);
        }

        [Test]
        public void ChoiceOffersFivePermanentGrowthOptions()
        {
            Assert.That(_rewards.OfferChoice(_state, 1), Is.True);
            Assert.That(_state.PendingWaveReward, Is.Not.Null);
            Assert.That(_state.PendingWaveReward.Options, Has.Count.EqualTo(5));
            Assert.That(
                _state.PendingWaveReward.IsCapped("optRange"),
                Is.True);
            Assert.That(_state.DecisionLocked, Is.True);

            Assert.That(_rewards.Choose(_state, 1), Is.True);
            Assert.That(_state.RunFireRateAdd, Is.EqualTo(0.15f).Within(0.0001f));
            Assert.That(_state.PendingWaveReward, Is.Null);
            Assert.That(_state.DecisionLocked, Is.False);
            Assert.That(_state.ChosenWaveRewards, Has.Count.EqualTo(1));
        }

        [Test]
        public void MaxHpChoiceRaisesCurrentAndMaximumHp()
        {
            _rewards.OfferChoice(_state, 1);

            Assert.That(_rewards.Choose(_state, 2), Is.True);

            Assert.That(_state.BaseMaxHp, Is.EqualTo(110f));
            Assert.That(_state.MaxHp, Is.EqualTo(110f));
            Assert.That(_state.Hp, Is.EqualTo(110f));
        }

        [Test]
        public void RangeGrowthStopsAtTheArenaSafeMaximum()
        {
            var rangeReward = new WaveRewardEffectConfig
            {
                stat = "rangeAdd",
                add = 1000f
            };

            _rewards.Apply(_state, rangeReward);

            Assert.That(
                _combat.defaults.range + _state.RunRangeAdd,
                Is.EqualTo(_rewards.MaxAttackRange()).Within(0.001f));
            Assert.That(_rewards.RangeIsCapped(_state), Is.True);
        }

        [Test]
        public void WaveSystemRequiresGrowthChoiceBeforeStartingNextWave()
        {
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            var factory = new EnemyFactory(
                _combat,
                enemies,
                waves,
                new ConstantRandomSource());
            var waveSystem = new WaveSystem(
                waves,
                factory,
                null,
                null,
                null,
                _rewards);
            _state.BeginWave(8);
            waveSystem.StartNextWave(_state);
            _state.Enemies.Clear();
            waveSystem.Step(_state, 0f);
            _state.Enemies.Clear();
            waveSystem.Step(_state, 0f);
            waveSystem.ClaimBossReward(_state);

            waveSystem.Step(_state, 0f);

            Assert.That(_state.IntermissionActive, Is.True);
            Assert.That(_state.RunDamageAdd, Is.EqualTo(1f));
            Assert.That(_state.PendingWaveReward, Is.Not.Null);
            Assert.That(_state.Wave, Is.EqualTo(9));

            waveSystem.ChooseWaveReward(_state, 0);
            waveSystem.ConfirmIntermissionReady(_state);
            waveSystem.Step(_state, 0f);

            Assert.That(_state.Wave, Is.EqualTo(10));
            Assert.That(_state.IntermissionActive, Is.False);
            Assert.That(_state.RunDamageAdd, Is.EqualTo(3f));
        }

        private sealed class ConstantRandomSource : IRandomSource
        {
            public float NextFloat()
            {
                return 0.5f;
            }
        }
    }
}
