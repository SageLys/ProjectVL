using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class RecipeSystem
    {
        private readonly EvolutionRecipesConfig _config;
        private readonly CardAffixSystem _affixes;
        private readonly HashSet<string> _announced =
            new HashSet<string>();

        public RecipeSystem(
            EvolutionRecipesConfig config,
            CardAffixSystem affixes = null)
        {
            _config = config;
            _affixes = affixes;
        }

        public string FirstAvailableRecipe(GameState state)
        {
            if (state == null || !state.IntermissionActive)
            {
                return null;
            }

            foreach (EvolutionRecipeConfig recipe in _config.recipes)
            {
                if (!state.CompletedRecipes.Contains(recipe.id)
                    && TryFindMaterials(
                        state,
                        recipe,
                        out CardLocation first,
                        out CardLocation second)
                    && OutputHandSlot(state, first, second) >= 0)
                {
                    string key = state.Wave + ":" + recipe.id;
                    if (_announced.Add(key))
                    {
                        state.EmitTelemetry(new TelemetryEventRecord
                        {
                            type = "recipe_available",
                            recipeId = recipe.id,
                            recipeIds = new[] { recipe.id }
                        });
                    }
                    return recipe.id;
                }
            }

            return null;
        }

        public RecipeCraftResult Craft(GameState state, string recipeId)
        {
            if (state == null || !state.IntermissionActive)
            {
                return RecipeCraftResult.WrongPhase;
            }

            EvolutionRecipeConfig recipe = FindRecipe(recipeId);
            if (recipe == null)
            {
                return RecipeCraftResult.UnknownRecipe;
            }

            if (state.CompletedRecipes.Contains(recipe.id))
            {
                return RecipeCraftResult.AlreadyCompleted;
            }

            if (!TryFindMaterials(
                state,
                recipe,
                out CardLocation first,
                out CardLocation second))
            {
                return RecipeCraftResult.MissingMaterials;
            }

            int outputSlot = OutputHandSlot(state, first, second);
            if (outputSlot < 0)
            {
                return RecipeCraftResult.HandFull;
            }

            Slots(state, first.Kind)[first.Index] = null;
            Slots(state, second.Kind)[second.Index] = null;
            CardState output = state.CreateCard(
                recipe.outputCardId,
                recipe.outputStar);
            _affixes?.Attach(state, output);
            state.Hand[outputSlot] = output;
            state.RecordCardCollected(
                recipe.outputCardId,
                recipe.outputStar);
            state.EquipmentEffectWave = 0;
            CardAffixSystem.ReconcileMaxHp(state);
            state.CompletedRecipes.Add(recipe.id);
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "recipe_completed",
                recipeId = recipe.id,
                cardType = recipe.outputCardId,
                outputStar = recipe.outputStar
            });
            return RecipeCraftResult.Crafted;
        }

        private EvolutionRecipeConfig FindRecipe(string recipeId)
        {
            foreach (EvolutionRecipeConfig recipe in _config.recipes)
            {
                if (recipe.id == recipeId)
                {
                    return recipe;
                }
            }

            return null;
        }

        private static bool TryFindMaterials(
            GameState state,
            EvolutionRecipeConfig recipe,
            out CardLocation first,
            out CardLocation second)
        {
            first = FindMaterial(
                state,
                recipe.ingredientA,
                null);
            second = FindMaterial(
                state,
                recipe.ingredientB,
                first);
            return first != null && second != null;
        }

        private static CardLocation FindMaterial(
            GameState state,
            CardRequirementConfig requirement,
            CardLocation excluded)
        {
            CardLocation found = FindInSlots(
                state.Hand,
                CardSlotKind.Hand,
                requirement,
                excluded);
            return found ?? FindInSlots(
                state.Equipment,
                CardSlotKind.Equipment,
                requirement,
                excluded);
        }

        private static CardLocation FindInSlots(
            CardState[] slots,
            CardSlotKind kind,
            CardRequirementConfig requirement,
            CardLocation excluded)
        {
            for (int i = 0; i < slots.Length; i++)
            {
                CardState card = slots[i];
                if (card == null
                    || card.Provisional
                    || card.Type != requirement.cardId
                    || card.Star < requirement.minStar
                    || (excluded != null
                        && excluded.Kind == kind
                        && excluded.Index == i))
                {
                    continue;
                }

                return new CardLocation(kind, i);
            }

            return null;
        }

        private static int OutputHandSlot(
            GameState state,
            CardLocation first,
            CardLocation second)
        {
            if (first?.Kind == CardSlotKind.Hand)
            {
                return first.Index;
            }

            if (second?.Kind == CardSlotKind.Hand)
            {
                return second.Index;
            }

            for (int i = 0; i < state.Hand.Length; i++)
            {
                if (state.Hand[i] == null)
                {
                    return i;
                }
            }

            return -1;
        }

        private static CardState[] Slots(
            GameState state,
            CardSlotKind kind)
        {
            return kind == CardSlotKind.Hand
                ? state.Hand
                : state.Equipment;
        }

        private sealed class CardLocation
        {
            public CardSlotKind Kind { get; }
            public int Index { get; }

            public CardLocation(CardSlotKind kind, int index)
            {
                Kind = kind;
                Index = index;
            }
        }
    }
}
