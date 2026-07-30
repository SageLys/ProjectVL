using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CardAffixSystem
    {
        private readonly CardAffixCatalog _catalog;
        private readonly IRandomSource _random;

        public CardAffixSystem(
            CardAffixCatalog catalog,
            IRandomSource random)
        {
            _catalog = catalog
                ?? throw new ArgumentNullException(nameof(catalog));
            _random = random
                ?? throw new ArgumentNullException(nameof(random));
        }

        public void Attach(GameState state, CardState card)
        {
            if (state == null || card == null)
            {
                return;
            }

            card.Affixes.Clear();
            foreach (CardAffixRoll roll in EnsureTemplate(
                state,
                card.Type))
            {
                card.Affixes.Add(roll.Clone());
            }
        }

        public IReadOnlyList<CardAffixRoll> EnsureTemplate(
            GameState state,
            string cardType)
        {
            if (state.CardAffixRolls.TryGetValue(
                cardType,
                out List<CardAffixRoll> existing))
            {
                return existing;
            }

            CardAffixPoolConfig pool = _catalog.Find(cardType);
            var rolls = new List<CardAffixRoll>();
            if (pool != null)
            {
                var remaining =
                    new List<CardAffixCandidateConfig>(
                        pool.candidates);
                while (remaining.Count > 0
                    && rolls.Count < pool.count)
                {
                    CardAffixCandidateConfig candidate =
                        TakeWeighted(remaining);
                    rolls.Add(new CardAffixRoll(
                        candidate.stat,
                        RollValue(candidate),
                        candidate.consumableDuration));
                }
            }

            state.CardAffixRolls[cardType] = rolls;
            foreach (CardAffixRoll roll in rolls)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "affix_rolled",
                    cardType = cardType,
                    affixStat = roll.Stat,
                    affixValue = roll.Value,
                    consumableDuration = roll.ConsumableDuration
                });
            }
            return rolls;
        }

        public static List<RuntimeCardAffixModifier> ActivateConsumable(
            GameState state,
            CardState card)
        {
            var activated = new List<RuntimeCardAffixModifier>();
            if (state == null || card == null)
            {
                return activated;
            }

            foreach (CardAffixRoll roll in card.Affixes)
            {
                if (roll.Stat == "heal")
                {
                    state.RestoreHp(roll.Value);
                    continue;
                }

                var modifier = new RuntimeCardAffixModifier(
                    roll.Stat,
                    roll.Value,
                    roll.ConsumableDuration);
                state.RuntimeCardAffixes.Add(modifier);
                activated.Add(modifier);
            }

            ReconcileMaxHp(state);
            return activated;
        }

        public static void RollbackConsumable(
            GameState state,
            List<RuntimeCardAffixModifier> activated)
        {
            if (state == null || activated == null)
            {
                return;
            }

            foreach (RuntimeCardAffixModifier modifier in activated)
            {
                state.RuntimeCardAffixes.Remove(modifier);
            }

            ReconcileMaxHp(state);
        }

        public static void StepRuntime(GameState state, float deltaTime)
        {
            if (state == null)
            {
                return;
            }

            for (int index = state.RuntimeCardAffixes.Count - 1;
                index >= 0;
                index--)
            {
                RuntimeCardAffixModifier modifier =
                    state.RuntimeCardAffixes[index];
                modifier.Remaining -= Math.Max(0f, deltaTime);
                if (modifier.Remaining <= 0f)
                {
                    state.RuntimeCardAffixes.RemoveAt(index);
                }
            }

            ReconcileMaxHp(state);
        }

        public static float EquipmentValue(
            GameState state,
            string stat)
        {
            float total = 0f;
            if (state == null)
            {
                return total;
            }

            foreach (CardState card in state.Equipment)
            {
                if (card == null
                    || card.Provisional
                    || card.Id == state.ExcludedEquipmentAffixCardId)
                {
                    continue;
                }

                foreach (CardAffixRoll roll in card.Affixes)
                {
                    if (roll.Stat == stat)
                    {
                        total += roll.Value;
                    }
                }
            }

            return total;
        }

        public static float RuntimeAdd(GameState state, string stat)
        {
            float total = 0f;
            if (state == null)
            {
                return total;
            }

            foreach (RuntimeCardAffixModifier modifier
                in state.RuntimeCardAffixes)
            {
                if (modifier.Stat == stat)
                {
                    total += modifier.Value;
                }
            }

            return total;
        }

        public static float RuntimeScaling(
            GameState state,
            string stat)
        {
            float multiplier = 1f;
            if (state == null)
            {
                return 0f;
            }

            foreach (RuntimeCardAffixModifier modifier
                in state.RuntimeCardAffixes)
            {
                if (modifier.Stat == stat)
                {
                    multiplier *= 1f + modifier.Value;
                }
            }

            return multiplier - 1f;
        }

        public static void ApplyProfile(
            GameState state,
            CardCombatProfile profile)
        {
            string[] axes =
            {
                "effectDamageMul",
                "quantityAdd",
                "controlPotencyMul",
                "areaScaleMul",
                "dotDamageMul",
                "defenseDurabilityMul",
                "retaliationMul",
                "dropRateMul",
                "dropLifetimeMul",
                "xpMul",
                "controlledDamageTakenMul"
            };
            foreach (string axis in axes)
            {
                float value = EquipmentValue(state, axis)
                    + RuntimeScaling(state, axis);
                RelicScalingSystem.ApplyAxis(
                    profile,
                    axis,
                    value);
            }
        }

        public static void ReconcileMaxHp(GameState state)
        {
            if (state == null)
            {
                return;
            }

            state.ReconcileAffixMaxHp(
                EquipmentValue(state, "maxHpAdd")
                + RuntimeAdd(state, "maxHpAdd"));
        }

        private CardAffixCandidateConfig TakeWeighted(
            List<CardAffixCandidateConfig> remaining)
        {
            float total = 0f;
            foreach (CardAffixCandidateConfig candidate in remaining)
            {
                total += candidate.weight;
            }

            float roll = _random.NextFloat() * total;
            for (int index = 0; index < remaining.Count; index++)
            {
                roll -= remaining[index].weight;
                if (roll < 0f)
                {
                    CardAffixCandidateConfig selected =
                        remaining[index];
                    remaining.RemoveAt(index);
                    return selected;
                }
            }

            int last = remaining.Count - 1;
            CardAffixCandidateConfig fallback = remaining[last];
            remaining.RemoveAt(last);
            return fallback;
        }

        private float RollValue(CardAffixCandidateConfig candidate)
        {
            int stepCount = Math.Max(
                0,
                (int)Math.Floor(
                    (candidate.max - candidate.min)
                    / candidate.step
                    + 0.000001f));
            int stepIndex = Math.Min(
                stepCount,
                Math.Max(
                    0,
                    (int)Math.Floor(
                        _random.NextFloat()
                        * (stepCount + 1))));
            float value = candidate.min
                + stepIndex * candidate.step;
            return Math.Min(candidate.max, value);
        }
    }
}
