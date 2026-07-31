using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public static class EvolutionBranchProfileCompiler
    {
        public static bool ApplyFiveStar(
            CardState card,
            CardCombatProfile profile)
        {
            if (card == null || card.Star < 5 || profile == null)
                return false;
            string optionId = RouteAt(card, 5);
            CompiledEvolutionOptionConfig option =
                EvolutionBranchEffectCatalog.Default.Find(
                    card.Type,
                    NormalizeOptionId(card.Type, optionId));
            return option != null
                && RecipeProductProfileCompiler.Apply(
                    option.bindings,
                    profile);
        }

        public static bool ApplyOption(
            string cardId,
            string optionId,
            CardCombatProfile profile)
        {
            CompiledEvolutionOptionConfig option =
                EvolutionBranchEffectCatalog.Default.Find(cardId, optionId);
            return option != null
                && RecipeProductProfileCompiler.Apply(
                    option.bindings,
                    profile);
        }

        private static string RouteAt(CardState card, int checkpoint)
        {
            string prefix = checkpoint + ":";
            foreach (string entry in card.EvolutionPath)
            {
                if (entry.StartsWith(prefix))
                    return entry.Substring(prefix.Length);
            }
            return string.Empty;
        }

        private static string NormalizeOptionId(
            string cardId,
            string optionId)
        {
            if (optionId == cardId + "A2") return cardId + "1x";
            if (optionId == cardId + "B2") return cardId + "2x";
            if (optionId == cardId + "C2") return cardId + "3x";
            return optionId;
        }
    }
}
