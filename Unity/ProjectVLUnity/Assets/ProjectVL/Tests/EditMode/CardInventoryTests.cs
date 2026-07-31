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
        public void MatchingHandCardsMergeAutomatically()
        {
            _inventory.AddCard(_state, "pierce", 1);

            bool added = _inventory.AddCard(_state, "pierce", 1);

            Assert.That(added, Is.True);
            Assert.That(_state.Merges, Is.EqualTo(1));
            Assert.That(_state.Hand, Has.Exactly(1).Not.Null);
            Assert.That(_state.Hand[0].Star, Is.EqualTo(2));
        }

        [TestCase("solarPiercer")]
        [TestCase("not-a-card")]
        public void AddCardRejectsRecipeOnlyAndUnknownCards(string type)
        {
            bool added = _inventory.AddCard(_state, type, 6);

            Assert.That(added, Is.False);
            Assert.That(_state.Hand, Is.All.Null);
            Assert.That(_state.CardTypeRunStats, Is.Empty);
        }

        [Test]
        public void FourMatchingCardsChainMergeAndOfferEvolution()
        {
            for (int i = 0; i < 4; i++)
            {
                _inventory.AddCard(_state, "frost", 1);
            }

            Assert.That(_state.Merges, Is.EqualTo(3));
            Assert.That(_state.Hand, Has.Exactly(1).Not.Null);
            Assert.That(_state.Hand[0].Star, Is.EqualTo(3));
            Assert.That(_state.Hand[0].Provisional, Is.True);
            Assert.That(_state.PendingEvolution, Is.Not.Null);
            Assert.That(_state.PendingEvolution.CheckpointStar, Is.EqualTo(3));
            Assert.That(
                _state.PendingEvolution.Options,
                Is.EqualTo(new[] { "frostA", "frostB", "frostC" }));
            Assert.That(_state.DecisionLocked, Is.True);
        }

        [Test]
        public void EvolutionChoicesComeFromCardCatalog()
        {
            var cards = new CardsConfig
            {
                cards = new[]
                {
                    new CardDefinitionConfig
                    {
                        id = "pierce",
                        god = "storm",
                        category = "projectile",
                        displayName = "测试卡",
                        consumable = true,
                        evolution3 = new[]
                        {
                            "routeLeft",
                            "routeCenter",
                            "routeRight"
                        }
                    }
                }
            };
            var inventory = new CardInventorySystem(
                _economy,
                null,
                new CardCatalog(cards));

            inventory.AddCard(_state, "pierce", 3);

            Assert.That(
                _state.PendingEvolution.Options,
                Is.EqualTo(
                    new[]
                    {
                        "routeLeft",
                        "routeCenter",
                        "routeRight"
                    }));
        }

        [Test]
        public void EvolutionChoiceStaysWithCardInstance()
        {
            _inventory.AddCard(_state, "impact", 3);
            int cardId = _state.Hand[0].Id;

            bool resolved = _inventory.ResolveEvolutionChoice(_state, 1);

            Assert.That(resolved, Is.True);
            Assert.That(_state.Hand[0].Id, Is.EqualTo(cardId));
            Assert.That(_state.Hand[0].Provisional, Is.False);
            Assert.That(
                _state.Hand[0].EvolutionPath,
                Is.EqualTo(new[] { "3:impactB" }));
            Assert.That(_state.PendingEvolution, Is.Null);
            Assert.That(_state.DecisionLocked, Is.False);
        }

        [Test]
        public void FiveStarCardOffersSecondEvolutionCheckpoint()
        {
            _inventory.AddCard(_state, "sanctum", 5);
            _inventory.ResolveEvolutionChoice(_state, 0);

            Assert.That(_state.PendingEvolution, Is.Not.Null);
            Assert.That(_state.PendingEvolution.CheckpointStar, Is.EqualTo(5));
            Assert.That(
                _state.PendingEvolution.Options,
                Is.EqualTo(
                    new[] { "sanctum1x", "sanctum2x", "sanctum3x" }));

            _inventory.ResolveEvolutionChoice(_state, 2);

            Assert.That(
                _state.Hand[0].EvolutionPath,
                Is.EqualTo(
                    new[] { "3:sanctumA", "5:sanctum3x" }));
            Assert.That(_state.PendingEvolution, Is.Null);
        }

        [Test]
        public void WildcardMustMatchCurrentCardStar()
        {
            _inventory.AddCard(_state, "pierce", 2);
            _state.Wildcards[1] = 2;

            WildcardUseResult result = _inventory.UseWildcard(
                _state,
                CardSlotKind.Hand,
                0);

            Assert.That(result, Is.EqualTo(WildcardUseResult.MissingWildcard));
            Assert.That(_state.Hand[0].Star, Is.EqualTo(2));
            Assert.That(_state.Wildcards[1], Is.EqualTo(2));
        }

        [Test]
        public void WildcardUpgradeContinuesOrdinaryHandMerges()
        {
            _inventory.AddCard(_state, "pierce", 1);
            _inventory.AddCard(_state, "pierce", 2);
            _state.Wildcards[1] = 1;

            WildcardUseResult result = _inventory.UseWildcard(
                _state,
                CardSlotKind.Hand,
                0);

            Assert.That(result, Is.EqualTo(WildcardUseResult.Upgraded));
            Assert.That(_state.Wildcards[1], Is.Zero);
            Assert.That(_state.Merges, Is.EqualTo(2));
            Assert.That(_state.Hand, Has.Exactly(1).Not.Null);
            Assert.That(_state.Hand[0].Star, Is.EqualTo(3));
            Assert.That(_state.PendingEvolution, Is.Not.Null);
        }

        [Test]
        public void ProvisionalCardCannotEquipOrBeConsumed()
        {
            _inventory.AddCard(_state, "aegis", 3);

            CardMoveResult move = _inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);
            bool consumed = _inventory.Consume(
                _state,
                CardSlotKind.Hand,
                0);

            Assert.That(move, Is.EqualTo(CardMoveResult.EvolutionPending));
            Assert.That(consumed, Is.False);
            Assert.That(_state.Hand[0], Is.Not.Null);
        }

        [Test]
        public void WildcardRejectsMaxStarWithoutConsumption()
        {
            _inventory.AddCard(_state, "thorns", 6);
            _state.Wildcards[5] = 1;

            WildcardUseResult result = _inventory.UseWildcard(
                _state,
                CardSlotKind.Hand,
                0);

            Assert.That(result, Is.EqualTo(WildcardUseResult.EvolutionPending));
            _inventory.ResolveEvolutionChoice(_state, 0);
            _inventory.ResolveEvolutionChoice(_state, 0);
            result = _inventory.UseWildcard(
                _state,
                CardSlotKind.Hand,
                0);
            Assert.That(result, Is.EqualTo(WildcardUseResult.MaxStar));
            Assert.That(_state.Wildcards[5], Is.EqualTo(1));
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
