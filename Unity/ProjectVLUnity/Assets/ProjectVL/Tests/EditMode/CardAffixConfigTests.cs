using NUnit.Framework;
using ProjectVL.Config;

namespace ProjectVL.Tests
{
    public sealed class CardAffixConfigTests
    {
        [Test]
        public void LoadsValidatedPoolsForAllCards()
        {
            var cards = new CardCatalog(
                GameConfigLoader.LoadCards());
            var affixes = new CardAffixCatalog(
                GameConfigLoader.LoadCardAffixes(),
                cards);

            Assert.That(cards.Cards.Count, Is.EqualTo(60));
            foreach (CardDefinitionConfig card in cards.Cards)
            {
                CardAffixPoolConfig pool = affixes.Find(card.id);
                Assert.That(pool, Is.Not.Null, card.id);
                Assert.That(pool.count, Is.EqualTo(2), card.id);
                Assert.That(
                    pool.candidates,
                    Has.Length.EqualTo(3),
                    card.id);
            }
        }
    }
}
