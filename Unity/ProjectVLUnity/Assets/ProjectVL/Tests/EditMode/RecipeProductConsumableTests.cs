using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class RecipeProductConsumableTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private int _nextEnemyId;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
            _nextEnemyId = 1;
        }

        [Test]
        public void StormLatticeUsesCompiledPierceAndLineZone()
        {
            GameState state = CreateState();
            var combat = new CombatSystem(_combat, _enemies);

            Assert.That(
                combat.CastConsumable(
                    state,
                    state.CreateCard("stormLattice", 6),
                    new Float2(280f, 300f)),
                Is.True);

            Assert.That(state.Bullets, Has.Count.EqualTo(1));
            Assert.That(state.Bullets[0].Radius, Is.EqualTo(26f));
            Assert.That(state.Bullets[0].PierceRemaining, Is.EqualTo(999));
            Assert.That(state.GroundZones, Has.Count.EqualTo(1));
            Assert.That(state.GroundZones[0].Shape, Is.EqualTo("line"));
            Assert.That(state.GroundZones[0].Radius, Is.EqualTo(130f));
            Assert.That(
                state.GroundZones[0].VulnerableRatio,
                Is.EqualTo(0.25f).Within(0.001f));
        }

        [Test]
        public void ThunderRimeBuildsAuthoredNestedDamageAndControlZone()
        {
            GameState state = CreateState();
            var combat = new CombatSystem(_combat, _enemies);

            combat.CastConsumable(
                state,
                state.CreateCard("thunderRime", 6),
                new Float2(250f, 250f));

            GroundZoneState zone = state.GroundZones[0];
            Assert.That(zone.Radius, Is.EqualTo(110f));
            Assert.That(zone.LifeRemaining, Is.EqualTo(5f));
            Assert.That(
                zone.DamagePerTick,
                Is.EqualTo(_combat.defaults.damage));
            Assert.That(zone.SlowRatio, Is.EqualTo(0.3f));
            Assert.That(zone.VulnerableRatio, Is.EqualTo(0.2f));
        }

        [Test]
        public void RimeShellExecutesMortarFreezeAndDotFromCompiledAtoms()
        {
            GameState state = CreateState();
            EnemyState enemy = AddEnemy(
                state,
                new Float2(250f, 250f),
                100f);
            var combat = new CombatSystem(_combat, _enemies);

            combat.CastConsumable(
                state,
                state.CreateCard("rimeShell", 6),
                enemy.Position);

            Assert.That(
                enemy.Hp,
                Is.EqualTo(
                    100f - _combat.defaults.damage * 2f).Within(0.001f));
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(1f));
            Assert.That(
                enemy.DotDamagePerTick,
                Is.EqualTo(
                    _combat.defaults.damage * 0.2f).Within(0.001f));
            Assert.That(enemy.DotRemaining, Is.EqualTo(5f));
        }

        [Test]
        public void SteamBurstFansOutOnlyAcrossDualStatusTargets()
        {
            GameState state = CreateState();
            EnemyState matching = AddEnemy(
                state,
                new Float2(250f, 250f),
                100f);
            EnemyState other = AddEnemy(
                state,
                new Float2(270f, 250f),
                100f);
            matching.SlowRemaining = 2f;
            matching.DotRemaining = 2f;
            var combat = new CombatSystem(_combat, _enemies);

            combat.CastConsumable(
                state,
                state.CreateCard("steamBurst", 6),
                new Float2(250f, 250f));

            Assert.That(
                matching.Hp,
                Is.EqualTo(
                    100f - _combat.defaults.damage * 1.3f).Within(0.001f));
            Assert.That(other.Hp, Is.EqualTo(100f));
        }

        [Test]
        public void CrystalRelayUsesItsOwnSummonParameters()
        {
            GameState state = CreateState();
            var combat = new CombatSystem(_combat, _enemies);

            combat.CastConsumable(
                state,
                state.CreateCard("crystalRelay", 6),
                new Float2(240f, 260f));

            Assert.That(state.DecoyActive, Is.True);
            Assert.That(state.SecondaryDecoyActive, Is.True);
            Assert.That(state.DecoyHp, Is.EqualTo(65f));
            Assert.That(state.DecoyLifeRemaining, Is.EqualTo(5f));
            Assert.That(state.DecoyIsMirrorTurret, Is.True);
        }

        private GameState CreateState()
        {
            return GameStateFactory.Create(_combat);
        }

        private EnemyState AddEnemy(
            GameState state,
            Float2 position,
            float hp)
        {
            var enemy = new EnemyState(
                _nextEnemyId++,
                EnemyKind.Normal,
                position,
                hp,
                10f,
                8f,
                1f);
            state.Enemies.Add(enemy);
            return enemy;
        }
    }
}
