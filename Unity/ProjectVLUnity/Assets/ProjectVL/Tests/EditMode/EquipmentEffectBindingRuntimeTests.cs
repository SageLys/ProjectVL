using System.Linq;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class EquipmentEffectBindingRuntimeTests
    {
        [Test]
        public void ResolvesBindingsInCanonicalSourceOrderAcrossSlots()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            CardState volcano = state.CreateCard("volcanoCore", 6);
            CardState crystal = state.CreateCard("crystalRelay", 6);
            state.Equipment[0] = volcano;
            state.Equipment[2] = crystal;

            RuntimeEquipmentBinding[] first =
                EquipmentEffectBindingRuntime.Resolve(state).ToArray();
            state.Equipment[0] = crystal;
            state.Equipment[2] = volcano;
            RuntimeEquipmentBinding[] swapped =
                EquipmentEffectBindingRuntime.Resolve(state).ToArray();

            Assert.That(
                swapped.Select(item => item.SourceKey),
                Is.EqualTo(first.Select(item => item.SourceKey)));
            Assert.That(first[0].Card.Type, Is.EqualTo("crystalRelay"));
            Assert.That(first[^1].Card.Type, Is.EqualTo("volcanoCore"));
        }

        [Test]
        public void PreservesNestedAtomsAndOriginalBindingIndex()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            CardState card = state.CreateCard("volcanoCore", 6);
            state.Equipment[0] = card;

            RuntimeEquipmentBinding binding =
                EquipmentEffectBindingRuntime.Resolve(state, "onKill")
                    .Single();

            Assert.That(binding.BindingIndex, Is.EqualTo(2));
            Assert.That(binding.SourceKey, Is.EqualTo(
                "volcanoCore/" + card.Id + "/2"));
            Assert.That(binding.Binding.effects[0].atom, Is.EqualTo("charge"));
            Assert.That(
                binding.Binding.effects[0].children.Select(atom => atom.atom),
                Is.EqualTo(new[] { "mortarMorph", "groundZone" }));
        }

        [Test]
        public void ResolvesLegacyFiveStarRouteToCompiledOption()
        {
            GameState state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            CardState card = state.CreateCard("magmaPool", 5);
            card.EvolutionPath.Add("5:magmaPoolB2");
            state.Equipment[0] = card;

            RuntimeEquipmentBinding binding =
                EquipmentEffectBindingRuntime.Resolve(state, "onKill")
                    .Single();

            Assert.That(binding.Binding.effects[0].atom,
                Is.EqualTo("groundZone"));
        }

        [Test]
        public void WaveStartGroundZoneExecutesItsNestedDot()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            state.Equipment[0] = state.CreateCard("volcanoCore", 6);
            state.BeginWave(1);
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(260f, 320f),
                100f,
                10f,
                8f,
                1f);
            state.Enemies.Add(enemy);

            system.StepPassives(state, 0f);

            Assert.That(state.GroundZones, Has.Count.EqualTo(1));
            GroundZoneState zone = state.GroundZones[0];
            Assert.That(zone.Position, Is.EqualTo(enemy.Position));
            Assert.That(zone.Radius, Is.EqualTo(90f));
            Assert.That(zone.LifeRemaining, Is.EqualTo(999f));
            Assert.That(zone.TickInterval, Is.EqualTo(0.5f));
            Assert.That(zone.DamagePerTick, Is.GreaterThan(0f));
        }

        [Test]
        public void IntervalGroundZoneKeepsNestedControlEffects()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            state.Equipment[0] = state.CreateCard("glacialEpoch", 6);
            state.BeginWave(1);
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(260f, 320f),
                100f,
                10f,
                8f,
                1f);
            state.Enemies.Add(enemy);

            system.StepPassives(state, 0f);
            Assert.That(state.EquipmentBindingClocks, Has.Count.EqualTo(1));
            Assert.That(
                state.EquipmentBindingClocks.Values.Single(),
                Is.EqualTo(4f));
            for (int step = 0; step < 8; step++)
                system.StepPassives(state, 0.5f);

            Assert.That(
                state.EquipmentBindingClocks.Values.Single(),
                Is.EqualTo(4f));
            Assert.That(state.GroundZones, Has.Count.EqualTo(1));
            GroundZoneState zone = state.GroundZones[0];
            Assert.That(zone.Shape, Is.EqualTo("ring"));
            Assert.That(zone.InitialRadius, Is.EqualTo(60f));
            Assert.That(zone.InnerRadius, Is.EqualTo(45f));
            Assert.That(zone.TargetRadius, Is.EqualTo(260f));
            Assert.That(zone.SlowRatio, Is.EqualTo(0.35f));
            Assert.That(zone.FreezeDuration, Is.EqualTo(1f));
            Assert.That(zone.FreezeStacksToTrigger, Is.EqualTo(3));
            Assert.That(zone.KnockbackDistance, Is.EqualTo(40f));
        }

        [Test]
        public void OnHitGroundZoneExecutesAtImpactPoint()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            state.Equipment[0] = state.CreateCard("solarPiercer", 6);
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(260f, 320f),
                100f,
                10f,
                8f,
                1f);
            state.Enemies.Add(enemy);
            state.Bullets.Add(new BulletState(
                1,
                enemy.Position,
                new Float2(),
                5f,
                1f,
                1f,
                new CardCombatProfile()));

            system.StepBullets(state, 0f);

            Assert.That(state.GroundZones, Has.Count.EqualTo(1));
            GroundZoneState zone = state.GroundZones[0];
            Assert.That(zone.Position, Is.EqualTo(enemy.Position));
            Assert.That(zone.Shape, Is.EqualTo("line"));
            Assert.That(zone.Radius, Is.EqualTo(90f));
            Assert.That(zone.LifeRemaining, Is.EqualTo(3.5f));
            Assert.That(zone.DamagePerTick, Is.GreaterThan(0f));
        }

        [Test]
        public void OnKillGroundZoneUsesStatusConditionAndDeathPoint()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            state.Equipment[0] = state.CreateCard("emberSpark", 6);
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(260f, 320f),
                1f,
                10f,
                8f,
                1f);
            enemy.DotRemaining = 1f;
            state.Enemies.Add(enemy);
            state.Bullets.Add(new BulletState(
                1,
                enemy.Position,
                new Float2(),
                5f,
                1f,
                2f,
                new CardCombatProfile()));

            system.StepBullets(state, 0f);

            Assert.That(state.GroundZones, Has.Count.EqualTo(1));
            GroundZoneState zone = state.GroundZones[0];
            Assert.That(zone.Position, Is.EqualTo(enemy.Position));
            Assert.That(zone.Radius, Is.EqualTo(55f));
            Assert.That(zone.LifeRemaining, Is.EqualTo(4f));
            Assert.That(zone.DamagePerTick, Is.GreaterThan(0f));
        }

        [Test]
        public void ShieldAbsorbChargeAccumulatesPerCardInstance()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            CardState card = state.CreateCard("voltBastion", 6);
            state.Equipment[0] = card;
            state.BeginWave(1);
            system.StepPassives(state, 0f);
            state.Enemies.Add(new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(combat.turret.x, combat.turret.y),
                1f,
                10f,
                8f,
                1f));

            system.StepEnemies(state, 0f);

            string key = "charge:voltBastion/" + card.Id + "/main";
            Assert.That(state.EquipmentBindingCharges[key], Is.EqualTo(1f));
            Assert.That(state.Hp, Is.EqualTo(state.MaxHp));
        }

        [Test]
        public void WaveStartSummonPreservesFormationAndCountCap()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(combat);
            var system = new CombatSystem(
                combat,
                GameConfigLoader.LoadEnemies());
            state.Equipment[0] = state.CreateCard("pylonCircuit", 6);
            state.BeginWave(1);

            system.StepPassives(state, 0f);

            Assert.That(state.EquipmentSummons, Has.Count.EqualTo(3));
            Assert.That(
                state.EquipmentSummons.Select(item => item.Kind),
                Is.All.EqualTo("pylon"));
            Assert.That(
                state.EquipmentSummons.Select(item => item.Position)
                    .Distinct().ToArray(),
                Has.Length.EqualTo(3));
            foreach (EquipmentSummonState summon in state.EquipmentSummons)
            {
                Assert.That(
                    Float2.Distance(
                        summon.Position,
                        new Float2(combat.turret.x, combat.turret.y)),
                    Is.EqualTo(155f).Within(0.01f));
                Assert.That(summon.AuraEffects, Has.Length.EqualTo(1));
            }
        }
    }
}
