using System;
using System.Reflection;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

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

        [Test]
        public void EveryFiveStarOptionCompilesACombatProfile()
        {
            EvolutionBranchEffectsConfig config =
                GameConfigLoader.LoadEvolutionBranchEffects();
            foreach (CompiledEvolutionCardConfig card in config.cards)
            {
                foreach (CompiledEvolutionOptionConfig option in card.options)
                {
                    var profile = new CardCombatProfile();
                    Assert.That(
                        EvolutionBranchProfileCompiler.ApplyOption(
                            card.cardId,
                            option.optionId,
                            profile),
                        Is.True,
                        option.optionId);
                    Assert.That(
                        HasEffect(profile),
                        Is.True,
                        option.optionId);
                }
            }
        }

        [Test]
        public void CompilerAcceptsLegacyAndRawRouteNames()
        {
            var rawCard = new CardState(1, "pierce", 5);
            rawCard.EvolutionPath.Add("5:pierce1x");
            var legacyCard = new CardState(2, "pierce", 5);
            legacyCard.EvolutionPath.Add("5:pierceA2");
            var raw = new CardCombatProfile();
            var legacy = new CardCombatProfile();

            Assert.That(
                EvolutionBranchProfileCompiler.ApplyFiveStar(rawCard, raw),
                Is.True);
            Assert.That(
                EvolutionBranchProfileCompiler.ApplyFiveStar(
                    legacyCard,
                    legacy),
                Is.True);
            Assert.That(raw.SplashDamageRatio, Is.EqualTo(0.55f));
            Assert.That(
                legacy.SplashDamageRatio,
                Is.EqualTo(raw.SplashDamageRatio));
        }

        [Test]
        public void ResolverUsesCompiledDataForNewRoutesAndKeepsLegacyAlias()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState rawState = GameStateFactory.Create(combat);
            CardState raw = rawState.CreateCard("pierce", 5);
            raw.EvolutionPath.Add("3:pierceA");
            raw.EvolutionPath.Add("5:pierce2x");
            rawState.Equipment[0] = raw;

            GameState legacyState = GameStateFactory.Create(combat);
            CardState legacy = legacyState.CreateCard("pierce", 5);
            legacy.EvolutionPath.Add("3:pierceA");
            legacy.EvolutionPath.Add("5:pierceA2");
            legacyState.Equipment[0] = legacy;

            CardCombatProfile rawProfile = CardEffectResolver.Resolve(rawState);
            CardCombatProfile legacyProfile =
                CardEffectResolver.Resolve(legacyState);

            Assert.That(rawProfile.SplashRadius, Is.EqualTo(80f));
            Assert.That(rawProfile.SplashDamageRatio, Is.EqualTo(0.5f));
            Assert.That(rawProfile.RicochetBounces, Is.Zero);
            Assert.That(legacyProfile.RicochetBounces, Is.EqualTo(1));
        }

        [Test]
        public void RuntimeSwitchCoversNinetyNineFiveStarOptions()
        {
            EvolutionBranchEffectsConfig config =
                GameConfigLoader.LoadEvolutionBranchEffects();
            int supported = 0;
            foreach (CompiledEvolutionCardConfig card in config.cards)
            {
                foreach (CompiledEvolutionOptionConfig option in card.options)
                {
                    if (EvolutionBranchProfileCompiler.IsRuntimeSupported(
                        card.cardId,
                        option.optionId))
                    {
                        supported++;
                    }
                }
            }

            Assert.That(supported, Is.EqualTo(99));
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

        private static bool HasEffect(CardCombatProfile profile)
        {
            var baseline = new CardCombatProfile();
            foreach (PropertyInfo property in
                typeof(CardCombatProfile).GetProperties(
                    BindingFlags.Instance | BindingFlags.Public))
            {
                if (!Equals(
                    property.GetValue(profile),
                    property.GetValue(baseline)))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
