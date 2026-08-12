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

        private static readonly HashSet<string> ValidSynergyTags =
            new HashSet<string>(
                new[]
                {
                    "projectile",
                    "control",
                    "domain",
                    "defense",
                    "utility"
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
                if (card.synergyTags == null
                    || card.synergyTags.Length < 1
                    || card.synergyTags.Length > 2)
                {
                    errors.Add(
                        $"{card.id} requires one or two synergy tags.");
                }
                else
                {
                    var tags = new HashSet<string>(StringComparer.Ordinal);
                    foreach (string tag in card.synergyTags)
                    {
                        if (!ValidSynergyTags.Contains(tag)
                            || !tags.Add(tag))
                        {
                            errors.Add(
                                $"Invalid synergy tag for {card.id}: {tag}.");
                        }
                    }
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
                    if (string.IsNullOrWhiteSpace(card.primaryGod)
                        || card.primaryGod != card.god
                        || card.sourceGods == null
                        || card.sourceGods.Length < 1)
                    {
                        errors.Add(
                            $"Recipe card {card.id} requires ownership metadata.");
                    }
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
            if (recipeCount != 25)
            {
                errors.Add(
                    $"Expected 25 recipe cards, found {recipeCount}.");
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

            var unique = new HashSet<string>(StringComparer.Ordinal);
            foreach (string option in options)
            {
                if (string.IsNullOrWhiteSpace(option)
                    || !unique.Add(option))
                {
                    errors.Add(
                        $"{card.id} {checkpoint}-star choices must be "
                        + "non-empty and unique.");
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

            if (recipes.recipes.Length != 25)
            {
                errors.Add(
                    $"Expected 25 recipes, found {recipes.recipes.Length}.");
            }

            var recipeIds = new HashSet<string>(StringComparer.Ordinal);
            var outputReferences =
                new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (EvolutionRecipeConfig recipe in recipes.recipes)
            {
                if (recipe == null
                    || string.IsNullOrWhiteSpace(recipe.id)
                    || !recipeIds.Add(recipe.id))
                {
                    errors.Add($"Invalid or duplicate recipe id: {recipe?.id}.");
                    continue;
                }
                ValidateRecipeCard(
                    recipe.id,
                    recipe.ingredientVariable?.cardId,
                    false,
                    definitions,
                    errors);
                ValidateRecipeCard(
                    recipe.id,
                    recipe.ingredientAnchor?.cardId,
                    false,
                    definitions,
                    errors);
                ValidateRecipeCard(
                    recipe.id,
                    recipe.outputCardId,
                    true,
                    definitions,
                    errors);
                if (recipe.outputStar != 6)
                {
                    errors.Add(
                        $"Recipe {recipe.id} output must be 6-star.");
                }
                if (recipe.ingredientVariable?.minStar != 5
                    || recipe.ingredientAnchor?.minStar != 5)
                {
                    errors.Add(
                        $"Recipe {recipe.id} ingredients must require 5-star cards.");
                }

                outputReferences[recipe.outputCardId] =
                    outputReferences.TryGetValue(
                        recipe.outputCardId,
                        out int count)
                        ? count + 1
                        : 1;
            }

            foreach (CardDefinitionConfig definition in definitions.Values)
            {
                if (definition.recipeOnly
                    && (!outputReferences.TryGetValue(
                            definition.id,
                            out int count)
                        || count != 1))
                {
                    errors.Add(
                        $"Recipe card {definition.id} must be output by exactly one recipe.");
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
