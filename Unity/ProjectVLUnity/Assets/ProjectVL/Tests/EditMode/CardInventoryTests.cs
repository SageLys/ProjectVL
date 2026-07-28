using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardInventoryTests
    {
        private EconomyConfig _economy;
        private CardInventorySystem _inventory;
        private GameState _state;

        [SetUp]
        public void SetUp()
        {
            _economy = new EconomyConfig();
            _inventory = new CardInventorySystem(_economy);
            _state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault(),
                _economy);
        }

        [Test]
        public void UsesWebHandAndEquipmentSlotCounts()
        {
            Assert.That(_state.Hand, Has.Length.EqualTo(7));
            Assert.That(_state.Equipment, Has.Length.EqualTo(3));
        }

        [TestCase(1)]
        [TestCase(2)]
        public void RejectsCardsBelowThreeStars(int star)
        {
            _state.Hand[0] = _state.CreateCard("pierce", star);

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);

            Assert.That(result, Is.EqualTo(CardMoveResult.StarTooLow));
            Assert.That(_state.Hand[0], Is.Not.Null);
            Assert.That(_state.Equipment[0], Is.Null);
        }

        [Test]
        public void EquipsThreeStarCard()
        {
            CardState card = _state.CreateCard("pierce", 3);
            _state.Hand[0] = card;

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);

            Assert.That(result, Is.EqualTo(CardMoveResult.Moved));
            Assert.That(_state.Hand[0], Is.Null);
            Assert.That(_state.Equipment[0], Is.SameAs(card));
        }

        [Test]
        public void RejectsDuplicateEquippedType()
        {
            _state.Equipment[0] = _state.CreateCard("frost", 3);
            _state.Hand[0] = _state.CreateCard("frost", 4);

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                1);

            Assert.That(result, Is.EqualTo(CardMoveResult.DuplicateType));
            Assert.That(_state.Hand[0], Is.Not.Null);
            Assert.That(_state.Equipment[1], Is.Null);
        }

        [Test]
        public void MatchingEquipmentFeedRaisesStar()
        {
            _state.Equipment[0] = _state.CreateCard("pierce", 3);
            _state.Hand[0] = _state.CreateCard("pierce", 3);

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);

            Assert.That(result, Is.EqualTo(CardMoveResult.Fed));
            Assert.That(_state.Hand[0], Is.Null);
            Assert.That(_state.Equipment[0].Star, Is.EqualTo(4));
        }

        [Test]
        public void OccupiedEquipmentSlotSwapsAtomically()
        {
            CardState equipped = _state.CreateCard("pierce", 4);
            CardState hand = _state.CreateCard("frost", 3);
            _state.Equipment[0] = equipped;
            _state.Hand[0] = hand;

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);

            Assert.That(result, Is.EqualTo(CardMoveResult.Swapped));
            Assert.That(_state.Equipment[0], Is.SameAs(hand));
            Assert.That(_state.Hand[0], Is.SameAs(equipped));
        }

        [Test]
        public void ReverseSwapRejectsLowStarHandCard()
        {
            CardState equipped = _state.CreateCard("pierce", 3);
            CardState lowStar = _state.CreateCard("frost", 2);
            _state.Equipment[0] = equipped;
            _state.Hand[0] = lowStar;

            CardMoveResult result = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Equipment,
                0,
                CardSlotKind.Hand,
                0);

            Assert.That(result, Is.EqualTo(CardMoveResult.StarTooLow));
            Assert.That(_state.Equipment[0], Is.SameAs(equipped));
            Assert.That(_state.Hand[0], Is.SameAs(lowStar));
        }

        [Test]
        public void ConsumingEquipmentClearsItsSlot()
        {
            _state.Equipment[1] = _state.CreateCard("sanctum", 5);

            bool consumed = _inventory.Consume(
                _state,
                CardSlotKind.Equipment,
                1);

            Assert.That(consumed, Is.True);
            Assert.That(_state.Equipment[1], Is.Null);
            Assert.That(_state.ConsumedCards, Is.EqualTo(1));
        }

        [Test]
        public void CardAndWildcardRewardsEnterTheirInventories()
        {
            Assert.That(
                _inventory.GrantReward(
                    _state,
                    new RunReward(RewardKind.Card, 4, 2, "focusGod")),
                Is.True);
            Assert.That(
                _inventory.GrantReward(
                    _state,
                    new RunReward(RewardKind.Wildcard, 5, 2)),
                Is.True);

            Assert.That(_state.Hand[0].Star, Is.EqualTo(4));
            Assert.That(_state.Hand[1].Star, Is.EqualTo(4));
            Assert.That(_state.Wildcards[5], Is.EqualTo(2));
        }

        [Test]
        public void FullHandDoesNotOverwriteExistingCards()
        {
            for (int i = 0; i < _state.Hand.Length; i++)
            {
                _state.Hand[i] = _state.CreateCard("impact", 1);
            }

            bool granted = _inventory.GrantReward(
                _state,
                new RunReward(RewardKind.Card, 4, 1));

            Assert.That(granted, Is.False);
            Assert.That(_state.Hand, Has.All.Not.Null);
            Assert.That(_state.Hand[0].Star, Is.EqualTo(1));
        }
    }
}
