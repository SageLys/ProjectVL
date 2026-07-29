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
            return rolls;
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
