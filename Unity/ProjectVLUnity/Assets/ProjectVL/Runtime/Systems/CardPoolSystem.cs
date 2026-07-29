using System;
using System.Collections.Generic;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CardPoolSystem
    {
        private static readonly string[] PlayableCardTypes =
        {
            "pierce",
            "chainLightning",
            "frost",
            "decoy",
            "scorch",
            "harvest",
            "aegis",
            "splitBlast",
            "impact",
            "sanctum",
            "thorns"
        };

        private readonly IRandomSource _random;

        public CardPoolSystem(IRandomSource random)
        {
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        public static bool IsPlayable(string cardType)
        {
            return Array.IndexOf(PlayableCardTypes, cardType) >= 0;
        }

        public void UpdateRunRoster(GameState state, bool lockRoster = false)
        {
            if (state == null)
            {
                return;
            }

            var updated = new List<string>();
            foreach (string god in state.SelectedGodIds)
            {
                if (!state.RosterByGod.TryGetValue(
                    god,
                    out List<string> roster))
                {
                    continue;
                }

                AddUnique(updated, roster, int.MaxValue);
            }

            state.RunRoster.Clear();
            AddUnique(state.RunRoster, updated, lockRoster ? 11 : int.MaxValue);
        }

        public IReadOnlyList<string> GetRunPool(GameState state)
        {
            var pool = new List<string>();
            if (state != null)
            {
                AddPlayable(pool, state.RunRoster, int.MaxValue);
                if (pool.Count == 0)
                {
                    foreach (string god in state.SelectedGodIds)
                    {
                        if (state.RosterByGod.TryGetValue(
                            god,
                            out List<string> roster))
                        {
                            AddPlayable(pool, roster, int.MaxValue);
                        }
                    }
                }
            }

            if (pool.Count == 0
                && (state == null || string.IsNullOrEmpty(state.MainGod)))
            {
                AddUnique(pool, PlayableCardTypes, int.MaxValue);
            }

            return pool;
        }

        public IReadOnlyList<string> GetActivePool(GameState state)
        {
            var pool = new List<string>();
            if (state != null)
            {
                AddPlayable(pool, state.ActiveCardPool, int.MaxValue);
            }

            if (pool.Count == 0)
            {
                AddUnique(pool, GetRunPool(state), int.MaxValue);
            }

            return pool;
        }

        public IReadOnlyList<string> GenerateActivePool(
            GameState state,
            int wave)
        {
            if (state == null)
            {
                return Array.Empty<string>();
            }

            state.PreviousActiveCardPool.Clear();
            AddUnique(
                state.PreviousActiveCardPool,
                state.ActiveCardPool,
                int.MaxValue);
            state.ActiveCardPool.Clear();

            if (string.IsNullOrEmpty(state.MainGod))
            {
                AddUnique(state.ActiveCardPool, PlayableCardTypes, 7);
            }
            else if (wave == 1)
            {
                AddGodRoster(state, state.MainGod, state.ActiveCardPool, 5);
            }
            else if (wave <= 3)
            {
                AddProtectedCards(state, state.ActiveCardPool);
                AddGodRoster(state, state.FocusGod, state.ActiveCardPool, 7);
                AddGodRoster(state, state.MainGod, state.ActiveCardPool, 7);
            }
            else
            {
                AddProtectedCards(state, state.ActiveCardPool);
                AddGodRoster(state, state.FocusGod, state.ActiveCardPool, 7);
                if (wave <= 6)
                {
                    AddOnePivotCard(state, state.ActiveCardPool);
                }

                AddUnique(
                    state.ActiveCardPool,
                    GetRunPool(state),
                    Math.Min(7, Math.Max(5, state.ActiveCardPool.Count)));
            }

            if (state.ActiveCardPool.Count == 0)
            {
                AddUnique(state.ActiveCardPool, GetRunPool(state), 7);
            }

            AddUnique(
                state.ActiveCardPoolHistory,
                state.ActiveCardPool,
                int.MaxValue);
            state.ActiveCardPoolWave = wave;
            return state.ActiveCardPool;
        }

        public string SelectActiveDropType(GameState state)
        {
            IReadOnlyList<string> active = GetActivePool(state);
            if (active.Count == 0)
            {
                return null;
            }

            if (state != null && state.BootstrapDropsRemaining > 0)
            {
                state.BootstrapDropsRemaining--;
                while (state.BootstrapCardQueue.Count > 0)
                {
                    string forced = state.BootstrapCardQueue[0];
                    state.BootstrapCardQueue.RemoveAt(0);
                    if (IsPlayable(forced) && Contains(active, forced))
                    {
                        return forced;
                    }
                }
            }

            return Pick(active);
        }

        public string SelectRewardType(GameState state, string typePolicy)
        {
            IReadOnlyList<string> candidates;
            if (string.Equals(
                    typePolicy,
                    "focusGod",
                    StringComparison.OrdinalIgnoreCase))
            {
                var focus = new List<string>();
                if (state != null
                    && !string.IsNullOrEmpty(state.FocusGod)
                    && state.RosterByGod.TryGetValue(
                        state.FocusGod,
                        out List<string> roster))
                {
                    AddPlayable(focus, roster, int.MaxValue);
                }

                candidates = focus.Count > 0 ? focus : GetRunPool(state);
            }
            else
            {
                candidates = GetRunPool(state);
            }

            return candidates.Count > 0 ? Pick(candidates) : null;
        }

        private void AddProtectedCards(
            GameState state,
            List<string> target)
        {
            foreach (CardState card in state.Equipment)
            {
                AddProtectedCard(state, target, card);
            }

            foreach (CardState card in state.Hand)
            {
                if (target.Count >= 3)
                {
                    return;
                }

                if (card != null && card.Star >= 2)
                {
                    AddProtectedCard(state, target, card);
                }
            }
        }

        private static void AddProtectedCard(
            GameState state,
            List<string> target,
            CardState card)
        {
            if (card != null
                && IsPlayable(card.Type)
                && state.RunRoster.Contains(card.Type)
                && !target.Contains(card.Type)
                && target.Count < 3)
            {
                target.Add(card.Type);
            }
        }

        private void AddGodRoster(
            GameState state,
            string god,
            List<string> target,
            int limit)
        {
            if (string.IsNullOrEmpty(god)
                || !state.RosterByGod.TryGetValue(
                    god,
                    out List<string> roster))
            {
                return;
            }

            var shuffled = new List<string>();
            AddPlayable(shuffled, roster, int.MaxValue);
            Shuffle(shuffled);
            AddUnique(target, shuffled, limit);
        }

        private void AddOnePivotCard(
            GameState state,
            List<string> target)
        {
            var candidates = new List<string>();
            foreach (string god in state.SelectedGodIds)
            {
                if (god == state.FocusGod
                    || !state.RosterByGod.TryGetValue(
                        god,
                        out List<string> roster))
                {
                    continue;
                }

                AddPlayable(candidates, roster, int.MaxValue);
            }

            candidates.RemoveAll(target.Contains);
            if (candidates.Count > 0 && target.Count < 7)
            {
                target.Add(Pick(candidates));
            }
        }

        private string Pick(IReadOnlyList<string> values)
        {
            int index = Math.Min(
                values.Count - 1,
                (int)(_random.NextFloat() * values.Count));
            return values[index];
        }

        private void Shuffle(List<string> values)
        {
            for (int index = values.Count - 1; index > 0; index--)
            {
                int other = Math.Min(
                    index,
                    (int)(_random.NextFloat() * (index + 1)));
                string current = values[index];
                values[index] = values[other];
                values[other] = current;
            }
        }

        private static void AddPlayable(
            List<string> target,
            IEnumerable<string> values,
            int limit)
        {
            foreach (string value in values)
            {
                if (IsPlayable(value))
                {
                    AddUnique(target, value, limit);
                }
            }
        }

        private static void AddUnique(
            List<string> target,
            IEnumerable<string> values,
            int limit)
        {
            foreach (string value in values)
            {
                AddUnique(target, value, limit);
            }
        }

        private static void AddUnique(
            List<string> target,
            string value,
            int limit)
        {
            if (target.Count < limit
                && !string.IsNullOrEmpty(value)
                && !target.Contains(value))
            {
                target.Add(value);
            }
        }

        private static bool Contains(
            IReadOnlyList<string> values,
            string value)
        {
            for (int index = 0; index < values.Count; index++)
            {
                if (values[index] == value)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
