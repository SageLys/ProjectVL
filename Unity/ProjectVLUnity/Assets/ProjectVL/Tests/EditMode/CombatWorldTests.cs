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

            Assert.That(normal.hpBase, Is.EqualTo(38f));
            Assert.That(normal.hpPerWave, Is.EqualTo(12f));
            Assert.That(normal.speedBase, Is.EqualTo(24f));
            Assert.That(_waves.typeRoll.fastThreshold, Is.EqualTo(0.47f));
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
