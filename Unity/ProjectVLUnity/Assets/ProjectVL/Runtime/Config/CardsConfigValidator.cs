using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public static class CardsConfigValidator
    {
        private static readonly HashSet<string> ValidGods =
            new HashSet<string>(
                new[]
                {
                    "storm",
                    "winter",
                    "inferno",
                    "bulwark",
                    "plenty"
                },
                StringComparer.Ordinal);

        private static readonly HashSet<string> ValidCategories =
            new HashSet<string>(
                new[]
                {
                    "projectile",
                    "control",
                    "domain",
                    "defense",
                    "economy"
                },
                StringComparer.Ordinal);

        public static IReadOnlyList<string> Validate(
            CardsConfig cards,
            GodsConfig gods = null,
            EvolutionRecipesConfig recipes = null)
        {
            var errors = new List<string>();
            if (cards?.cards == null)
            {
                errors.Add("Cards config is missing.");
                return errors;
            }

            var ids = new HashSet<string>(StringComparer.Ordinal);
            var definitions =
                new Dictionary<string, CardDefinitionConfig>(
                    StringComparer.Ordinal);
            int playableCount = 0;
            int recipeCount = 0;
            foreach (CardDefinitionConfig card in cards.cards)
            {
                if (card == null || string.IsNullOrWhiteSpace(card.id))
                {
                    errors.Add("Card id is required.");
                    continue;
                }

                if (!ids.Add(card.id))
                {
                    errors.Add($"Duplicate card id: {card.id}.");
                }
                else
                {
                    definitions.Add(card.id, card);
                }
                if (!ValidGods.Contains(card.god))
                {
                    errors.Add($"Unknown god for {card.id}: {card.god}.");
                }
                if (!ValidCategories.Contains(card.category))
                {
                    errors.Add(
                        $"Unknown category for {card.id}: {card.category}.");
                }
                if (string.IsNullOrWhiteSpace(card.displayName))
                {
                    errors.Add($"Display name is required for {card.id}.");
                }
                if (!card.consumable)
                {
                    errors.Add($"Consumable effect is missing for {card.id}.");
                }

                if (card.recipeOnly)
                {
                    recipeCount++;
                    if ((card.evolution3?.Length ?? 0) != 0
                        || (card.evolution5?.Length ?? 0) != 0)
                    {
                        errors.Add(
                            $"Recipe card {card.id} cannot have evolution choices.");
                    }
                }
                else
                {
                    playableCount++;
                    ValidateEvolution(card, 3, card.evolution3, errors);
                    ValidateEvolution(card, 5, card.evolution5, errors);
                }
            }

            if (playableCount != 35)
            {
                errors.Add(
                    $"Expected 35 playable cards, found {playableCount}.");
            }
            if (recipeCount != 6)
            {
                errors.Add(
                    $"Expected 6 recipe cards, found {recipeCount}.");
            }

            ValidateGodRosters(gods, definitions, errors);
            ValidateRecipes(recipes, definitions, errors);
            return errors;
        }

        public static void ThrowIfInvalid(
            CardsConfig cards,
            GodsConfig gods = null,
            EvolutionRecipesConfig recipes = null)
        {
            IReadOnlyList<string> errors =
                Validate(cards, gods, recipes);
            if (errors.Count > 0)
            {
                throw new InvalidOperationException(
                    string.Join(Environment.NewLine, errors));
            }
        }

        private static void ValidateEvolution(
            CardDefinitionConfig card,
            int checkpoint,
            string[] options,
            List<string> errors)
        {
            if (options == null || options.Length != 3)
            {
                errors.Add(
                    $"{card.id} requires three {checkpoint}-star choices.");
                return;
            }

            string suffix = checkpoint == 3 ? "" : "2";
            for (int index = 0; index < options.Length; index++)
            {
                string expected =
                    card.id + (char)('A' + index) + suffix;
                if (options[index] != expected)
                {
                    errors.Add(
                        $"{card.id} {checkpoint}-star choice {index} "
                        + $"must be {expected}, found {options[index]}.");
                }
            }
        }

        private static void ValidateGodRosters(
            GodsConfig gods,
            Dictionary<string, CardDefinitionConfig> definitions,
            List<string> errors)
        {
            if (gods?.gods == null)
            {
                return;
            }

            foreach (GodConfig god in gods.gods)
            {
                ValidateRoster(
                    god?.id,
                    god?.anchorCardIds,
                    definitions,
                    errors);
                ValidateRoster(
                    god?.id,
                    god?.variableCardIds,
                    definitions,
                    errors);
            }
        }

        private static void ValidateRoster(
            string godId,
            string[] roster,
            Dictionary<string, CardDefinitionConfig> definitions,
            List<string> errors)
        {
            if (roster == null)
            {
                return;
            }

            foreach (string cardId in roster)
            {
                if (!definitions.TryGetValue(
                    cardId,
                    out CardDefinitionConfig card))
                {
                    errors.Add(
                        $"God {godId} references unknown card {cardId}.");
                    continue;
                }
                if (card.recipeOnly)
                {
                    errors.Add(
                        $"God {godId} roster cannot contain recipe card {cardId}.");
                }
                if (card.god != godId)
                {
                    errors.Add(
                        $"God {godId} roster contains {cardId} "
                        + $"owned by {card.god}.");
                }
            }
        }

        private static void ValidateRecipes(
            EvolutionRecipesConfig recipes,
            Dictionary<string, CardDefinitionConfig> definitions,
            List<string> errors)
        {
            if (recipes?.recipes == null)
            {
                return;
            }

            foreach (EvolutionRecipeConfig recipe in recipes.recipes)
            {
                ValidateRecipeCard(
                    recipe?.id,
                    recipe?.ingredientA?.cardId,
                    false,
                    definitions,
                    errors);
                ValidateRecipeCard(
                    recipe?.id,
                    recipe?.ingredientB?.cardId,
                    false,
                    definitions,
                    errors);
                ValidateRecipeCard(
                    recipe?.id,
                    recipe?.outputCardId,
                    true,
                    definitions,
                    errors);
                if (recipe != null
                    && recipe.id != recipe.outputCardId)
                {
                    errors.Add(
                        $"Recipe {recipe.id} output must use the same card id.");
                }
            }
        }

        private static void ValidateRecipeCard(
            string recipeId,
            string cardId,
            bool mustBeRecipe,
            Dictionary<string, CardDefinitionConfig> definitions,
            List<string> errors)
        {
            if (string.IsNullOrWhiteSpace(cardId)
                || !definitions.TryGetValue(
                    cardId,
                    out CardDefinitionConfig card))
            {
                errors.Add(
                    $"Recipe {recipeId} references unknown card {cardId}.");
                return;
            }

            if (card.recipeOnly != mustBeRecipe)
            {
                errors.Add(
                    mustBeRecipe
                        ? $"Recipe {recipeId} output {cardId} must be recipe-only."
                        : $"Recipe {recipeId} ingredient {cardId} cannot be recipe-only.");
            }
        }
    }
}
