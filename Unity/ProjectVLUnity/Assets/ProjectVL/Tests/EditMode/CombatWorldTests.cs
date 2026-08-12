using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CombatWorldTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private WavesConfig _waves;
        private GameState _state;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
            _waves = GameConfigLoader.LoadWaves();
            _state = GameStateFactory.Create(_combat);
            _state.StartRun();
        }

        [Test]
        public void FirstWaveUsesWebEnemyCountFormula()
        {
            var factory = new EnemyFactory(
                _combat,
                _enemies,
                _waves,
                new ConstantRandomSource(0.5f));
            var waves = new WaveSystem(_waves, factory);

            waves.StartNextWave(_state);

            Assert.That(_state.Wave, Is.EqualTo(1));
            Assert.That(_state.SpawnLeft, Is.EqualTo(60));
            Assert.That(_state.SpawnTimer, Is.EqualTo(0.4f).Within(0.00001f));
        }

        [Test]
        public void TurretTargetsNearestEnemyInsideRange()
        {
            var combat = new CombatSystem(_combat, _enemies);
            _state.Enemies.Add(CreateEnemy(1, 100f, 0f));
            _state.Enemies.Add(CreateEnemy(2, 50f, 0f));

            EnemyState target = combat.FindTarget(_state);

            Assert.That(target.Id, Is.EqualTo(2));
        }

        [Test]
        public void ProjectileDamagesAndKillsEnemy()
        {
            var combat = new CombatSystem(_combat, _enemies);
            EnemyState enemy = CreateEnemy(1, 100f, 0f, hp: 18f);
            _state.Enemies.Add(enemy);

            combat.StepTurret(_state, 0.01f);
            combat.StepBullets(_state, 0.17f);

            Assert.That(_state.Enemies, Is.Empty);
            Assert.That(_state.Bullets, Is.Empty);
            Assert.That(_state.Kills, Is.EqualTo(1));
        }

        [Test]
        public void RegularEnemyKillCreatesGroundCardWhenDropRollSucceeds()
        {
            var economy = new EconomyConfig();
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource(0.1f));
            var combat = new CombatSystem(_combat, _enemies, drops);
            EnemyState enemy = CreateEnemy(1, 100f, 0f, hp: 18f);
            _state.Enemies.Add(enemy);

            combat.StepTurret(_state, 0.01f);
            combat.StepBullets(_state, 0.17f);

            Assert.That(_state.GroundDrops.Count, Is.EqualTo(1));
            Assert.That(_state.GroundDrops[0].Position, Is.EqualTo(enemy.Position));
            Assert.That(_state.GroundDrops[0].Star, Is.EqualTo(1));
            Assert.That(
                _state.GroundDrops[0].LifeRemaining,
                Is.EqualTo(5f));
        }

        [Test]
        public void OrdinaryDropBudgetAccruesByTimeAndSpendsOnKill()
        {
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource(0f),
                null,
                null,
                _waves);
            _state.BeginWave(1);

            drops.TickOrdinaryDropBudget(_state, 60f / 35f);
            GroundDropState drop = drops.TrySpawnOnKill(
                _state,
                CreateEnemy(1, 100f, 100f));

            Assert.That(economy.ordinaryDropRate.enabled, Is.True);
            Assert.That(drop, Is.Not.Null);
            Assert.That(_state.OrdinaryDropCredit, Is.EqualTo(0f).Within(0.001f));
            Assert.That(_state.OrdinaryDropsShownThisWave, Is.EqualTo(1));
            Assert.That(_state.OrdinaryDropEligibleKillsThisWave, Is.EqualTo(1));
        }

        [Test]
        public void ValidationStageDoesNotAccrueOrSpendOrdinaryDrops()
        {
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource(0f),
                null,
                null,
                _waves);
            _state.BeginWave(9);

            drops.TickOrdinaryDropBudget(_state, 10f);
            GroundDropState drop = drops.TrySpawnOnKill(
                _state,
                CreateEnemy(1, 100f, 100f));

            Assert.That(_state.OrdinaryDropCredit, Is.Zero);
            Assert.That(drop, Is.Null);
            Assert.That(_state.OrdinaryDropEligibleKillsThisWave, Is.Zero);
        }

        [Test]
        public void GroundCardCanBeCollectedIntoHand()
        {
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.5f));
            GroundDropState drop = drops.SpawnTestDrop(
                _state,
                new Float2(300f, 240f));

            DropCollectResult result = drops.CollectNearest(
                _state,
                drop.Position);

            Assert.That(result, Is.EqualTo(DropCollectResult.Collected));
            Assert.That(_state.GroundDrops, Is.Empty);
            Assert.That(_state.Hand[0], Is.Not.Null);
            Assert.That(_state.Hand[0].Star, Is.EqualTo(1));
            Assert.That(_state.Hand[0].Type, Is.EqualTo(drop.CardType));
        }

        [Test]
        public void FullHandKeepsGroundCardAvailable()
        {
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.5f));
            for (int index = 0; index < _state.Hand.Length; index++)
            {
                _state.Hand[index] = _state.CreateCard($"full-{index}", 1);
            }

            GroundDropState drop = drops.SpawnTestDrop(
                _state,
                new Float2(300f, 240f));

            DropCollectResult result = drops.CollectNearest(
                _state,
                drop.Position);

            Assert.That(result, Is.EqualTo(DropCollectResult.HandFull));
            Assert.That(_state.GroundDrops.Count, Is.EqualTo(1));
        }

        [Test]
        public void GroundCardExpiresAfterConfiguredLifetime()
        {
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.5f));
            drops.SpawnTestDrop(_state, new Float2(300f, 240f));

            drops.Step(_state, 5.01f);

            Assert.That(_state.GroundDrops, Is.Empty);
        }

        [Test]
        public void EnemyBreachReducesPlayerHealth()
        {
            var combat = new CombatSystem(_combat, _enemies);
            EnemyState enemy = CreateEnemy(1, 49f, 0f, damage: 8f, speed: 26f);
            _state.Enemies.Add(enemy);

            combat.StepEnemies(_state, 0.1f);

            Assert.That(_state.Enemies, Is.Empty);
            Assert.That(_state.Hp, Is.EqualTo(92f));
        }

        [Test]
        public void EnemyConfigMatchesWebBaseline()
        {
            EnemyTypeConfig normal = _enemies.types.normal;
            EnemyTypeConfig tank = _enemies.types.tank;
            EnemyTypeConfig boss = _enemies.types.boss;

            Assert.That(normal.hpBase, Is.EqualTo(38f));
            Assert.That(normal.hpPerWave, Is.EqualTo(12f));
            Assert.That(normal.speedBase, Is.EqualTo(24f));
            Assert.That(normal.sides, Is.EqualTo(4));
            Assert.That(tank.knockbackResist, Is.EqualTo(0.4f));
            Assert.That(tank.ccResist, Is.EqualTo(0.25f));
            Assert.That(boss.knockbackResist, Is.EqualTo(0.85f));
            Assert.That(boss.ccResist, Is.EqualTo(0.5f));
            Assert.That(_waves.typeRoll.fastThreshold, Is.EqualTo(0.47f));
        }

        [Test]
        public void SpawnedEnemiesCarryTheirConfiguredArchetype()
        {
            var factory = new EnemyFactory(
                _combat,
                _enemies,
                _waves,
                new ConstantRandomSource(0f));
            _state.BeginWave(1);

            EnemyState tank = factory.SpawnRegular(_state);
            EnemyState boss = factory.SpawnWaveBoss(_state);

            Assert.That(tank.Kind, Is.EqualTo(EnemyKind.Tank));
            Assert.That(tank.Label, Is.EqualTo(_enemies.types.tank.label));
            Assert.That(tank.Color, Is.EqualTo(_enemies.types.tank.color));
            Assert.That(tank.Sides, Is.EqualTo(6));
            Assert.That(tank.KnockbackResist, Is.EqualTo(0.4f));
            Assert.That(tank.CcResist, Is.EqualTo(0.25f));
            Assert.That(boss.Sides, Is.EqualTo(8));
            Assert.That(boss.KnockbackResist, Is.EqualTo(0.85f));
            Assert.That(boss.CcResist, Is.EqualTo(0.5f));
        }

        [Test]
        public void EnemyResistanceScalesHardControlAndKnockback()
        {
            var tank = new EnemyState(
                1,
                EnemyKind.Tank,
                new Float2(10f, 0f),
                100f,
                10f,
                22f,
                14f,
                knockbackResist: 0.4f,
                ccResist: 0.25f);

            tank.FrozenRemaining = 2f;
            bool movedWhileFrozen = tank.ApplyKnockback(
                new Float2(1f, 0f),
                100f,
                120f);

            Assert.That(tank.FrozenRemaining, Is.EqualTo(1.5f));
            Assert.That(movedWhileFrozen, Is.False);
            tank.FrozenRemaining = 0f;
            tank.StunnedRemaining = 1f;
            bool moved = tank.ApplyKnockback(
                new Float2(1f, 0f),
                200f,
                120f);

            Assert.That(tank.StunnedRemaining, Is.EqualTo(0.75f));
            Assert.That(moved, Is.True);
            Assert.That(tank.Position.X, Is.EqualTo(82f));
        }

        [Test]
        public void ValidationResistanceOverridesEnemyArchetype()
        {
            var elite = new EnemyState(
                1,
                EnemyKind.Tank,
                new Float2(0f, 0f),
                100f,
                10f,
                22f,
                14f,
                knockbackResist: 0.4f,
                ccResist: 0.25f,
                knockbackResistOverride: 0.8f,
                ccResistOverride: 0.7f);

            elite.FrozenRemaining = 2f;
            elite.FrozenRemaining = 0f;
            elite.StunnedRemaining = 1f;
            elite.ApplyKnockback(
                new Float2(1f, 0f),
                100f,
                120f);

            Assert.That(elite.StunnedRemaining, Is.EqualTo(0.3f).Within(0.0001f));
            Assert.That(elite.Position.X, Is.EqualTo(20f).Within(0.0001f));
        }

        private EnemyState CreateEnemy(
            int id,
            float offsetX,
            float offsetY,
            float hp = 50f,
            float damage = 8f,
            float speed = 0f)
        {
            return new EnemyState(
                id,
                EnemyKind.Normal,
                new Float2(
                    _combat.turret.x + offsetX,
                    _combat.turret.y + offsetY),
                hp,
                speed,
                16f,
                damage);
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
