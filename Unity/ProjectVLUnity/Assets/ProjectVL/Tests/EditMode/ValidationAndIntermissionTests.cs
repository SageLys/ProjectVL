using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class ValidationAndIntermissionTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private WavesConfig _waves;
        private EnemyFactory _factory;
        private WaveSystem _waveSystem;
        private GameState _state;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
            _waves = GameConfigLoader.LoadWaves();
            _factory = new EnemyFactory(
                _combat,
                _enemies,
                _waves,
                new ConstantRandomSource(0.5f));
            _waveSystem = new WaveSystem(_waves, _factory);
            _state = GameStateFactory.Create(_combat);
            _state.StartRun();
        }

        [Test]
        public void WaveNineSpawnsConfiguredValidationElite()
        {
            _state.BeginWave(8);

            _waveSystem.StartNextWave(_state);

            Assert.That(_state.Wave, Is.EqualTo(9));
            Assert.That(_state.SpawnLeft, Is.Zero);
            Assert.That(_state.Enemies, Has.Count.EqualTo(1));
            EnemyState elite = _state.Enemies[0];
            Assert.That(elite.SpawnKind, Is.EqualTo(EnemySpawnKind.ValidationElite));
            Assert.That(elite.Kind, Is.EqualTo(EnemyKind.Tank));
            Assert.That(elite.MaxHp, Is.EqualTo(6930f));
            Assert.That(elite.Speed, Is.EqualTo(21.375f).Within(0.001f));
            Assert.That(elite.Damage, Is.EqualTo(28f));
            Assert.That(elite.Reward.Kind, Is.EqualTo(RewardKind.Card));
            Assert.That(elite.Reward.Star, Is.EqualTo(4));
        }

        [Test]
        public void DefeatedValidationEliteGrantsConfiguredReward()
        {
            _state.BeginWave(8);
            _waveSystem.StartNextWave(_state);
            EnemyState elite = _state.Enemies[0];
            elite.Hp = 1f;
            _state.Bullets.Add(new BulletState(
                1,
                elite.Position,
                new Float2(),
                4f,
                1f,
                18f));
            var combat = new CombatSystem(_combat, _enemies);

            combat.StepBullets(_state, 0f);

            Assert.That(_state.Enemies, Is.Empty);
            Assert.That(_state.CollectedRewards, Has.Count.EqualTo(1));
            Assert.That(_state.CollectedRewards[0].Kind, Is.EqualTo(RewardKind.Card));
            Assert.That(_state.CollectedRewards[0].Star, Is.EqualTo(4));
            Assert.That(_state.CollectedRewards[0].TypePolicy, Is.EqualTo("focusGod"));
        }

        [TestCase(1, 1)]
        [TestCase(4, 2)]
        [TestCase(6, 3)]
        [TestCase(8, 4)]
        [TestCase(9, 5)]
        [TestCase(10, 5)]
        public void BossRewardMatchesWebSchedule(int wave, int expectedStar)
        {
            RunReward reward = _waveSystem.ComputeBossReward(wave);

            Assert.That(reward.Kind, Is.EqualTo(RewardKind.Wildcard));
            Assert.That(reward.Star, Is.EqualTo(expectedStar));
            Assert.That(reward.Count, Is.EqualTo(1));
        }

        [Test]
        public void BossRewardMustBeClaimedBeforeIntermission()
        {
            EnterBossRewardAtWaveNine();

            Assert.That(_state.WavePhase, Is.EqualTo(WavePhase.BossReward));
            Assert.That(_state.PendingBossReward.Star, Is.EqualTo(5));
            Assert.That(_state.DecisionLocked, Is.True);

            _waveSystem.ClaimBossReward(_state);

            Assert.That(_state.PendingBossReward, Is.Null);
            Assert.That(_state.CollectedRewards, Has.Count.EqualTo(1));
            Assert.That(_state.IntermissionActive, Is.True);
            Assert.That(_state.WavePhase, Is.EqualTo(WavePhase.Intermission));
            Assert.That(_state.IntermissionRemaining, Is.EqualTo(19.5f).Within(0.001f));
        }

        [Test]
        public void ReadyConfirmationStartsNextValidationWave()
        {
            EnterBossRewardAtWaveNine();
            _waveSystem.ClaimBossReward(_state);

            _waveSystem.ConfirmIntermissionReady(_state);
            _waveSystem.Step(_state, 0f);

            Assert.That(_state.Wave, Is.EqualTo(10));
            Assert.That(_state.IntermissionActive, Is.False);
            Assert.That(_state.Enemies, Has.Count.EqualTo(2));
            Assert.That(
                _state.Enemies,
                Has.All.Property("SpawnKind").EqualTo(EnemySpawnKind.ValidationElite));
        }

        [Test]
        public void ClaimingFinalBossRewardEndsRunAsVictory()
        {
            _state.BeginWave(9);
            _waveSystem.StartNextWave(_state);
            _state.Enemies.Clear();
            _waveSystem.Step(_state, 0f);
            _state.Enemies.Clear();
            _waveSystem.Step(_state, 0f);

            _waveSystem.ClaimBossReward(_state);

            Assert.That(_state.Mode, Is.EqualTo(GameMode.Ended));
            Assert.That(_state.Won, Is.True);
            Assert.That(
                _state.CollectedRewards[_state.CollectedRewards.Count - 1].Star,
                Is.EqualTo(5));
        }

        private void EnterBossRewardAtWaveNine()
        {
            _state.BeginWave(8);
            _waveSystem.StartNextWave(_state);
            _state.Enemies.Clear();
            _waveSystem.Step(_state, 0f);
            Assert.That(_state.WavePhase, Is.EqualTo(WavePhase.Boss));
            _state.Enemies.Clear();
            _waveSystem.Step(_state, 0f);
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
