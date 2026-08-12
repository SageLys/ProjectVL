using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class EvolutionRecipesConfig
    {
        public string version;
        public EvolutionRecipeConfig[] recipes =
            Array.Empty<EvolutionRecipeConfig>();
    }

    [Serializable]
    public sealed class EvolutionRecipeConfig
    {
        public string id;
        public string recipeType;
        public string variableGod;
        public string anchorGod;
        public CardRequirementConfig ingredientVariable =
            new CardRequirementConfig();
        public CardRequirementConfig ingredientAnchor =
            new CardRequirementConfig();
        public string outputCardId;
        public int outputStar;
        public string allowedPhase;

        public CardRequirementConfig ingredientA => ingredientVariable;
        public CardRequirementConfig ingredientB => ingredientAnchor;
    }

    [Serializable]
    public sealed class CardRequirementConfig
    {
        public string cardId;
        public int minStar;
    }
}
