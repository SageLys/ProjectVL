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
        public void LoadsAllTwentyFiveDirectedRecipes()
        {
            Assert.That(_recipes.version, Is.EqualTo("0.2.0"));
            Assert.That(_recipes.recipes, Has.Length.EqualTo(25));
            Assert.That(
                _recipes.recipes[0].id,
                Is.EqualTo("r_arcSplitter_pierce"));
            Assert.That(
                _recipes.recipes[24].id,
                Is.EqualTo("r_overgrowth_harvest"));
        }

        [Test]
        public void RecipeCanOnlyBeCraftedDuringIntermission()
        {
            AddResolvedCard("meteor", 5, 0);
            AddResolvedCard("pierce", 5, 1);

            RecipeCraftResult result = _system.Craft(
                _state,
                "r_meteor_pierce");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.WrongPhase));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("meteor"));
            Assert.That(_state.Hand[1].Type, Is.EqualTo("pierce"));
        }

        [Test]
        public void SolarPiercerConsumesMaterialsAndCreatesTerminalCard()
        {
            _state.SetIntermission(true);
            AddResolvedCard("meteor", 5, 0);
            AddResolvedCard("pierce", 5, 1);

            RecipeCraftResult result = _system.Craft(
                _state,
                "r_meteor_pierce");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.Crafted));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("solarPiercer"));
            Assert.That(_state.Hand[0].Star, Is.EqualTo(6));
            Assert.That(_state.Hand[0].Provisional, Is.False);
            Assert.That(_state.Hand[1], Is.Null);
            Assert.That(
                _state.CompletedRecipes,
                Does.Contain("r_meteor_pierce"));
            Assert.That(
                _state.CardTypeRunStats["solarPiercer"].Collected,
                Is.EqualTo(1));
            Assert.That(
                _state.CardTypeRunStats["solarPiercer"].HighestStarReached,
                Is.EqualTo(6));
        }

        [Test]
        public void CraftingEquippedMaterialsInvalidatesCachedEffects()
        {
            _state.SetIntermission(true);
            typeof(GameState)
                .GetProperty(nameof(GameState.EquipmentEffectWave))
                ?.SetValue(_state, 9);
            _state.Equipment[0] = CreateResolvedCard("sanctum", 5);
            _state.Equipment[1] = CreateResolvedCard("aegis", 5);

            RecipeCraftResult result = _system.Craft(
                _state,
                "r_sanctum_aegis");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.Crafted));
            Assert.That(_state.Equipment[0], Is.Null);
            Assert.That(_state.Equipment[1], Is.Null);
            Assert.That(_state.Hand[0].Type, Is.EqualTo("aegisCitadel"));
            Assert.That(_state.EquipmentEffectWave, Is.Zero);
        }

        [Test]
        public void AvailableRecipeMatchesCurrentMaterials()
        {
            _state.SetIntermission(true);
            AddResolvedCard("sanctum", 5, 0);
            AddResolvedCard("aegis", 5, 1);

            string recipe = _system.FirstAvailableRecipe(_state);

            Assert.That(recipe, Is.EqualTo("r_sanctum_aegis"));
        }

        [Test]
        public void MissingMaterialsDoNotMutateInventory()
        {
            _state.SetIntermission(true);
            AddResolvedCard("meteor", 5, 0);

            RecipeCraftResult result = _system.Craft(
                _state,
                "r_meteor_pierce");

            Assert.That(result, Is.EqualTo(RecipeCraftResult.MissingMaterials));
            Assert.That(_state.Hand[0].Type, Is.EqualTo("meteor"));
            Assert.That(_state.CompletedRecipes, Is.Empty);
        }

        [Test]
        public void CompletedRecipeCannotBeCraftedTwice()
        {
            _state.SetIntermission(true);
            AddResolvedCard("meteor", 5, 0);
            AddResolvedCard("pierce", 5, 1);
            _system.Craft(_state, "r_meteor_pierce");
            AddResolvedCard("meteor", 5, 1);
            AddResolvedCard("pierce", 5, 2);

            RecipeCraftResult result = _system.Craft(
                _state,
                "r_meteor_pierce");

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
