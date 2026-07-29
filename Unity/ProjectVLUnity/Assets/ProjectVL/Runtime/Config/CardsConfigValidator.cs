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

            ValidateGodRosters(gods, ids, errors);
            ValidateRecipes(recipes, ids, errors);
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
            HashSet<string> ids,
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
                    ids,
                    errors);
                ValidateRoster(
                    god?.id,
                    god?.variableCardIds,
                    ids,
                    errors);
            }
        }

        private static void ValidateRoster(
            string godId,
            string[] roster,
            HashSet<string> ids,
            List<string> errors)
        {
            if (roster == null)
            {
                return;
            }

            foreach (string cardId in roster)
            {
                if (!ids.Contains(cardId))
                {
                    errors.Add(
                        $"God {godId} references unknown card {cardId}.");
                }
            }
        }

        private static void ValidateRecipes(
            EvolutionRecipesConfig recipes,
            HashSet<string> ids,
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
                    ids,
                    errors);
                ValidateRecipeCard(
                    recipe?.id,
                    recipe?.ingredientB?.cardId,
                    ids,
                    errors);
                ValidateRecipeCard(
                    recipe?.id,
                    recipe?.outputCardId,
                    ids,
                    errors);
            }
        }

        private static void ValidateRecipeCard(
            string recipeId,
            string cardId,
            HashSet<string> ids,
            List<string> errors)
        {
            if (string.IsNullOrWhiteSpace(cardId)
                || !ids.Contains(cardId))
            {
                errors.Add(
                    $"Recipe {recipeId} references unknown card {cardId}.");
            }
        }
    }
}
