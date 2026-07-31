using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public sealed class EvolutionBranchEffectCatalog
    {
        private static readonly HashSet<string> SupportedTriggers =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "passive", "onHit", "onKill", "interval", "onWaveStart",
                "onBreach", "onMerge", "onPickup"
            };

        private static readonly HashSet<string> SupportedAtoms =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "aoeOnHit", "aura", "breachReduction", "burstDamage",
                "chain", "dot", "dropLifetimeMul", "dropRateMul", "execute",
                "expiryConvert", "extraDrop", "focusPriority", "freeze",
                "groundZone", "knockback", "mergeMaterialRefund", "mergePulse",
                "novaOnBreak", "restore", "shield", "slow", "split",
                "statBuff", "stun", "summon", "thorns", "vulnerable",
                "wildcardRewardBonus", "xpMul"
            };

        private readonly Dictionary<string, CompiledEvolutionOptionConfig>
            _byOption = new Dictionary<string, CompiledEvolutionOptionConfig>(
                StringComparer.Ordinal);

        public EvolutionBranchEffectCatalog(
            EvolutionBranchEffectsConfig config,
            CardsConfig cards)
        {
            if (config?.cards == null)
                throw new ArgumentNullException(nameof(config));
            if (cards?.cards == null)
                throw new ArgumentNullException(nameof(cards));

            var compiledCards = new HashSet<string>(StringComparer.Ordinal);
            foreach (CompiledEvolutionCardConfig compiled in config.cards)
            {
                CardDefinitionConfig definition = FindCard(cards, compiled?.cardId);
                if (definition == null
                    || definition.recipeOnly
                    || compiled.options == null
                    || !compiledCards.Add(compiled.cardId))
                {
                    throw new InvalidOperationException(
                        $"Invalid compiled evolution card {compiled?.cardId}.");
                }

                if (compiled.options.Length != definition.evolution5.Length)
                {
                    throw new InvalidOperationException(
                        $"Evolution option count mismatch for {compiled.cardId}.");
                }

                foreach (CompiledEvolutionOptionConfig option in compiled.options)
                {
                    if (option == null
                        || Array.IndexOf(definition.evolution5, option.optionId) < 0
                        || option.bindings == null
                        || option.bindings.Length == 0
                        || !_byOption.TryAdd(Key(compiled.cardId, option.optionId), option))
                    {
                        throw new InvalidOperationException(
                            $"Invalid five-star option for {compiled.cardId}.");
                    }

                    foreach (CompiledEffectBindingConfig binding in option.bindings)
                    {
                        if (binding == null
                            || !SupportedTriggers.Contains(binding.trigger)
                            || binding.effects == null
                            || binding.effects.Length == 0)
                        {
                            throw new InvalidOperationException(
                                $"Invalid binding for {option.optionId}.");
                        }
                        foreach (CompiledEffectAtomConfig atom in binding.effects)
                            ValidateAtom(option.optionId, atom);
                    }
                }
            }

            int normalCards = 0;
            foreach (CardDefinitionConfig definition in cards.cards)
            {
                if (definition.recipeOnly)
                    continue;
                normalCards++;
                if (!compiledCards.Contains(definition.id))
                    throw new InvalidOperationException(
                        $"Missing five-star effects for {definition.id}.");
            }
            if (normalCards != 35 || compiledCards.Count != 35
                || _byOption.Count != 105)
            {
                throw new InvalidOperationException(
                    $"Expected 35 cards and 105 options, found "
                    + $"{compiledCards.Count} and {_byOption.Count}.");
            }
        }

        public CompiledEvolutionOptionConfig Find(
            string cardId,
            string optionId)
        {
            return _byOption.TryGetValue(
                Key(cardId, optionId),
                out CompiledEvolutionOptionConfig option)
                ? option
                : null;
        }

        private static CardDefinitionConfig FindCard(
            CardsConfig cards,
            string cardId)
        {
            foreach (CardDefinitionConfig card in cards.cards)
            {
                if (card?.id == cardId)
                    return card;
            }
            return null;
        }

        private static void ValidateAtom(
            string optionId,
            CompiledEffectAtomConfig atom)
        {
            if (atom == null || !SupportedAtoms.Contains(atom.atom))
                throw new InvalidOperationException(
                    $"Unsupported atom {atom?.atom} for {optionId}.");
            foreach (CompiledEffectAtomConfig child
                in atom.children ?? Array.Empty<CompiledEffectAtomConfig>())
            {
                ValidateAtom(optionId, child);
            }
        }

        private static string Key(string cardId, string optionId)
        {
            return (cardId ?? string.Empty) + ":" + (optionId ?? string.Empty);
        }
    }
}
