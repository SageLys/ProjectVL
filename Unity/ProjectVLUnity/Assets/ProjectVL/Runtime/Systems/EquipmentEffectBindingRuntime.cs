using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class RuntimeEquipmentBinding
    {
        public CardState Card { get; }
        public int BindingIndex { get; }
        public CompiledEffectBindingConfig Binding { get; }
        public string SourceKey =>
            Card.Type + "/" + Card.Id + "/" + BindingIndex;

        internal RuntimeEquipmentBinding(
            CardState card,
            int bindingIndex,
            CompiledEffectBindingConfig binding)
        {
            Card = card;
            BindingIndex = bindingIndex;
            Binding = binding;
        }
    }

    public static class EquipmentEffectBindingRuntime
    {
        public static IReadOnlyList<RuntimeEquipmentBinding> Resolve(
            GameState state,
            string trigger = null)
        {
            var cards = new List<CardState>();
            if (state?.Equipment == null)
                return Array.Empty<RuntimeEquipmentBinding>();

            foreach (CardState card in state.Equipment)
            {
                if (card != null
                    && !card.Provisional
                    && card.Star >= 3)
                {
                    cards.Add(card);
                }
            }
            cards.Sort(CompareCards);

            var result = new List<RuntimeEquipmentBinding>();
            foreach (CardState card in cards)
            {
                CompiledEffectBindingConfig[] bindings = BindingsFor(card);
                for (int index = 0; index < bindings.Length; index++)
                {
                    CompiledEffectBindingConfig binding = bindings[index];
                    if (binding == null
                        || (!string.IsNullOrEmpty(trigger)
                            && binding.trigger != trigger))
                    {
                        continue;
                    }
                    result.Add(new RuntimeEquipmentBinding(
                        card,
                        index,
                        binding));
                }
            }
            return result;
        }

        private static CompiledEffectBindingConfig[] BindingsFor(
            CardState card)
        {
            if (card.Star >= 6)
            {
                RecipeProductCardEffectsConfig recipe =
                    RecipeProductEffectCatalog.Default.Find(card.Type);
                if (recipe != null)
                    return recipe.bindings;
            }

            if (card.Star < 5)
                return Array.Empty<CompiledEffectBindingConfig>();
            string optionId = NormalizeOptionId(
                card.Type,
                RouteAt(card, 5));
            return EvolutionBranchEffectCatalog.Default.Find(
                card.Type,
                optionId)?.bindings
                ?? Array.Empty<CompiledEffectBindingConfig>();
        }

        private static int CompareCards(CardState left, CardState right)
        {
            int byType = string.CompareOrdinal(left.Type, right.Type);
            return byType != 0 ? byType : left.Id.CompareTo(right.Id);
        }

        private static string RouteAt(CardState card, int checkpoint)
        {
            string prefix = checkpoint + ":";
            foreach (string entry in card.EvolutionPath)
            {
                if (entry.StartsWith(prefix, StringComparison.Ordinal))
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
