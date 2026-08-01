using System.Collections.Generic;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class BountySystemTests
    {
        private CombatConfig _combat;
        private WavesConfig _waves;
        private EconomyConfig _economy;
        private GameState _state;
        private CardPoolSystem _cards;
        private DropSystem _drops;
        private BountySystem _bounties;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _waves = GameConfigLoader.LoadWaves();
            _economy = GameConfigLoader.LoadEconomy();
            var random = new ConstantRandomSource(0f);
            _state = GameStateFactory.Create(_combat, _economy);
            _state.StartRun();
            _state.BeginWave(1);
            _cards = new CardPoolSystem(random, _economy);
            var gods = new GodPoolSystem(
                GameConfigLoader.LoadGods(),
                random);
            Assert.That(gods.OfferInitial(_state), Is.True);
            Assert.That(gods.Choose(_state, 0), Is.True);
            _cards.GenerateActivePool(_state, 1);
            _drops = new DropSystem(_economy, random, null, _cards);
            var enemies = new EnemyFactory(
                _combat,
                GameConfigLoader.LoadEnemies(),
                _waves,
                random);
            _bounties = new BountySystem(
                GameConfigLoader.LoadBounty(),
                _combat,
                _waves,
                enemies,
                _cards,
                _drops,
                random);
            _bounties.OnWaveStarted(_state);
        }

        [Test]
        public void FormalBountyConfigMatchesWebValues()
        {
            BountyConfig config = GameConfigLoader.LoadBounty();

            Assert.That(config.offer.markWindowSeconds, Is.EqualTo(8f));
            Assert.That(config.offer.minOffersPerWave, Is.EqualTo(1));
            Assert.That(config.offer.maxOffersPerWave, Is.EqualTo(2));
            Assert.That(config.encounter.enemyCountBase, Is.EqualTo(3));
            Assert.That(config.encounter.hpMul, Is.EqualTo(1.35f));
            Assert.That(config.reward.dropLifetimeSeconds, Is.EqualTo(12f));
        }

        [Test]
        public void OfferPromisesPlayableRunRosterCardAndWaveRewardStars()
        {
            BountyOfferState offer = _bounties.CreateOffer(
                _state,
                true);

            Assert.That(
                _cards.GetRunPool(_state),
                Does.Contain(offer.RewardCardType));
            Assert.That(CardPoolSystem.IsPlayable(offer.RewardCardType), Is.True);
            Assert.That(offer.RewardCardStar, Is.EqualTo(1));
            Assert.That(offer.WildcardStar, Is.EqualTo(1));
            Assert.That(offer.Guaranteed, Is.True);
            Assert.That(_state.BountyOffersThisWave, Is.EqualTo(1));
        }

        [Test]
        public void BottomBountyOfferAndMembersStayAboveCardLoadout()
        {
            var random = new ConstantRandomSource(0.5f);
            var enemies = new EnemyFactory(
                _combat,
                GameConfigLoader.LoadEnemies(),
                _waves,
                random);
            var bounties = new BountySystem(
                GameConfigLoader.LoadBounty(),
                _combat,
                _waves,
                enemies,
                _cards,
                _drops,
                random);
            BountyOfferState offer = bounties.CreateOffer(_state, false);
            float bottomSpawnY = _combat.canvas.height
                - _waves.bottomSpawnInset;

            Assert.That(offer.Side, Is.EqualTo(BountySide.Bottom));
            Assert.That(offer.Position.Y, Is.LessThan(bottomSpawnY));
            Assert.That(bounties.AcceptAt(_state, offer.Position), Is.True);
            bounties.Step(_state, 1f);
            Assert.That(
                _state.Enemies,
                Has.All.Matches<EnemyState>(
                    enemy => enemy.Position.Y <= bottomSpawnY));
        }

        [Test]
        public void RepeatedBountyOfferProtectsPreviousRewardType()
        {
            string first = _bounties.CreateOffer(
                _state,
                false).RewardCardType;
            _state.BountyOffers.Clear();

            string second = _bounties.CreateOffer(
                _state,
                false).RewardCardType;

            Assert.That(second, Is.Not.EqualTo(first));
        }

        [Test]
        public void AcceptingOfferSpawnsFormalStrengthenedEnemyGroup()
        {
            BountyOfferState offer = _bounties.CreateOffer(
                _state,
                false);

            Assert.That(
                _bounties.AcceptAt(_state, offer.Position),
                Is.True);
            _bounties.Step(_state, 1f);

            Assert.That(_state.BountyOffers, Is.Empty);
            Assert.That(_state.BountyEncounters, Has.Count.EqualTo(1));
            Assert.That(_state.Enemies, Has.Count.EqualTo(3));
            Assert.That(
                _state.Enemies,
                Has.All.Matches<EnemyState>(
                    enemy => enemy.SpawnKind == EnemySpawnKind.Bounty));
            Assert.That(
                _state.BountyEncounters[0].Status,
                Is.EqualTo(BountyEncounterStatus.Active));
        }

        [Test]
        public void ClearingAllMembersDropsPromisedCardAndGrantsWildcard()
        {
            BountyOfferState offer = _bounties.CreateOffer(
                _state,
                false);
            _bounties.AcceptAt(_state, offer.Position);
            _bounties.Step(_state, 1f);
            var members = new List<EnemyState>(_state.Enemies);

            foreach (EnemyState member in members)
            {
                _state.Enemies.Remove(member);
                _bounties.NotifyKilled(_state, member);
            }

            Assert.That(
                _state.BountyEncounters[0].Status,
                Is.EqualTo(BountyEncounterStatus.Completed));
            Assert.That(_state.BountiesCompletedThisWave, Is.EqualTo(1));
            Assert.That(_state.GroundDrops, Has.Count.EqualTo(1));
            Assert.That(
                _state.GroundDrops[0].CardType,
                Is.EqualTo(offer.RewardCardType));
            Assert.That(
                _state.GroundDrops[0].LifeRemaining,
                Is.EqualTo(12f));
            Assert.That(_state.Wildcards[1], Is.EqualTo(1));
        }

        [Test]
        public void FirstBountyBreachFailsEncounterWithoutReward()
        {
            BountyOfferState offer = _bounties.CreateOffer(
                _state,
                false);
            _bounties.AcceptAt(_state, offer.Position);
            _bounties.Step(_state, 1f);
            EnemyState breached = _state.Enemies[0];

            Assert.That(
                _bounties.NotifyBreached(_state, breached),
                Is.True);

            Assert.That(
                _state.BountyEncounters[0].Status,
                Is.EqualTo(BountyEncounterStatus.Failed));
            Assert.That(_state.GroundDrops, Is.Empty);
            Assert.That(_state.Wildcards[1], Is.Zero);
            Assert.That(
                _state.Enemies,
                Has.All.Matches<EnemyState>(
                    enemy => enemy.SpawnKind == EnemySpawnKind.Regular
                        && !enemy.BountyEncounterId.HasValue));
        }

        [Test]
        public void ValidationStageCannotCreateBountyOffer()
        {
            _state.BeginWave(_waves.totalWaves);
            _bounties.OnWaveStarted(_state);

            Assert.That(_bounties.CanCreateOffer(_state), Is.False);
        }

        [Test]
        public void TurretPrioritizesBountyUnlessRegularEnemyIsEmergencyClose()
        {
            var combat = new CombatSystem(
                _combat,
                GameConfigLoader.LoadEnemies(),
                _drops,
                null,
                _bounties);
            var regular = new EnemyState(
                1,
                EnemyKind.Normal,
                new Float2(
                    _combat.turret.x + 110f,
                    _combat.turret.y),
                20f,
                0f,
                10f,
                1f);
            BountyOfferState offer = _bounties.CreateOffer(
                _state,
                false);
            _bounties.AcceptAt(_state, offer.Position);
            _bounties.Step(_state, 0.01f);
            EnemyState bounty = _state.Enemies[0];
            bounty.Position = new Float2(
                _combat.turret.x + 150f,
                _combat.turret.y);
            _state.Enemies.Clear();
            _state.Enemies.Add(regular);
            _state.Enemies.Add(bounty);

            Assert.That(combat.FindTarget(_state), Is.SameAs(bounty));

            regular.Position = new Float2(
                _combat.turret.x + 80f,
                _combat.turret.y);
            Assert.That(combat.FindTarget(_state), Is.SameAs(regular));
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
