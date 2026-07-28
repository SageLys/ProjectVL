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
        public void BossUsesWebBaselineValues()
        {
            Assert.That(_enemies.types.boss.contactDps, Is.EqualTo(14f));
            Assert.That(_enemies.bossBehavior.curveStrength, Is.EqualTo(0.65f));
            Assert.That(_enemies.bossBehavior.contactDistance, Is.EqualTo(48f));
            Assert.That(_enemies.bossBehavior.contactTickInterval, Is.EqualTo(0.5f));
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
