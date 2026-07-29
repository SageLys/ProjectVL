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
                Is.EquivalentTo(new[]
                {
                    "chainLightning",
                    "pierce",
                    "stormcall",
                    "arcSplitter",
                    "galvanicWard"
                }));
            Assert.That(active, Has.All.Matches<string>(CardPoolSystem.IsPlayable));
        }

        [Test]
        public void NewSubGodCardsArePrioritizedByBootstrapDrops()
        {
            ChooseMainGod();
            Assert.That(_gods.OfferForAfterWave(_state, 1), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
            _cards.GenerateActivePool(_state, 2);

            string first = _cards.SelectNormalEnemyDropType(_state);
            _cards.RecordDropShown(_state, first, true);
            string second = _cards.SelectNormalEnemyDropType(_state);

            Assert.That(first, Is.EqualTo("frost"));
            Assert.That(second, Is.EqualTo("impact"));
            Assert.That(_state.BootstrapDropsRemaining, Is.EqualTo(7));
        }

        [Test]
        public void FormalDropDirectorConfigMatchesWebValues()
        {
            NormalDropTypePolicyConfig policy =
                GameConfigLoader.LoadEconomy().normalDropTypePolicy;

            Assert.That(policy.roleBagSize, Is.EqualTo(10));
            Assert.That(policy.earlyMix.discovery, Is.EqualTo(6));
            Assert.That(policy.earlyMix.build, Is.EqualTo(3));
            Assert.That(policy.earlyMix.pivot, Is.EqualTo(1));
            Assert.That(policy.lateMix.discovery, Is.EqualTo(1));
            Assert.That(policy.lateMix.build, Is.EqualTo(7));
            Assert.That(policy.lateMix.pivot, Is.EqualTo(2));
            Assert.That(policy.maxSameTypeStreak, Is.EqualTo(2));
        }

        [Test]
        public void EarlyRoleBagContainsSixDiscoveryThreeBuildOnePivot()
        {
            SetActivePool("pierce", "chainLightning", "frost");

            _cards.RefillNormalDropRoleBag(_state);

            Assert.That(_state.NormalDropRoleBag, Has.Count.EqualTo(10));
            Assert.That(
                _state.NormalDropRoleBag.FindAll(
                    role => role == NormalDropRole.Discovery),
                Has.Count.EqualTo(6));
            Assert.That(
                _state.NormalDropRoleBag.FindAll(
                    role => role == NormalDropRole.Build),
                Has.Count.EqualTo(3));
            Assert.That(
                _state.NormalDropRoleBag.FindAll(
                    role => role == NormalDropRole.Pivot),
                Has.Count.EqualTo(1));
        }

        [Test]
        public void NewWaveActivePoolResetsPreviousRoleBag()
        {
            ChooseMainGod();
            _state.NormalDropRoleBag.Add(NormalDropRole.Build);

            _cards.GenerateActivePool(_state, 1);

            Assert.That(_state.NormalDropRoleBag, Is.Empty);
        }

        [Test]
        public void DiscoverySelectsLeastShownActiveCard()
        {
            SetActivePool("pierce", "chainLightning", "frost");
            _cards.RecordDropShown(_state, "pierce", true);
            _cards.RecordDropShown(_state, "pierce", true);
            _cards.RecordDropShown(_state, "chainLightning", true);

            string selected = _cards.SelectDiscoveryType(_state);

            Assert.That(selected, Is.EqualTo("frost"));
        }

        [Test]
        public void BuildSelectionPrefersExistingEquippedInvestment()
        {
            SetActivePool("pierce", "chainLightning", "frost");
            _state.Equipment[0] = _state.CreateCard("pierce", 3);

            string selected = _cards.SelectBuildType(_state);

            Assert.That(selected, Is.EqualTo("pierce"));
            Assert.That(
                _cards.CalculateCommitmentScore(_state, "pierce"),
                Is.GreaterThan(
                    _cards.CalculateCommitmentScore(
                        _state,
                        "chainLightning")));
        }

        [Test]
        public void PivotSelectionAvoidsTwoMostCommittedCards()
        {
            SetActivePool("pierce", "chainLightning", "frost");
            _state.Equipment[0] = _state.CreateCard("pierce", 3);
            _state.Hand[0] = _state.CreateCard("chainLightning", 2);

            string selected = _cards.SelectPivotType(_state);

            Assert.That(selected, Is.EqualTo("frost"));
        }

        [Test]
        public void BuildRoleCannotShowSameCardThreeTimesInARow()
        {
            SetActivePool("pierce", "chainLightning");
            _state.Equipment[0] = _state.CreateCard("pierce", 3);
            _state.NormalDropRoleBag.Add(NormalDropRole.Build);
            _state.NormalDropRoleBag.Add(NormalDropRole.Build);
            _state.NormalDropRoleBag.Add(NormalDropRole.Build);

            string first = _cards.SelectNormalEnemyDropType(_state);
            _cards.RecordDropShown(_state, first, true);
            string second = _cards.SelectNormalEnemyDropType(_state);
            _cards.RecordDropShown(_state, second, true);
            string third = _cards.SelectNormalEnemyDropType(_state);

            Assert.That(first, Is.EqualTo("pierce"));
            Assert.That(second, Is.EqualTo("pierce"));
            Assert.That(third, Is.EqualTo("chainLightning"));
        }

        [Test]
        public void BonusDropDoesNotConsumeSubGodBootstrapGuarantee()
        {
            ChooseMainGod();
            Assert.That(_gods.OfferForAfterWave(_state, 1), Is.True);
            Assert.That(_gods.Choose(_state, 0), Is.True);
            _cards.GenerateActivePool(_state, 2);

            _cards.SelectActiveDropType(_state);
            string ordinary = _cards.SelectNormalEnemyDropType(_state);

            Assert.That(_state.BootstrapDropsRemaining, Is.EqualTo(8));
            Assert.That(ordinary, Is.EqualTo("frost"));
        }

        [Test]
        public void CardMergeUpdatesPerTypeDirectorStatistics()
        {
            var inventory = new CardInventorySystem(new EconomyConfig());

            Assert.That(inventory.AddCard(_state, "pierce", 1), Is.True);
            Assert.That(inventory.AddCard(_state, "pierce", 1), Is.True);

            CardTypeRunStats stats = _state.CardTypeRunStats["pierce"];
            Assert.That(stats.Collected, Is.EqualTo(2));
            Assert.That(stats.MergeOperations, Is.EqualTo(1));
            Assert.That(stats.HighestStarReached, Is.EqualTo(2));
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

        private void SetActivePool(params string[] cardTypes)
        {
            _state.ActiveCardPool.Clear();
            _state.ActiveCardPool.AddRange(cardTypes);
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
