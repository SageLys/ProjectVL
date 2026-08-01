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
    }
}
