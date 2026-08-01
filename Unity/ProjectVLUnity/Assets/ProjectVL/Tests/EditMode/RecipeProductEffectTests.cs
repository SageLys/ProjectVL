using System;
using System.Reflection;
using System.Linq;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class RecipeProductEffectTests
    {
        [Test]
        public void LoadsAllCompiledWebBindingsAndAtoms()
        {
            RecipeProductEffectsConfig config =
                GameConfigLoader.LoadRecipeProductEffects();
            int bindings = 0;
            int atoms = 0;
            int consumableAtoms = 0;
            foreach (RecipeProductCardEffectsConfig card in config.cards)
            {
                bindings += card.bindings.Length;
                foreach (CompiledEffectBindingConfig binding in card.bindings)
                {
                    foreach (CompiledEffectAtomConfig atom in binding.effects)
                        atoms += CountAtoms(atom);
                }
                foreach (CompiledEffectAtomConfig atom
                    in card.consumable.effects)
                {
                    consumableAtoms += CountAtoms(atom);
                }
            }

            Assert.That(config.version, Is.EqualTo("1.1.0"));
            Assert.That(config.sourceVersion, Is.EqualTo("0.6.0"));
            Assert.That(config.cards, Has.Length.EqualTo(25));
            Assert.That(bindings, Is.EqualTo(70));
            Assert.That(atoms, Is.EqualTo(142));
            Assert.That(consumableAtoms, Is.EqualTo(64));
            Assert.DoesNotThrow(() => new RecipeProductEffectCatalog(
                config,
                new CardCatalog(GameConfigLoader.LoadCards())));
        }

        [Test]
        public void EveryRecipeProductBuildsACompiledEquipmentProfile()
        {
            CardsConfig cards = GameConfigLoader.LoadCards();
            foreach (CardDefinitionConfig definition in cards.cards)
            {
                if (!definition.recipeOnly)
                    continue;

                var profile = new CardCombatProfile();
                Assert.That(
                    RecipeProductProfileCompiler.Apply(
                        definition.id,
                        profile),
                    Is.True,
                    definition.id);
                Assert.That(
                    HasEquipmentEffect(profile)
                        || RecipeProductEffectCatalog.Default
                            .Find(definition.id)?.bindings?.Length > 0,
                    Is.True,
                    definition.id);
            }
        }

        [Test]
        public void RepresentativeProductsUseTheirAuthoredMechanics()
        {
            CardCombatProfile lattice = Compile("stormLattice");
            CardCombatProfile rime = Compile("thunderRime");
            CardCombatProfile bastion = Compile("voltBastion");
            CardCombatProfile flow = Compile("ampereFlow");
            CardCombatProfile citadel = Compile("aegisCitadel");

            Assert.That(lattice.PierceCount, Is.EqualTo(999));
            Assert.That(
                lattice.PierceDamageRetention,
                Is.EqualTo(0.85f).Within(0.001f));
            Assert.That(lattice.ChainPulseInterval, Is.EqualTo(2f));
            CompiledEffectAtomConfig rimeAura =
                RecipeProductEffectCatalog.Default.Find("thunderRime")
                    .bindings[0].effects[0];
            Assert.That(rimeAura.atom, Is.EqualTo("aura"));
            Assert.That(rimeAura.children[0].atom, Is.EqualTo("slow"));
            Assert.That(
                rimeAura.children[0].Params.Single(item => item.key == "ratio")
                    .number,
                Is.EqualTo(0.3f));
            Assert.That(bastion.ShieldHits, Is.EqualTo(3));
            Assert.That(flow.DropRateMultiplier, Is.EqualTo(2f));
            Assert.That(
                citadel.BreachReductionRatio,
                Is.EqualTo(0.15f).Within(0.001f));
        }

        private static CardCombatProfile Compile(string cardId)
        {
            var profile = new CardCombatProfile();
            Assert.That(
                RecipeProductProfileCompiler.Apply(cardId, profile),
                Is.True);
            return profile;
        }

        private static int CountAtoms(CompiledEffectAtomConfig atom)
        {
            int count = 1;
            foreach (CompiledEffectAtomConfig child
                in atom.children ?? Array.Empty<CompiledEffectAtomConfig>())
            {
                count += CountAtoms(child);
            }
            return count;
        }

        private static bool HasEquipmentEffect(CardCombatProfile profile)
        {
            var baseline = new CardCombatProfile();
            foreach (PropertyInfo property in
                typeof(CardCombatProfile).GetProperties(
                    BindingFlags.Instance | BindingFlags.Public))
            {
                if (!Equals(
                    property.GetValue(profile),
                    property.GetValue(baseline)))
                    return true;
            }
            return false;
        }
    }
}
