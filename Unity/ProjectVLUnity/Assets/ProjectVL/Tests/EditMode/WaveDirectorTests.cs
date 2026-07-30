using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class WaveDirectorTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private WavesConfig _waves;
        private EnemyFactory _factory;
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
            _state = GameStateFactory.Create(_combat);
            _state.StartRun();
        }

        [Test]
        public void ResolvesWebStageCurves()
        {
            var resolver = new WavePlanResolver(_waves);

            ResolvedWavePlan wave1 = resolver.Resolve(1);
            ResolvedWavePlan wave3 = resolver.Resolve(3);
            ResolvedWavePlan wave4 = resolver.Resolve(4);
            ResolvedWavePlan wave8 = resolver.Resolve(8);
            ResolvedWavePlan wave9 = resolver.Resolve(9);

            Assert.That(wave1.Stage, Is.EqualTo(RunStage.Selection));
            Assert.That(wave1.Quota, Is.EqualTo(60));
            Assert.That(wave1.TargetOnScreen, Is.EqualTo(7f));
            Assert.That(wave3.Quota, Is.EqualTo(75));
            Assert.That(wave3.TargetOnScreen, Is.EqualTo(10f));
            Assert.That(wave4.Stage, Is.EqualTo(RunStage.Build));
            Assert.That(wave4.Quota, Is.EqualTo(95));
            Assert.That(wave4.TargetOnScreen, Is.EqualTo(14f));
            Assert.That(wave8.Quota, Is.EqualTo(170));
            Assert.That(wave8.TargetOnScreen, Is.EqualTo(28f));
            Assert.That(wave9.Stage, Is.EqualTo(RunStage.Validation));
            Assert.That(wave9.Quota, Is.Zero);
            Assert.That(wave9.Validation, Is.Not.Null);
            Assert.That(wave9.Validation.enemies, Has.Length.EqualTo(1));
        }

        [Test]
        public void BudgetAdmissionFillsDeficitWithinBatchLimit()
        {
            ResolvedWavePlan plan = new WavePlanResolver(_waves).Resolve(1);

            BudgetAdmission admission = BudgetAdmission.Calculate(plan, 60, 0);

            Assert.That(admission.NormalTarget, Is.EqualTo(7f));
            Assert.That(admission.InEndSprint, Is.False);
            Assert.That(admission.Capacity, Is.EqualTo(24));
            Assert.That(admission.Deficit, Is.EqualTo(7));
            Assert.That(admission.SpawnCount, Is.EqualTo(6));
        }

        [Test]
        public void BudgetAdmissionUsesEndSprintMultiplier()
        {
            var plan = new ResolvedWavePlan(
                RunStage.Build,
                20,
                10f,
                1f,
                4,
                40,
                3f,
                2f);

            BudgetAdmission admission = BudgetAdmission.Calculate(plan, 8, 5);

            Assert.That(admission.InEndSprint, Is.True);
            Assert.That(admission.EffectiveTarget, Is.EqualTo(20));
            Assert.That(admission.SpawnCount, Is.EqualTo(4));
        }

        [Test]
        public void FirstBudgetCheckSpawnsConfiguredBatch()
        {
            var waveSystem = new WaveSystem(_waves, _factory);
            waveSystem.StartNextWave(_state);

            waveSystem.Step(_state, 0.4f);

            Assert.That(_state.Enemies, Has.Count.EqualTo(6));
            Assert.That(_state.SpawnLeft, Is.EqualTo(54));
            Assert.That(_state.LastSpawnCheckCount, Is.EqualTo(6));
        }

        [Test]
        public void BossCurvesIntoContactAndDealsPulseDamage()
        {
            _state.BeginWave(1);
            EnemyState boss = _factory.SpawnWaveBoss(_state);
            boss.Position = new Float2(
                _combat.turret.x + _enemies.bossBehavior.contactDistance + 1f,
                _combat.turret.y);
            var combat = new CombatSystem(_combat, _enemies);

            combat.StepEnemies(_state, 1f);

            Assert.That(boss.BossPhase, Is.EqualTo(BossPhase.Contact));
            Assert.That(
                Float2.Distance(
                    boss.Position,
                    new Float2(_combat.turret.x, _combat.turret.y)),
                Is.EqualTo(_enemies.bossBehavior.contactDistance).Within(0.001f));

            boss.ContactTickRemaining = 0.1f;
            combat.StepEnemies(_state, 0.11f);

            Assert.That(_state.Hp, Is.EqualTo(93f).Within(0.001f));
        }

        [Test]
        public void SlowReducesBossApproachSpeed()
        {
            _state.BeginWave(1);
            EnemyState boss = _factory.SpawnWaveBoss(_state);
            boss.Position = new Float2(
                _combat.turret.x + 300f,
                _combat.turret.y);
            boss.SlowRatio = 0.5f;
            boss.SlowRemaining = 2f;
            var combat = new CombatSystem(_combat, _enemies);

            combat.StepEnemies(_state, 1f);

            float expectedDistance = 300f - boss.Speed * 0.5f;
            Assert.That(
                Float2.Distance(
                    boss.Position,
                    new Float2(_combat.turret.x, _combat.turret.y)),
                Is.EqualTo(expectedDistance).Within(0.001f));
        }

        [Test]
        public void HardControlPausesBossContactDamage()
        {
            _state.BeginWave(1);
            EnemyState boss = _factory.SpawnWaveBoss(_state);
            boss.BossPhase = BossPhase.Contact;
            boss.Position = new Float2(
                _combat.turret.x + _enemies.bossBehavior.contactDistance,
                _combat.turret.y);
            boss.ContactTickRemaining = 0.1f;
            boss.FrozenRemaining = 1f;
            var combat = new CombatSystem(_combat, _enemies);

            combat.StepEnemies(_state, 0.2f);

            Assert.That(_state.Hp, Is.EqualTo(_state.MaxHp));
            Assert.That(boss.ContactTickRemaining, Is.EqualTo(0.1f));
        }

        [Test]
        public void LethalContactRetaliationKillsBossBeforePlayerDamage()
        {
            _state.BeginWave(1);
            CardState thorns = _state.CreateCard("thorns", 3);
            _state.Equipment[0] = thorns;
            EnemyState boss = _factory.SpawnWaveBoss(_state);
            boss.Hp = 1f;
            boss.BossPhase = BossPhase.Contact;
            boss.Position = new Float2(
                _combat.turret.x + _enemies.bossBehavior.contactDistance,
                _combat.turret.y);
            boss.ContactTickRemaining = 0.1f;
            var combat = new CombatSystem(_combat, _enemies);

            combat.StepEnemies(_state, 0.11f);

            Assert.That(_state.Enemies.Contains(boss), Is.False);
            Assert.That(_state.Hp, Is.EqualTo(_state.MaxHp));
        }

        [Test]
        public void BossUsesWebBaselineValues()
        {
            Assert.That(_enemies.types.boss.contactDps, Is.EqualTo(14f));
            Assert.That(_enemies.bossBehavior.curveStrength, Is.EqualTo(0.65f));
            Assert.That(_enemies.bossBehavior.contactDistance, Is.EqualTo(48f));
            Assert.That(_enemies.bossBehavior.contactTickInterval, Is.EqualTo(0.5f));
        }

        [Test]
        public void JumpToWaveClearsTransientCombatAndPreservesBuild()
        {
            CardState equipped = _state.CreateCard("pierce", 3);
            _state.Equipment[0] = equipped;
            _state.BeginWave(4);
            _state.Enemies.Add(new EnemyState(
                99,
                EnemyKind.Normal,
                new Float2(10f, 10f),
                20f,
                10f,
                16f,
                8f));
            _state.Bullets.Add(new BulletState(
                99,
                new Float2(10f, 10f),
                new Float2(1f, 0f),
                4f,
                1f,
                18f));
            var waveSystem = new WaveSystem(_waves, _factory);

            waveSystem.JumpToWave(_state, 9);

            Assert.That(_state.Wave, Is.EqualTo(9));
            Assert.That(_state.WavePhase, Is.EqualTo(WavePhase.Regular));
            Assert.That(_state.Equipment[0], Is.SameAs(equipped));
            Assert.That(_state.Bullets, Is.Empty);
            Assert.That(_state.Enemies, Has.Count.EqualTo(1));
            Assert.That(
                _state.Enemies[0].SpawnKind,
                Is.EqualTo(EnemySpawnKind.ValidationElite));
            Assert.That(_state.DecisionLocked, Is.False);
        }

        [Test]
        public void RestartWaveRebuildsCurrentWavePlan()
        {
            var waveSystem = new WaveSystem(_waves, _factory);
            _state.BeginWave(4);
            _state.Enemies.Add(new EnemyState(
                99,
                EnemyKind.Normal,
                new Float2(10f, 10f),
                20f,
                10f,
                16f,
                8f));

            waveSystem.RestartWave(_state);

            Assert.That(_state.Wave, Is.EqualTo(4));
            Assert.That(_state.Enemies, Is.Empty);
            Assert.That(
                _state.SpawnLeft,
                Is.EqualTo(new WavePlanResolver(_waves).Resolve(4).Quota));
            Assert.That(_state.SpawnTimer, Is.EqualTo(_waves.firstSpawnDelay));
        }

        [Test]
        public void DeveloperToolsControlInvincibilityAndWaveNavigation()
        {
            var waveSystem = new WaveSystem(_waves, _factory);
            var simulation = new GameSimulation(_state, _combat);
            var tools = new DeveloperToolsSystem(
                _state,
                simulation,
                waveSystem,
                42,
                true);

            tools.ToggleVisible();
            tools.SetInvincible(true);
            tools.SetTimeScale(2f);
            tools.JumpToWave(9);

            Assert.That(tools.Visible, Is.True);
            Assert.That(tools.Seed, Is.EqualTo(42));
            Assert.That(_state.Invincible, Is.True);
            Assert.That(simulation.TimeScale, Is.EqualTo(2f));
            Assert.That(_state.Wave, Is.EqualTo(9));
        }

        [Test]
        public void DisabledDeveloperToolsIgnoreMutatingCommands()
        {
            var waveSystem = new WaveSystem(_waves, _factory);
            var simulation = new GameSimulation(_state, _combat);
            var tools = new DeveloperToolsSystem(
                _state,
                simulation,
                waveSystem,
                7,
                false);

            tools.ToggleVisible();
            tools.SetInvincible(true);
            tools.SetTimeScale(2f);
            tools.JumpToWave(9);

            Assert.That(tools.Visible, Is.False);
            Assert.That(_state.Invincible, Is.False);
            Assert.That(simulation.TimeScale, Is.EqualTo(1f));
            Assert.That(_state.Wave, Is.Zero);
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
