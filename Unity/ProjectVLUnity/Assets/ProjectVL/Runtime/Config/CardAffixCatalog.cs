using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public sealed class CardAffixCatalog
    {
        private static readonly HashSet<string> AllowedStats =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "damageAdd",
                "fireRateAdd",
                "rangeAdd",
                "multiAdd",
                "maxHpAdd",
                "heal",
                "effectDamageMul",
                "quantityAdd",
                "controlPotencyMul",
                "controlledDamageTakenMul",
                "areaScaleMul",
                "dotDamageMul",
                "defenseDurabilityMul",
                "retaliationMul",
                "dropRateMul",
                "dropLifetimeMul",
                "xpMul"
            };

        private readonly Dictionary<string, CardAffixPoolConfig> _byCard =
            new Dictionary<string, CardAffixPoolConfig>(
                StringComparer.Ordinal);

        public CardAffixCatalog(
            CardAffixesConfig config,
            CardCatalog cards)
        {
            if (config?.cards == null)
            {
                throw new ArgumentNullException(nameof(config));
            }

            cards = cards ?? throw new ArgumentNullException(nameof(cards));
            foreach (CardAffixPoolConfig pool in config.cards)
            {
                ValidatePool(pool, cards);
                if (!_byCard.TryAdd(pool.cardId, pool))
                {
                    throw new InvalidOperationException(
                        $"Duplicate affix pool for {pool.cardId}.");
                }
            }

            foreach (CardDefinitionConfig card in cards.Cards)
            {
                if (!_byCard.ContainsKey(card.id))
                {
                    throw new InvalidOperationException(
                        $"Missing affix pool for {card.id}.");
                }
            }
        }

        public CardAffixPoolConfig Find(string cardId)
        {
            return !string.IsNullOrEmpty(cardId)
                && _byCard.TryGetValue(
                    cardId,
                    out CardAffixPoolConfig pool)
                ? pool
                : null;
        }

        private static void ValidatePool(
            CardAffixPoolConfig pool,
            CardCatalog cards)
        {
            if (pool == null || cards.Find(pool.cardId) == null)
            {
                throw new InvalidOperationException(
                    $"Affix pool references unknown card {pool?.cardId}.");
            }

            if (pool.count < 0
                || pool.candidates == null
                || pool.count > pool.candidates.Length)
            {
                throw new InvalidOperationException(
                    $"Invalid affix count for {pool.cardId}.");
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (CardAffixCandidateConfig candidate in pool.candidates)
            {
                if (candidate == null
                    || !AllowedStats.Contains(candidate.stat)
                    || !seen.Add(candidate.stat)
                    || candidate.weight <= 0f
                    || candidate.step <= 0f
                    || candidate.min > candidate.max
                    || candidate.consumableDuration < 0f)
                {
                    throw new InvalidOperationException(
                        $"Invalid affix candidate for {pool.cardId}.");
                }
            }
        }
    }
}
