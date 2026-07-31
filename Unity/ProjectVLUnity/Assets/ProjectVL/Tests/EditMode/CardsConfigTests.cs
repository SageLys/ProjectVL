using System.Collections.Generic;
using NUnit.Framework;
using ProjectVL.Config;

namespace ProjectVL.Tests
{
    public sealed class CardsConfigTests
    {
        private CardsConfig _cards;
        private CardCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            _cards = GameConfigLoader.LoadCards();
            _catalog = new CardCatalog(_cards);
        }

        [Test]
        public void LoadsCompleteWebCardCatalog()
        {
            Assert.That(_cards.version, Is.EqualTo("1.0.0"));
            Assert.That(_cards.sourceVersion, Is.EqualTo("0.6.0"));
            Assert.That(_cards.cards, Has.Length.EqualTo(60));
            Assert.That(_catalog.PlayableIds.Count, Is.EqualTo(35));
        }

        [Test]
        public void CatalogMatchesGodRostersAndRecipes()
        {
            IReadOnlyList<string> errors =
                CardsConfigValidator.Validate(
                    _cards,
                    GameConfigLoader.LoadGods(),
                    GameConfigLoader.LoadEvolutionRecipes());

            Assert.That(errors, Is.Empty);
        }

        [Test]
        public void EveryPlayableCardHasBothEvolutionCheckpoints()
        {
            foreach (string cardId in _catalog.PlayableIds)
            {
                Assert.That(
                    _catalog.EvolutionOptions(cardId, 3),
                    Has.Length.EqualTo(3),
                    cardId);
                Assert.That(
                    _catalog.EvolutionOptions(cardId, 5),
                    Has.Length.EqualTo(3),
                    cardId);
            }
        }

        [Test]
        public void RecipeCardsAreConsumableButNotRandomDrops()
        {
            foreach (CardDefinitionConfig card in _catalog.Cards)
            {
                if (!card.recipeOnly)
                {
                    continue;
                }

                Assert.That(
                    _catalog.IsPlayable(card.id),
                    Is.False,
                    card.id);
                Assert.That(
                    _catalog.SupportsConsumable(card.id),
                    Is.True,
                    card.id);
                Assert.That(
                    _catalog.EvolutionOptions(card.id, 3),
                    Is.Empty,
                    card.id);
            }
        }

        [Test]
        public void CatalogUsesOfficialChineseCardNames()
        {
            Assert.That(
                _catalog.DisplayName("pierce"),
                Is.EqualTo("打包处理"));
            Assert.That(
                _catalog.DisplayName("stormLattice"),
                Is.EqualTo("一矛拉出电网"));
            Assert.That(
                _catalog.DisplayName("unknown"),
                Is.EqualTo("unknown"));
        }
    }
}
