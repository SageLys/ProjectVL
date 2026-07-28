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
        public CardRequirementConfig ingredientA =
            new CardRequirementConfig();
        public CardRequirementConfig ingredientB =
            new CardRequirementConfig();
        public string outputCardId;
        public int outputStar;
        public string allowedPhase;
    }

    [Serializable]
    public sealed class CardRequirementConfig
    {
        public string cardId;
        public int minStar;
    }
}
