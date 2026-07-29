using System.Collections.Generic;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardPoolTests
    {
        private GameState _state;
        private GodPoolSystem _gods;
        private CardPoolSystem _cards;

        [SetUp]
        public void SetUp()
        {
            var random = new ConstantRandomSource(0f);
            _state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            _state.StartRun();
            _gods = new GodPoolSystem(
                GameConfigLoader.LoadGods(),
                random);
            _cards = new CardPoolSystem(random);
        }

        [Test]
        public void MainAndSubGodChoicesFreezeFormalElevenCardRoster()
        {
            ChooseThreeGods();

            Assert.That(_state.RosterByGod["storm"], Has.Count.EqualTo(5));
            Assert.That(_state.RosterByGod["winter"], Has.Count.EqualTo(3));
            Assert.That(_state.RosterByGod["inferno"], Has.Count.EqualTo(3));
            Assert.That(_state.RunRoster, Has.Count.EqualTo(11));
            Assert.That(
                _state.RunRoster,
                Is.EquivalentTo(SelectedRosterCards(_state)));
        }

        [Test]
        public void FirstWaveActivePoolOnlyUsesPlayableMainGodCards()
        {
            ChooseMainGod();

            IReadOnlyList<string> active =
                _cards.GenerateActivePool(_state, 1);

            Assert.That(
                active,
                Is.EquivalentTo(new[] { "chainLightning", "pierce" }));
            Assert.That(active, Has.All.Matches<string>(CardPoolSystem.IsPlayable));
        }

        [Test]
        public void NewSubGodCardsArePrioritizedByBootstrapDrops()
        {
            ChooseMainGod();
            Assert.That(_gods.OfferForAfterWave(_state, 1), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
            _cards.GenerateActivePool(_state, 2);

            string first = _cards.SelectActiveDropType(_state);
            string second = _cards.SelectActiveDropType(_state);

            Assert.That(first, Is.EqualTo("frost"));
            Assert.That(second, Is.EqualTo("impact"));
            Assert.That(_state.BootstrapDropsRemaining, Is.EqualTo(7));
        }

        [Test]
        public void RegularAndBonusDropsStayInsideCurrentActivePool()
        {
            ChooseMainGod();
            _cards.GenerateActivePool(_state, 1);
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0f),
                null,
                _cards);
            var enemy = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(100f, 100f),
                10f,
                0f,
                10f,
                1f);

            GroundDropState ordinary = drops.TrySpawnOnKill(_state, enemy);
            GroundDropState bonus = drops.SpawnBonusDrop(
                _state,
                enemy.Position,
                2);

            Assert.That(ordinary, Is.Not.Null);
            Assert.That(
                _state.ActiveCardPool,
                Does.Contain(ordinary.CardType));
            Assert.That(
                _state.ActiveCardPool,
                Does.Contain(bonus.CardType));
        }

        [Test]
        public void FocusGodRewardUsesPlayableCardFromFocusRoster()
        {
            ChooseThreeGods();
            var inventory = new CardInventorySystem(
                new EconomyConfig(),
                _cards);
            var reward = new RunReward(
                RewardKind.Card,
                3,
                1,
                "focusGod");

            Assert.That(inventory.GrantReward(_state, reward), Is.True);

            CardState card = _state.Hand[0];
            Assert.That(card, Is.Not.Null);
            Assert.That(
                _state.RosterByGod[_state.FocusGod],
                Does.Contain(card.Type));
            Assert.That(CardPoolSystem.IsPlayable(card.Type), Is.True);
        }

        [Test]
        public void LaterActivePoolNeverIntroducesUnselectedGodCard()
        {
            ChooseThreeGods();

            IReadOnlyList<string> active =
                _cards.GenerateActivePool(_state, 6);

            Assert.That(active.Count, Is.LessThanOrEqualTo(7));
            Assert.That(active, Has.All.Matches<string>(_state.RunRoster.Contains));
            Assert.That(active, Has.All.Matches<string>(CardPoolSystem.IsPlayable));
            Assert.That(active, Does.Not.Contain("aegis"));
            Assert.That(active, Does.Not.Contain("harvest"));
        }

        private void ChooseMainGod()
        {
            Assert.That(_gods.OfferInitial(_state), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
        }

        private void ChooseThreeGods()
        {
            ChooseMainGod();
            Assert.That(_gods.OfferForAfterWave(_state, 1), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
            Assert.That(_gods.OfferForAfterWave(_state, 2), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
        }

        private static List<string> SelectedRosterCards(GameState state)
        {
            var result = new List<string>();
            foreach (string god in state.SelectedGodIds)
            {
                foreach (string card in state.RosterByGod[god])
                {
                    if (!result.Contains(card))
                    {
                        result.Add(card);
                    }
                }
            }

            return result;
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
