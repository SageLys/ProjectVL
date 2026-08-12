using NUnit.Framework;
using ProjectVL.Config;

namespace ProjectVL.Tests
{
    public sealed class EvolutionTextTests
    {
        [Test]
        public void EveryEvolutionOptionHasChineseUiText()
        {
            var cards = new CardCatalog(
                GameConfigLoader.LoadCards());
            var text = new EvolutionTextCatalog(
                GameConfigLoader.LoadEvolutionText());

            foreach (CardDefinitionConfig card in cards.Cards)
            {
                foreach (string option in card.evolution3)
                {
                    AssertText(text, option);
                }
                foreach (string option in card.evolution5)
                {
                    AssertText(text, option);
                }
            }
        }

        private static void AssertText(
            EvolutionTextCatalog catalog,
            string option)
        {
            EvolutionOptionTextConfig text = catalog.Find(option);
            Assert.That(text, Is.Not.Null, option);
            Assert.That(text.name, Is.Not.Empty, option);
            Assert.That(text.summary, Is.Not.Empty, option);
        }
    }
}
