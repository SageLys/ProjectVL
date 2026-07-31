using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public sealed class RecipeProductEffectCatalog
    {
        private static readonly HashSet<string> SupportedTriggers =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "passive", "onFire", "onHit", "onKill", "interval",
                "onWaveStart", "onBreach", "onMerge", "onPickup"
            };

        private static readonly HashSet<string> SupportedAtoms =
            new HashSet<string>(StringComparer.Ordinal)
            {
                "aura", "breachReduction", "burstDamage", "chain",
                "charge", "dot", "dropRateMul", "extraDrop", "focusPriority",
                "freeze", "groundZone", "knockback", "mergePulse",
                "mortarMorph", "novaOnBreak", "pierce", "restore", "shield",
                "slow", "split", "statBuff", "stun", "summon", "summonBuff",
                "taunt", "thorns", "vulnerable"
            };

        private static RecipeProductEffectCatalog _default;
        private readonly Dictionary<string, RecipeProductCardEffectsConfig>
            _byCard =
                new Dictionary<string, RecipeProductCardEffectsConfig>(
                    StringComparer.Ordinal);

        public RecipeProductEffectCatalog(
            RecipeProductEffectsConfig config,
            CardCatalog cards)
        {
            if (config?.cards == null)
                throw new ArgumentNullException(nameof(config));
            cards = cards ?? throw new ArgumentNullException(nameof(cards));

            foreach (RecipeProductCardEffectsConfig compiled in config.cards)
            {
                CardDefinitionConfig definition = cards.Find(compiled?.cardId);
                if (definition?.recipeOnly != true
                    || compiled.bindings == null
                    || compiled.bindings.Length == 0
                    || !_byCard.TryAdd(compiled.cardId, compiled))
                {
                    throw new InvalidOperationException(
                        $"Invalid compiled recipe product {compiled?.cardId}.");
                }

                foreach (CompiledEffectBindingConfig binding in compiled.bindings)
                {
                    if (binding == null
                        || !SupportedTriggers.Contains(binding.trigger)
                        || binding.effects == null
                        || binding.effects.Length == 0)
                    {
                        throw new InvalidOperationException(
                            $"Invalid effect binding for {compiled.cardId}.");
                    }

                    foreach (CompiledEffectAtomConfig atom in binding.effects)
                        ValidateAtom(compiled.cardId, atom);
                }
            }

            int recipeProducts = 0;
            foreach (CardDefinitionConfig definition in cards.Cards)
            {
                if (!definition.recipeOnly)
                    continue;
                recipeProducts++;
                if (!_byCard.ContainsKey(definition.id))
                {
                    throw new InvalidOperationException(
                        $"Missing compiled effects for {definition.id}.");
                }
            }

            if (recipeProducts != 25 || _byCard.Count != 25)
            {
                throw new InvalidOperationException(
                    $"Expected 25 compiled recipe products, found {_byCard.Count}.");
            }
        }

        public static RecipeProductEffectCatalog Default =>
            _default ?? (_default = new RecipeProductEffectCatalog(
                GameConfigLoader.LoadRecipeProductEffects(),
                CardCatalog.Default));

        public RecipeProductCardEffectsConfig Find(string cardId)
        {
            return !string.IsNullOrEmpty(cardId)
                && _byCard.TryGetValue(
                    cardId,
                    out RecipeProductCardEffectsConfig config)
                ? config
                : null;
        }

        private static void ValidateAtom(
            string cardId,
            CompiledEffectAtomConfig atom)
        {
            if (atom == null || !SupportedAtoms.Contains(atom.atom))
            {
                throw new InvalidOperationException(
                    $"Unsupported effect atom {atom?.atom} for {cardId}.");
            }

            foreach (CompiledEffectAtomConfig child
                in atom.children ?? Array.Empty<CompiledEffectAtomConfig>())
            {
                ValidateAtom(cardId, child);
            }
        }
    }
}
