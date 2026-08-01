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
    }
}
