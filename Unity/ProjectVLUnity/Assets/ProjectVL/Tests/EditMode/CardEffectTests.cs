using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardEffectTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private GameState _state;
        private CombatSystem _system;
        private int _nextEnemyId;
        private int _nextBulletId;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
            _state = GameStateFactory.Create(_combat);
            _system = new CombatSystem(_combat, _enemies);
            _nextEnemyId = 1;
            _nextBulletId = 1;
        }

        [Test]
        public void PierceRouteUsesWebParameters()
        {
            EquipResolved("pierce", 3, "3:pierceB");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.PierceCount, Is.EqualTo(1));
            Assert.That(profile.PierceDamageRetention, Is.EqualTo(0.9f));
            Assert.That(profile.RampPerPierce, Is.EqualTo(0.3f));
        }

        [Test]
        public void ChainRouteUsesWebParameters()
        {
            EquipResolved(
                "chainLightning",
                3,
                "3:chainLightningA");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.ChainBounces, Is.EqualTo(2));
            Assert.That(profile.ChainDamageRetention, Is.EqualTo(0.7f));
            Assert.That(profile.ChainSearchRange, Is.EqualTo(120f));
            Assert.That(profile.SlowRatio, Is.EqualTo(0.2f));
            Assert.That(profile.SlowDuration, Is.EqualTo(1.2f));
        }

        [Test]
        public void FrostFocusRouteFreezesOnSecondHit()
        {
            EquipResolved("frost", 3, "3:frostB");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);
            HitWithProfile(enemy.Position, profile);

            Assert.That(enemy.SlowRatio, Is.EqualTo(0.3f));
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(0.8f));
            Assert.That(enemy.FreezeStacks, Is.Zero);
        }

        [Test]
        public void ChainLightningDamagesNearbyTargets()
        {
            EquipResolved(
                "chainLightning",
                3,
                "3:chainLightningA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState primary = AddEnemy(new Float2(200f, 200f), 100f);
            EnemyState secondary = AddEnemy(new Float2(250f, 200f), 100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(primary.Hp, Is.EqualTo(90f));
            Assert.That(secondary.Hp, Is.EqualTo(93f).Within(0.001f));
            Assert.That(secondary.SlowRemaining, Is.EqualTo(1.2f));
        }

        [Test]
        public void PierceBulletSurvivesItsFirstHit()
        {
            EquipResolved("pierce", 3, "3:pierceA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);

            Assert.That(enemy.Hp, Is.EqualTo(90f));
            Assert.That(_state.Bullets, Has.Count.EqualTo(1));
            Assert.That(_state.Bullets[0].PierceRemaining, Is.EqualTo(1));
            Assert.That(_state.Bullets[0].Damage, Is.EqualTo(8.8f).Within(0.001f));
        }

        [Test]
        public void SlowReducesEnemyMovementUntilItExpires()
        {
            EnemyState enemy = AddEnemy(new Float2(100f, 100f), 100f);
            enemy.SlowRatio = 0.3f;
            enemy.SlowRemaining = 1.5f;
            Float2 before = enemy.Position;

            _system.StepEnemies(_state, 0.1f);

            float moved = Float2.Distance(before, enemy.Position);
            Assert.That(
                moved,
                Is.EqualTo(enemy.Speed * 0.7f * 0.1f).Within(0.001f));
        }

        [Test]
        public void ScorchAppliesDamageOverTime()
        {
            EquipResolved("scorch", 3, "3:scorchA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);
            _system.StepEnemies(_state, 0.5f);

            Assert.That(enemy.DotRemaining, Is.GreaterThan(0f));
            Assert.That(enemy.Hp, Is.EqualTo(88.5f).Within(0.001f));
        }

        [Test]
        public void SplitBlastDamagesNearbySecondaryTargets()
        {
            EquipResolved("splitBlast", 3, "3:splitBlastA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState primary = AddEnemy(new Float2(200f, 200f), 100f);
            EnemyState secondary = AddEnemy(new Float2(225f, 200f), 100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(primary.Hp, Is.EqualTo(90f));
            Assert.That(secondary.Hp, Is.LessThan(90f));
        }

        [Test]
        public void ImpactKnocksTargetAwayFromTurret()
        {
            EquipResolved("impact", 3, "3:impactA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            Float2 turret = new Float2(_combat.turret.x, _combat.turret.y);
            EnemyState enemy = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            float before = Float2.Distance(turret, enemy.Position);

            HitWithProfile(enemy.Position, profile);

            Assert.That(
                Float2.Distance(turret, enemy.Position),
                Is.EqualTo(before + 22f).Within(0.001f));
        }

        [Test]
        public void SanctumAuraSlowsAndExposesNearbyEnemies()
        {
            EquipResolved("sanctum", 3, "3:sanctumB");
            _state.BeginWave(1);
            EnemyState enemy = AddEnemy(
                new Float2(_combat.turret.x + 40f, _combat.turret.y),
                100f);

            _system.StepPassives(_state, 0.1f);

            Assert.That(enemy.SlowRatio, Is.EqualTo(0.25f));
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.2f));
        }

        [Test]
        public void AegisShieldAbsorbsConfiguredBreachHits()
        {
            EquipResolved("aegis", 3, "3:aegisA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            float hpBefore = _state.Hp;
            AddEnemy(
                new Float2(_combat.turret.x, _combat.turret.y),
                100f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.Hp, Is.EqualTo(hpBefore));
            Assert.That(_state.ShieldHits, Is.EqualTo(1));
        }

        [Test]
        public void ThornsRouteReducesBreachDamage()
        {
            EquipResolved("thorns", 3, "3:thornsA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            float hpBefore = _state.Hp;
            AddEnemy(
                new Float2(_combat.turret.x, _combat.turret.y),
                100f,
                10f);

            _system.StepEnemies(_state, 0f);

            Assert.That(
                _state.Hp,
                Is.EqualTo(hpBefore - 6.5f).Within(0.001f));
        }

        [Test]
        public void DecoySpawnsAtWaveStartAndTakesEnemyHit()
        {
            EquipResolved("decoy", 3, "3:decoyA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            EnemyState enemy = AddEnemy(
                _state.DecoyPosition + new Float2(5f, 0f),
                100f,
                12f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(48f));
            Assert.That(_state.Enemies.Contains(enemy), Is.False);
        }

        [Test]
        public void HarvestRouteExposesWebDropMultipliers()
        {
            EquipResolved("harvest", 3, "3:harvestA");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            _system.StepPassives(_state, 0f);

            Assert.That(profile.DropRateMultiplier, Is.EqualTo(1.25f));
            Assert.That(profile.DropLifetimeMultiplier, Is.EqualTo(1.25f));
            Assert.That(_state.DropRateMultiplier, Is.EqualTo(1.25f));
            Assert.That(_state.DropLifetimeMultiplier, Is.EqualTo(1.25f));
        }

        private void EquipResolved(
            string type,
            int star,
            params string[] paths)
        {
            CardState card = _state.CreateCard(type, star);
            card.EvolutionPath.AddRange(paths);
            _state.Equipment[0] = card;
        }

        private EnemyState AddEnemy(
            Float2 position,
            float hp,
            float damage = 1f)
        {
            var enemy = new EnemyState(
                _nextEnemyId++,
                EnemyKind.Normal,
                position,
                hp,
                10f,
                8f,
                damage);
            _state.Enemies.Add(enemy);
            return enemy;
        }

        private void HitWithProfile(
            Float2 position,
            CardCombatProfile profile)
        {
            _state.Bullets.Add(new BulletState(
                _nextBulletId++,
                position,
                new Float2(),
                5f,
                1f,
                10f,
                profile));
            _system.StepBullets(_state, 0f);
        }
    }
}
