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
        private CombatConfig _combat;
        private CombatSystem _combatSystem;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _state = GameStateFactory.Create(_combat);
            _combatSystem = new CombatSystem(
                _combat,
                GameConfigLoader.LoadEnemies());
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

        [Test]
        public void EquippedScopedAffixScalesCardProfile()
        {
            CardState card = _state.CreateCard("frost", 3);
            card.EvolutionPath.Add("3:frostA");
            card.Affixes.Add(new CardAffixRoll(
                "controlPotencyMul",
                0.1f,
                5f));
            _state.Equipment[0] = card;

            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);

            Assert.That(
                profile.SlowRatio,
                Is.EqualTo(0.33f).Within(0.001f));
        }

        [Test]
        public void ConsumableAffixAppliesToItsCurrentCast()
        {
            CardState card = _state.CreateCard("pierce", 1);
            card.Affixes.Add(new CardAffixRoll(
                "damageAdd",
                5f,
                5f));
            EnemyState enemy = AddEnemy(
                new Float2(250f, 437f),
                100f);

            bool cast = _combatSystem.CastConsumable(
                _state,
                card,
                enemy.Position);

            Assert.That(cast, Is.True);
            Assert.That(enemy.Hp, Is.EqualTo(31f).Within(0.001f));
            Assert.That(
                CardAffixSystem.RuntimeAdd(
                    _state,
                    "damageAdd"),
                Is.EqualTo(5f));
        }

        [Test]
        public void FailedConsumableRollsBackTimedAffixes()
        {
            CardState card = _state.CreateCard("unknown", 1);
            card.Affixes.Add(new CardAffixRoll(
                "damageAdd",
                5f,
                5f));

            bool cast = _combatSystem.CastConsumable(
                _state,
                card,
                new Float2());

            Assert.That(cast, Is.False);
            Assert.That(_state.RuntimeCardAffixes, Is.Empty);
        }

        [Test]
        public void RuntimeAffixExpiresAtConfiguredDuration()
        {
            CardState card = _state.CreateCard("pierce", 1);
            card.Affixes.Add(new CardAffixRoll(
                "damageAdd",
                2f,
                5f));
            CardAffixSystem.ActivateConsumable(_state, card);

            CardAffixSystem.StepRuntime(_state, 4.9f);
            Assert.That(_state.RuntimeCardAffixes, Has.Count.EqualTo(1));

            CardAffixSystem.StepRuntime(_state, 0.1f);
            Assert.That(_state.RuntimeCardAffixes, Is.Empty);
        }

        [Test]
        public void MultiAffixFiresAdditionalProjectile()
        {
            CardState card = _state.CreateCard("arcSplitter", 3);
            card.EvolutionPath.Add("3:arcSplitterA");
            card.Affixes.Add(new CardAffixRoll(
                "multiAdd",
                1f,
                5f));
            _state.Equipment[0] = card;
            AddEnemy(new Float2(250f, 437f), 100f);

            _combatSystem.StepTurret(_state, 1f);

            Assert.That(_state.Bullets, Has.Count.EqualTo(2));
        }

        [Test]
        public void MaxHpAffixReconcilesWhenEquipmentChanges()
        {
            var inventory = new CardInventorySystem(new EconomyConfig());
            CardState card = _state.CreateCard("aegis", 3);
            card.Affixes.Add(new CardAffixRoll(
                "maxHpAdd",
                10f,
                5f));
            _state.Hand[0] = card;

            inventory.MoveOrSwap(
                _state,
                CardSlotKind.Hand,
                0,
                CardSlotKind.Equipment,
                0);
            Assert.That(_state.MaxHp, Is.EqualTo(110f));
            Assert.That(_state.Hp, Is.EqualTo(110f));

            inventory.MoveOrSwap(
                _state,
                CardSlotKind.Equipment,
                0,
                CardSlotKind.Hand,
                0);
            Assert.That(_state.MaxHp, Is.EqualTo(100f));
            Assert.That(_state.Hp, Is.EqualTo(100f));
        }

        private EnemyState AddEnemy(Float2 position, float hp)
        {
            var enemy = new EnemyState(
                _state.Enemies.Count + 1,
                EnemyKind.Normal,
                position,
                hp,
                10f,
                8f,
                1f);
            _state.Enemies.Add(enemy);
            return enemy;
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
