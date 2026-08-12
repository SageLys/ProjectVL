using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class RelicScalingTests
    {
        private GameState _state;
        private CombatConfig _combat;
        private CombatSystem _combatSystem;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _state = GameStateFactory.Create(_combat);
            _combatSystem = new CombatSystem(
                _combat,
                GameConfigLoader.LoadEnemies());
        }

        [Test]
        public void MultiTagCardUsesStrongestRelicTagWithoutAddingBoth()
        {
            Equip("splitBlast", 3);
            CardCombatProfile baseline = CardEffectResolver.Resolve(_state);
            _state.RelicScaling["projectile:effectDamageMul"] = 0.15f;
            _state.RelicScaling["domain:effectDamageMul"] = 0.25f;

            CardCombatProfile scaled = CardEffectResolver.Resolve(_state);

            Assert.That(
                RelicScalingSystem.ForCard(
                    _state,
                    "splitBlast",
                    "effectDamageMul"),
                Is.EqualTo(0.25f));
            Assert.That(
                scaled.SplitDamageRatio,
                Is.EqualTo(baseline.SplitDamageRatio * 1.25f)
                    .Within(0.0001f));
        }

        [Test]
        public void ProjectileQuantityRelicAddsWholeDerivedCount()
        {
            Equip("pierce", 3);
            CardCombatProfile baseline = CardEffectResolver.Resolve(_state);
            _state.RelicScaling["projectile:quantityAdd"] = 1f;

            CardCombatProfile scaled = CardEffectResolver.Resolve(_state);

            Assert.That(
                scaled.PierceCount,
                Is.EqualTo(baseline.PierceCount + 1));
        }

        [Test]
        public void ControlAndAreaRelicsScaleExistingFrostEffects()
        {
            Equip("frost", 6);
            CardCombatProfile baseline = CardEffectResolver.Resolve(_state);
            _state.RelicScaling["control:controlPotencyMul"] = 0.2f;
            _state.RelicScaling["control:areaScaleMul"] = 0.2f;

            CardCombatProfile scaled = CardEffectResolver.Resolve(_state);

            Assert.That(
                scaled.FrostAuraSlowRatio,
                Is.EqualTo(baseline.FrostAuraSlowRatio * 1.2f)
                    .Within(0.0001f));
            Assert.That(
                scaled.FrostAuraRadiusRatio,
                Is.EqualTo(baseline.FrostAuraRadiusRatio * 1.2f)
                    .Within(0.0001f));
        }

        [Test]
        public void UtilityRelicsOnlyScaleUtilityAtomsThatExist()
        {
            Equip("harvest", 3, "3:harvestA");
            CardCombatProfile baseline = CardEffectResolver.Resolve(_state);
            _state.RelicScaling["utility:dropRateMul"] = 0.1f;
            _state.RelicScaling["utility:dropLifetimeMul"] = 0.12f;
            _state.RelicScaling["utility:xpMul"] = 0.15f;

            CardCombatProfile scaled = CardEffectResolver.Resolve(_state);

            Assert.That(
                scaled.DropRateMultiplier,
                Is.EqualTo(baseline.DropRateMultiplier * 1.1f)
                    .Within(0.0001f));
            Assert.That(
                scaled.DropLifetimeMultiplier,
                Is.EqualTo(baseline.DropLifetimeMultiplier * 1.12f)
                    .Within(0.0001f));
            Assert.That(scaled.XpMultiplier, Is.EqualTo(1f));
        }

        [Test]
        public void ControlledDamageBonusUsesStrongestTagGlobally()
        {
            _state.RelicScaling["control:controlledDamageTakenMul"] = 0.1f;
            _state.RelicScaling["projectile:controlledDamageTakenMul"] = 0.15f;

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(
                profile.ControlledDamageTakenBonus,
                Is.EqualTo(0.15f));
        }

        [Test]
        public void DefenseRelicScalesShieldDurability()
        {
            Equip("aegis", 3);
            CardCombatProfile baseline = CardEffectResolver.Resolve(_state);
            _state.RelicScaling["defense:defenseDurabilityMul"] = 0.25f;

            CardCombatProfile scaled = CardEffectResolver.Resolve(_state);

            Assert.That(
                scaled.ShieldHits,
                Is.EqualTo((int)System.Math.Ceiling(
                    baseline.ShieldHits * 1.25f)));
        }

        [Test]
        public void ActiveFrostUsesRelicAreaScaling()
        {
            _state.RelicScaling["control:areaScaleMul"] = 0.2f;
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(150f, 0f),
                100f,
                0f,
                8f,
                0f);
            _state.Enemies.Add(enemy);
            CardState frost = _state.CreateCard("frost", 3);

            Assert.That(
                _combatSystem.CastConsumable(
                    _state,
                    frost,
                    new Float2()),
                Is.True);
            Assert.That(enemy.FrozenRemaining, Is.GreaterThan(0f));
        }

        [Test]
        public void ActiveAegisUsesRelicDurabilityScaling()
        {
            _state.RelicScaling["defense:defenseDurabilityMul"] = 0.25f;
            CardState aegis = _state.CreateCard("aegis", 1);

            _combatSystem.CastConsumable(
                _state,
                aegis,
                new Float2());

            Assert.That(_state.ShieldMaxHits, Is.EqualTo(5));
            Assert.That(_state.ShieldHits, Is.EqualTo(5));
        }

        [Test]
        public void ControlledEnemyTakesGlobalRelicBonus()
        {
            _state.RelicScaling["control:controlledDamageTakenMul"] = 0.1f;
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(),
                1000f,
                0f,
                8f,
                0f)
            {
                SlowRemaining = 1f,
                SlowRatio = 0.2f
            };
            _state.Enemies.Add(enemy);
            CardState blast = _state.CreateCard("splitBlast", 1);

            _combatSystem.CastConsumable(
                _state,
                blast,
                new Float2());

            float expectedDamage = _combat.defaults.damage * 4f * 1.1f;
            Assert.That(
                enemy.Hp,
                Is.EqualTo(1000f - expectedDamage).Within(0.0001f));
        }

        private void Equip(
            string type,
            int star,
            params string[] evolutionPaths)
        {
            CardState card = _state.CreateCard(type, star);
            card.EvolutionPath.AddRange(evolutionPaths);
            _state.Equipment[0] = card;
        }
    }
}
