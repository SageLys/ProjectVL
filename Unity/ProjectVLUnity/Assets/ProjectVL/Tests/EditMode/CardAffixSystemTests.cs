using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardAffixSystemTests
    {
        private GameState _state;
        private CardAffixSystem _affixes;

        [SetUp]
        public void SetUp()
        {
            _state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            var cards = new CardCatalog(
                GameConfigLoader.LoadCards());
            _affixes = new CardAffixSystem(
                new CardAffixCatalog(
                    GameConfigLoader.LoadCardAffixes(),
                    cards),
                new ConstantRandomSource(0f));
        }

        [Test]
        public void FirstCardRollsTwoDistinctConfiguredAffixes()
        {
            CardState card = _state.CreateCard("pierce", 1);

            _affixes.Attach(_state, card);

            Assert.That(card.Affixes, Has.Count.EqualTo(2));
            Assert.That(card.Affixes[0].Stat, Is.EqualTo("damageAdd"));
            Assert.That(card.Affixes[0].Value, Is.EqualTo(1f));
            Assert.That(card.Affixes[1].Stat, Is.EqualTo("fireRateAdd"));
            Assert.That(card.Affixes[1].Value, Is.EqualTo(0.1f));
        }

        [Test]
        public void SameCardTypeReusesRunLockedTemplate()
        {
            CardState first = _state.CreateCard("pierce", 1);
            CardState second = _state.CreateCard("pierce", 3);

            _affixes.Attach(_state, first);
            _affixes.Attach(_state, second);

            Assert.That(_state.CardAffixRolls, Has.Count.EqualTo(1));
            Assert.That(second.Affixes, Has.Count.EqualTo(2));
            Assert.That(
                second.Affixes[0].Stat,
                Is.EqualTo(first.Affixes[0].Stat));
            Assert.That(
                second.Affixes[0].Value,
                Is.EqualTo(first.Affixes[0].Value));
            Assert.That(
                second.Affixes[0],
                Is.Not.SameAs(first.Affixes[0]));
        }

        private sealed class ConstantRandomSource : IRandomSource
        {
            private readonly float _value;

            public ConstantRandomSource(float value)
            {
                _value = value;
            }

            public float NextFloat()
            {
                return _value;
            }
        }
    }
}
