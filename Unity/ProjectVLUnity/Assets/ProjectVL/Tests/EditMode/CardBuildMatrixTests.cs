using System;
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
        public void EverySixStarTransformationResolvesAnEquipmentProfile()
        {
            foreach (CardDefinitionConfig definition in _catalog.Cards)
            {
                CardCombatProfile profile = ResolveProfile(
                    definition.id,
                    6);

                Assert.That(
                    HasEquipmentEffect(profile),
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
    }
}
