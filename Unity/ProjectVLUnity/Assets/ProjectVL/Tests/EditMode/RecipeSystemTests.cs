using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class RecipeSystemTests
    {
        private GameState _state;
        private EvolutionRecipesConfig _recipes;
        private RecipeSystem _system;

        [SetUp]
        public void SetUp()
        {
            _state = GameStateFactory.Create(
                CombatConfigLoader.LoadDefault());
            _recipes = GameConfigLoader.LoadEvolutionRecipes();
            _system = new RecipeSystem(_recipes);
        }

        [Test]
        public void LoadsAllSixWebFixedRecipes()
        {
            Assert.That(_recipes.recipes, Has.Length.EqualTo(6));
            Assert.That(
                _recipes.recipes[0].id,
                Is.EqualTo("frozenThunder"));
            Assert.That(
                _recipes.recipes[5].id,
                Is.EqualTo("goldenIdol"));
        }

        [Test]
        public void RecipeCanOnlyBeCraftedDuringIntermission()
        {
            AddResolvedCard("pierce", 5, 0);
            AddResolvedCard("scorch", 5, 1);

            RecipeCraftResult result = _system.Craft(
                _state,
                "solarLance");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.WrongPhase));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("pierce"));
            Assert.That(_state.Hand[1].Type, Is.EqualTo("scorch"));
        }

        [Test]
        public void SolarLanceConsumesMaterialsAndCreatesTerminalCard()
        {
            _state.SetIntermission(true);
            AddResolvedCard("pierce", 5, 0);
            AddResolvedCard("scorch", 5, 1);

            RecipeCraftResult result = _system.Craft(
                _state,
                "solarLance");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.Crafted));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("solarLance"));
            Assert.That(_state.Hand[0].Star, Is.EqualTo(6));
            Assert.That(_state.Hand[0].Provisional, Is.False);
            Assert.That(_state.Hand[1], Is.Null);
            Assert.That(
                _state.CompletedRecipes,
                Does.Contain("solarLance"));
            Assert.That(
                _state.CardTypeRunStats["solarLance"].Collected,
                Is.EqualTo(1));
            Assert.That(
                _state.CardTypeRunStats["solarLance"].HighestStarReached,
                Is.EqualTo(6));
        }

        [Test]
        public void CraftingEquippedMaterialsInvalidatesCachedEffects()
        {
            _state.SetIntermission(true);
            typeof(GameState)
                .GetProperty(nameof(GameState.EquipmentEffectWave))
                ?.SetValue(_state, 9);
            _state.Equipment[0] = CreateResolvedCard("aegis", 5);
            _state.Equipment[1] = CreateResolvedCard("thorns", 5);

            RecipeCraftResult result = _system.Craft(
                _state,
                "crownOfThorns");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.Crafted));
            Assert.That(_state.Equipment[0], Is.Null);
            Assert.That(_state.Equipment[1], Is.Null);
            Assert.That(_state.Hand[0].Type, Is.EqualTo("crownOfThorns"));
            Assert.That(_state.EquipmentEffectWave, Is.Zero);
        }

        [Test]
        public void AvailableRecipeMatchesCurrentMaterials()
        {
            _state.SetIntermission(true);
            AddResolvedCard("aegis", 5, 0);
            AddResolvedCard("thorns", 5, 1);

            string recipe = _system.FirstAvailableRecipe(_state);

            Assert.That(recipe, Is.EqualTo("crownOfThorns"));
        }

        [Test]
        public void MissingMaterialsDoNotMutateInventory()
        {
            _state.SetIntermission(true);
            AddResolvedCard("pierce", 5, 0);

            RecipeCraftResult result = _system.Craft(
                _state,
                "solarLance");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.MissingMaterials));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("pierce"));
            Assert.That(_state.CompletedRecipes, Is.Empty);
        }

        [Test]
        public void CompletedRecipeCannotBeCraftedTwice()
        {
            _state.SetIntermission(true);
            AddResolvedCard("pierce", 5, 0);
            AddResolvedCard("scorch", 5, 1);
            _system.Craft(_state, "solarLance");
            AddResolvedCard("pierce", 5, 1);
            AddResolvedCard("scorch", 5, 2);

            RecipeCraftResult result = _system.Craft(
                _state,
                "solarLance");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.AlreadyCompleted));
        }

        private void AddResolvedCard(string type, int star, int slot)
        {
            _state.Hand[slot] = CreateResolvedCard(type, star);
        }

        private CardState CreateResolvedCard(string type, int star)
        {
            CardState card = _state.CreateCard(type, star);
            card.EvolutionPath.Add($"3:{type}A");
            card.EvolutionPath.Add($"5:{type}A2");
            return card;
        }
    }
}
