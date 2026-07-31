using System;
using NUnit.Framework;
using ProjectVL.Config;

namespace ProjectVL.Tests
{
    public sealed class EvolutionBranchEffectTests
    {
        [Test]
        public void LoadsEveryFiveStarOptionBindingAndRecursiveAtom()
        {
            EvolutionBranchEffectsConfig config =
                GameConfigLoader.LoadEvolutionBranchEffects();
            int options = 0;
            int bindings = 0;
            int atoms = 0;
            foreach (CompiledEvolutionCardConfig card in config.cards)
            {
                options += card.options.Length;
                foreach (CompiledEvolutionOptionConfig option in card.options)
                {
                    bindings += option.bindings.Length;
                    foreach (CompiledEffectBindingConfig binding
                        in option.bindings)
                    {
                        foreach (CompiledEffectAtomConfig atom in binding.effects)
                            atoms += CountAtoms(atom);
                    }
                }
            }

            Assert.That(config.version, Is.EqualTo("1.0.0"));
            Assert.That(config.sourceVersion, Is.EqualTo("0.6.0"));
            Assert.That(config.cards, Has.Length.EqualTo(35));
            Assert.That(options, Is.EqualTo(105));
            Assert.That(bindings, Is.EqualTo(142));
            Assert.That(atoms, Is.EqualTo(223));
            Assert.DoesNotThrow(() => new EvolutionBranchEffectCatalog(
                config,
                GameConfigLoader.LoadCards()));
        }

        [Test]
        public void CatalogFindsRawWebOptionIds()
        {
            var catalog = new EvolutionBranchEffectCatalog(
                GameConfigLoader.LoadEvolutionBranchEffects(),
                GameConfigLoader.LoadCards());

            Assert.That(
                catalog.Find("pierce", "pierce1x")?.bindings,
                Is.Not.Empty);
            Assert.That(
                catalog.Find("goldenVolley", "goldenVolley3x")?.bindings,
                Is.Not.Empty);
            Assert.That(catalog.Find("pierce", "pierceA2"), Is.Null);
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
    }
}
