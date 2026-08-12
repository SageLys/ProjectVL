using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardBuildMatrixTests
    {
        private CardCatalog _catalog;
        private CombatConfig _combat;
        private EnemiesConfig _enemies;

        [SetUp]
        public void SetUp()
        {
            _catalog = new CardCatalog(
                GameConfigLoader.LoadCards());
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
        }

        [Test]
        public void EveryCardCastsAtEveryStar()
        {
            foreach (CardDefinitionConfig definition in _catalog.Cards)
            {
                int minimumStar = definition.recipeOnly ? 6 : 1;
                for (int star = minimumStar; star <= 6; star++)
                {
                    GameState state = CreateState();
                    CardState card = state.CreateCard(
                        definition.id,
                        star);
                    AddTarget(state);
                    var combat = new CombatSystem(
                        _combat,
                        _enemies);

                    Assert.That(
                        CombatSystem.SupportsConsumable(card),
                        Is.True,
                        $"{definition.id} {star}-star support");
                    Assert.That(
                        combat.CastConsumable(
                            state,
                            card,
                            new Float2(250f, 250f)),
                        Is.True,
                        $"{definition.id} {star}-star cast");
                }
            }
        }

        [Test]
        public void EveryEvolutionRouteResolvesAnEquipmentProfile()
        {
            foreach (string cardId in _catalog.PlayableIds)
            {
                string[] firstChoices =
                    _catalog.EvolutionOptions(cardId, 3);
                foreach (string first in firstChoices)
                {
                    CardCombatProfile profile = ResolveProfile(
                        cardId,
                        3,
                        $"3:{first}");
                    Assert.That(
                        HasEquipmentEffect(profile),
                        Is.True,
                        $"{cardId} route {first}");
                }

                string[] secondChoices =
                    _catalog.EvolutionOptions(cardId, 5);
                foreach (string second in secondChoices)
                {
                    CardCombatProfile profile = ResolveProfile(
                        cardId,
                        5,
                        $"3:{firstChoices[0]}",
                        $"5:{second}");
                    Assert.That(
                        HasEquipmentEffect(profile),
                        Is.True,
                        $"{cardId} route {second}");
                }
            }
        }

        [Test]
        public void EveryEvolutionChoiceProducesADistinctBuild()
        {
            var duplicates = new List<string>();
            foreach (string cardId in _catalog.PlayableIds)
            {
                string[] firstChoices =
                    _catalog.EvolutionOptions(cardId, 3);
                AssertDistinctProfiles(
                    cardId,
                    3,
                    firstChoices,
                    null,
                    duplicates);

                string[] secondChoices =
                    _catalog.EvolutionOptions(cardId, 5);
                foreach (string first in firstChoices)
                {
                    AssertDistinctProfiles(
                        cardId,
                        5,
                        secondChoices,
                        first,
                        duplicates);
                }
            }

            Assert.That(
                duplicates,
                Is.Empty,
                string.Join(", ", duplicates));
        }

        [Test]
        public void EverySixStarTransformationResolvesAnEquipmentProfile()
        {
            foreach (CardDefinitionConfig definition in _catalog.Cards)
            {
                CardCombatProfile profile = ResolveProfile(
                    definition.id,
                    6);

                Assert.That(
                    HasEquipmentEffect(profile)
                        || definition.recipeOnly
                            && RecipeProductEffectCatalog.Default
                                .Find(definition.id)?.bindings?.Length > 0,
                    Is.True,
                    $"{definition.id} six-star profile");
            }
        }

        private GameState CreateState()
        {
            return GameStateFactory.Create(
                _combat,
                GameConfigLoader.LoadEconomy());
        }

        private static void AddTarget(GameState state)
        {
            state.Enemies.Add(new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(250f, 250f),
                10000f,
                10f,
                8f,
                1f));
        }

        private CardCombatProfile ResolveProfile(
            string cardId,
            int star,
            params string[] routes)
        {
            GameState state = CreateState();
            CardState card = state.CreateCard(cardId, star);
            card.EvolutionPath.AddRange(routes);
            state.Equipment[0] = card;
            return CardEffectResolver.Resolve(state);
        }

        private static bool HasEquipmentEffect(
            CardCombatProfile profile)
        {
            var defaults = new CardCombatProfile();
            foreach (PropertyInfo property in
                typeof(CardCombatProfile).GetProperties(
                    BindingFlags.Instance | BindingFlags.Public))
            {
                object actual = property.GetValue(profile);
                object baseline = property.GetValue(defaults);
                if (!Equals(actual, baseline))
                {
                    return true;
                }
            }

            return false;
        }

        private void AssertDistinctProfiles(
            string cardId,
            int star,
            string[] choices,
            string firstChoice,
            List<string> duplicates)
        {
            var signatures = new HashSet<string>();
            string baselineSignature = firstChoice == null
                ? null
                : ProfileSignature(
                    ResolveProfile(
                        cardId,
                        4,
                        $"3:{firstChoice}"));
            foreach (string choice in choices)
            {
                CardCombatProfile profile = firstChoice == null
                    ? ResolveProfile(
                        cardId,
                        star,
                        $"3:{choice}")
                    : ResolveProfile(
                        cardId,
                        star,
                        $"3:{firstChoice}",
                        $"5:{choice}");
                string signature = ProfileSignature(profile);
                bool sourceEquivalent =
                    AllowsSourceEquivalentBuild(cardId, choice);
                if (signature == baselineSignature
                    && !sourceEquivalent)
                {
                    duplicates.Add(
                        $"{cardId} {star}-star choice {choice}"
                        + $" has no effect after {firstChoice}");
                }

                if (!signatures.Add(signature)
                    && !sourceEquivalent)
                {
                    duplicates.Add(
                        $"{cardId} {star}-star choice {choice}"
                        + (firstChoice == null
                            ? string.Empty
                            : $" after {firstChoice}"));
                }
            }
        }

        private static bool AllowsSourceEquivalentBuild(
            string cardId,
            string choice)
        {
            // These web definitions add a second, weaker copy of a
            // strongest-wins status, so their resolved combat result is
            // intentionally equivalent even though the route is recorded.
            return cardId == "sanctum"
                    && (choice == "sanctum2x"
                        || choice == "sanctum3x")
                || cardId == "bountyCall"
                    && choice == "bountyCall3x";
        }

        private static string ProfileSignature(
            CardCombatProfile profile)
        {
            var values = new List<string>();
            foreach (PropertyInfo property in
                typeof(CardCombatProfile).GetProperties(
                    BindingFlags.Instance | BindingFlags.Public))
            {
                values.Add(
                    property.Name
                    + "="
                    + Convert.ToString(
                        property.GetValue(profile),
                        CultureInfo.InvariantCulture));
            }

            return string.Join("|", values);
        }
    }
}
