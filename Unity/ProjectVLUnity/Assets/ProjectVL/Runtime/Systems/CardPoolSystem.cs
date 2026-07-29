using System;
using System.Collections.Generic;
using ProjectVL.Config;
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
        private readonly NormalDropTypePolicyConfig _dropPolicy;
        private readonly int _equipThreshold;

        public CardPoolSystem(
            IRandomSource random,
            EconomyConfig economy = null)
        {
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _dropPolicy = economy?.normalDropTypePolicy
                ?? new NormalDropTypePolicyConfig();
            _equipThreshold = economy?.equipThreshold ?? 3;
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
            state.NormalDropRoleBag.Clear();
            return state.ActiveCardPool;
        }

        public string SelectActiveDropType(GameState state)
        {
            IReadOnlyList<string> active = GetActivePool(state);
            if (active.Count == 0)
            {
                return null;
            }

            return Pick(active);
        }

        public string SelectNormalEnemyDropType(GameState state)
        {
            IReadOnlyList<string> active = GetActivePool(state);
            if (state == null || active.Count == 0)
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
                    if (state.StatsFor(forced).OrdinaryShown == 0
                        && IsPlayable(forced)
                        && Contains(active, forced))
                    {
                        return forced;
                    }
                }
            }

            if (!_dropPolicy.enabled)
            {
                return Pick(active);
            }

            if (state.NormalDropRoleBag.Count == 0)
            {
                RefillNormalDropRoleBag(state);
            }

            int lastRole = state.NormalDropRoleBag.Count - 1;
            NormalDropRole role = state.NormalDropRoleBag[lastRole];
            state.NormalDropRoleBag.RemoveAt(lastRole);
            string selected = SelectForRole(state, role, null);
            if (IsSameTypeStreak(state, selected))
            {
                selected = SelectForRole(state, role, selected);
            }

            return selected;
        }

        public void RecordDropShown(
            GameState state,
            string cardType,
            bool ordinary)
        {
            if (state == null || string.IsNullOrEmpty(cardType))
            {
                return;
            }

            CardTypeRunStats stats = state.StatsFor(cardType);
            stats.TotalShown++;
            if (!ordinary)
            {
                return;
            }

            stats.OrdinaryShown++;
            stats.LastOrdinaryShownAt = state.OrdinaryDropCount + 1;
            state.OrdinaryDropCount++;
            state.RecentOrdinaryDropTypes.Add(cardType);
            int limit = Math.Max(1, _dropPolicy.maxSameTypeStreak);
            while (state.RecentOrdinaryDropTypes.Count > limit)
            {
                state.RecentOrdinaryDropTypes.RemoveAt(0);
            }
        }

        public void RefillNormalDropRoleBag(GameState state)
        {
            int bagSize = Math.Max(1, _dropPolicy.roleBagSize);
            float maturity = CalculateBuildMaturity(state);
            int build = Math.Max(
                0,
                RoundToInt(Lerp(
                    _dropPolicy.earlyMix.build,
                    _dropPolicy.lateMix.build,
                    maturity)));
            int pivot = Math.Max(
                0,
                RoundToInt(Lerp(
                    _dropPolicy.earlyMix.pivot,
                    _dropPolicy.lateMix.pivot,
                    maturity)));
            ReduceRoles(ref build, ref pivot, Math.Max(0, build + pivot - bagSize));
            int discovery = bagSize - build - pivot;

            bool hasUnseen = false;
            foreach (string type in GetActivePool(state))
            {
                if (state.StatsFor(type).OrdinaryShown == 0)
                {
                    hasUnseen = true;
                    break;
                }
            }

            if (hasUnseen)
            {
                int protectedDiscovery = Math.Min(
                    bagSize,
                    Math.Max(
                        discovery,
                        Math.Max(0, _dropPolicy.bootstrapMinDiscovery)));
                ReduceRoles(
                    ref build,
                    ref pivot,
                    protectedDiscovery - discovery);
                discovery = bagSize - build - pivot;
            }

            var roles = new List<NormalDropRole>();
            for (int index = 0; index < discovery; index++)
            {
                roles.Add(NormalDropRole.Discovery);
            }

            for (int index = 0; index < build; index++)
            {
                roles.Add(NormalDropRole.Build);
            }

            Shuffle(roles);
            int firstHalfSize = (bagSize + 1) / 2;
            int firstPivot = (pivot + 1) / 2;
            var firstHalf = new List<NormalDropRole>();
            var secondHalf = new List<NormalDropRole>();
            for (int index = 0; index < firstPivot; index++)
            {
                firstHalf.Add(NormalDropRole.Pivot);
            }

            for (int index = firstPivot; index < pivot; index++)
            {
                secondHalf.Add(NormalDropRole.Pivot);
            }

            while (firstHalf.Count < firstHalfSize && roles.Count > 0)
            {
                int last = roles.Count - 1;
                firstHalf.Add(roles[last]);
                roles.RemoveAt(last);
            }

            while (roles.Count > 0)
            {
                int last = roles.Count - 1;
                secondHalf.Add(roles[last]);
                roles.RemoveAt(last);
            }

            Shuffle(firstHalf);
            Shuffle(secondHalf);
            state.NormalDropRoleBag.Clear();
            state.NormalDropRoleBag.AddRange(firstHalf);
            state.NormalDropRoleBag.AddRange(secondHalf);
        }

        public float CalculateBuildMaturity(GameState state)
        {
            BuildMaturityPolicyConfig maturity = _dropPolicy.maturity;
            int highestStar = 0;
            foreach (CardTypeRunStats stats in state.CardTypeRunStats.Values)
            {
                highestStar = Math.Max(
                    highestStar,
                    stats.HighestStarReached);
            }

            int equippedTypes = 0;
            foreach (CardState card in state.Equipment)
            {
                if (card != null)
                {
                    equippedTypes++;
                }
            }

            return Clamp01(
                maturity.mergeWeight
                    * Clamp01(state.Merges / (float)Math.Max(1, maturity.fullMergeOps))
                + maturity.starWeight
                    * Clamp01(
                        (highestStar - 1f)
                        / Math.Max(1f, maturity.fullHighestStar - 1f))
                + maturity.equipWeight
                    * Clamp01(
                        equippedTypes
                        / (float)Math.Max(1, maturity.fullEquippedTypes)));
        }

        public float CalculateCommitmentScore(
            GameState state,
            string cardType)
        {
            float score = 0f;
            foreach (CardState card in state.Hand)
            {
                if (card?.Type == cardType)
                {
                    score += (float)Math.Pow(2f, Math.Max(0, card.Star - 1));
                }
            }

            CardState equipped = null;
            foreach (CardState card in state.Equipment)
            {
                if (card?.Type == cardType)
                {
                    score += (float)Math.Pow(2f, Math.Max(0, card.Star - 1));
                    equipped = card;
                }
            }

            BuildDropPolicyConfig build = _dropPolicy.build;
            CardTypeRunStats stats = state.StatsFor(cardType);
            score += build.historicalMergeWeight
                * Math.Min(stats.MergeOperations, build.historicalMergeCap);
            if (equipped != null)
            {
                    score += build.equippedBaseBonus
                    + build.equippedStarBonus
                    * (equipped.Star - _equipThreshold);
            }

            return Math.Max(0f, score);
        }

        public string SelectDiscoveryType(
            GameState state,
            string excludedType = null)
        {
            IReadOnlyList<string> active = GetActivePool(state);
            int minimumShown = int.MaxValue;
            foreach (string type in active)
            {
                minimumShown = Math.Min(
                    minimumShown,
                    state.StatsFor(type).OrdinaryShown);
            }

            var candidates = new List<string>();
            foreach (string type in active)
            {
                if (state.StatsFor(type).OrdinaryShown == minimumShown)
                {
                    candidates.Add(type);
                }
            }

            if (state.RecentOrdinaryDropTypes.Count > 0
                && candidates.Count > 1)
            {
                string previous = state.RecentOrdinaryDropTypes[
                    state.RecentOrdinaryDropTypes.Count - 1];
                RemoveTypeIfPossible(candidates, previous);
            }

            RemoveTypeIfPossible(candidates, excludedType);
            var weights = new List<float>();
            foreach (string type in candidates)
            {
                weights.Add(CardGodInRun(state, type) == state.FocusGod
                    ? 1.5f
                    : 1f);
            }

            return WeightedPick(candidates, weights);
        }

        public string SelectBuildType(
            GameState state,
            string excludedType = null)
        {
            List<ScoredCard> scored = BuildScoredCards(state, true);
            bool hasCommittedInvestment = HasCommittedInvestment(state);
            bool hasAffinity = scored.Exists(entry => entry.Affinity > 0f);
            if ((!hasCommittedInvestment && !hasAffinity)
                || scored.TrueForAll(entry => entry.Score <= 0f))
            {
                var mergeReady = new List<string>();
                foreach (CardState card in state.Hand)
                {
                    if (card != null
                        && card.Star == 1
                        && Contains(GetActivePool(state), card.Type)
                        && !mergeReady.Contains(card.Type))
                    {
                        mergeReady.Add(card.Type);
                    }
                }

                RemoveTypeIfPossible(mergeReady, excludedType);
                return mergeReady.Count > 0
                    ? Pick(mergeReady)
                    : SelectDiscoveryType(state, excludedType);
            }

            int count = Math.Min(
                Math.Max(1, _dropPolicy.build.topK),
                scored.Count);
            var candidates = scored.GetRange(0, count);
            RemoveScoredTypeIfPossible(candidates, excludedType);
            return WeightedBuildPick(state, candidates);
        }

        public string SelectPivotType(
            GameState state,
            string excludedType = null)
        {
            List<ScoredCard> scored = BuildScoredCards(state, false);
            int excludedTop = Math.Min(
                Math.Max(0, _dropPolicy.pivot.excludeTopK),
                scored.Count);
            if (excludedTop > 0)
            {
                scored.RemoveRange(0, excludedTop);
            }

            scored.Sort((left, right) =>
            {
                int scoreOrder = left.Score.CompareTo(right.Score);
                return scoreOrder != 0
                    ? scoreOrder
                    : state.StatsFor(left.Type).LastOrdinaryShownAt.CompareTo(
                        state.StatsFor(right.Type).LastOrdinaryShownAt);
            });
            if (scored.Count == 0)
            {
                return SelectDiscoveryType(state, excludedType);
            }

            int candidateCount = Math.Max(
                1,
                (int)Math.Ceiling(
                    scored.Count * Clamp01(
                        _dropPolicy.pivot.candidateFraction)));
            var candidates = scored.GetRange(
                0,
                Math.Min(candidateCount, scored.Count));
            RemoveScoredTypeIfPossible(candidates, excludedType);
            var values = new List<string>();
            var weights = new List<float>();
            foreach (ScoredCard entry in candidates)
            {
                values.Add(entry.Type);
                float focus = CardGodInRun(state, entry.Type) == state.FocusGod
                    ? 1.5f
                    : 1f;
                weights.Add(focus / (1f + entry.Score));
            }

            return WeightedPick(values, weights);
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

        private string SelectForRole(
            GameState state,
            NormalDropRole role,
            string excludedType)
        {
            if (role == NormalDropRole.Build)
            {
                return SelectBuildType(state, excludedType);
            }

            if (role == NormalDropRole.Pivot)
            {
                return SelectPivotType(state, excludedType);
            }

            return SelectDiscoveryType(state, excludedType);
        }

        private bool IsSameTypeStreak(GameState state, string selected)
        {
            int limit = Math.Max(1, _dropPolicy.maxSameTypeStreak);
            if (string.IsNullOrEmpty(selected)
                || state.RecentOrdinaryDropTypes.Count < limit)
            {
                return false;
            }

            for (int offset = 1; offset <= limit; offset++)
            {
                if (state.RecentOrdinaryDropTypes[
                        state.RecentOrdinaryDropTypes.Count - offset]
                    != selected)
                {
                    return false;
                }
            }

            return true;
        }

        private List<ScoredCard> BuildScoredCards(
            GameState state,
            bool includeAffinity)
        {
            var result = new List<ScoredCard>();
            foreach (string type in GetActivePool(state))
            {
                float affinity = includeAffinity
                    ? CalculateAffinityScore(state, type)
                    : 0f;
                result.Add(new ScoredCard(
                    type,
                    CalculateCommitmentScore(state, type) + affinity,
                    affinity));
            }

            result.Sort((left, right) =>
            {
                int scoreOrder = right.Score.CompareTo(left.Score);
                return scoreOrder != 0
                    ? scoreOrder
                    : string.CompareOrdinal(left.Type, right.Type);
            });
            return result;
        }

        private float CalculateAffinityScore(
            GameState state,
            string cardType)
        {
            string god = CardGodInRun(state, cardType);
            if (string.IsNullOrEmpty(god)
                || !state.GodAffinity.TryGetValue(god, out int stacks))
            {
                return 0f;
            }

            return Math.Min(
                _dropPolicy.godAffinity.scoreCap,
                stacks * _dropPolicy.godAffinity.scorePerStack);
        }

        private static string CardGodInRun(
            GameState state,
            string cardType)
        {
            if (!string.IsNullOrEmpty(state.FocusGod)
                && state.RosterByGod.TryGetValue(
                    state.FocusGod,
                    out List<string> focusRoster)
                && focusRoster.Contains(cardType))
            {
                return state.FocusGod;
            }

            foreach (string god in state.SelectedGodIds)
            {
                if (state.RosterByGod.TryGetValue(
                        god,
                        out List<string> roster)
                    && roster.Contains(cardType))
                {
                    return god;
                }
            }

            return null;
        }

        private static bool HasCommittedInvestment(GameState state)
        {
            foreach (CardState card in state.Equipment)
            {
                if (card != null)
                {
                    return true;
                }
            }

            foreach (CardState card in state.Hand)
            {
                if (card != null && card.Star > 1)
                {
                    return true;
                }
            }

            foreach (CardTypeRunStats stats in state.CardTypeRunStats.Values)
            {
                if (stats.MergeOperations > 0)
                {
                    return true;
                }
            }

            return false;
        }

        private string WeightedBuildPick(
            GameState state,
            List<ScoredCard> candidates)
        {
            var raw = new List<float>();
            float minimum = float.MaxValue;
            foreach (ScoredCard entry in candidates)
            {
                float weight = (float)Math.Pow(
                    entry.Score + 0.5f,
                    _dropPolicy.build.scorePower);
                raw.Add(weight);
                minimum = Math.Min(minimum, weight);
            }

            var values = new List<string>();
            var weights = new List<float>();
            for (int index = 0; index < candidates.Count; index++)
            {
                string type = candidates[index].Type;
                float weight = Math.Min(
                    raw[index],
                    minimum * Math.Max(
                        1f,
                        _dropPolicy.build.maxWeightRatio));
                if (HasOneStarCopy(state, type))
                {
                    weight *= _dropPolicy.build.mergeReadyMultiplier;
                }

                values.Add(type);
                weights.Add(weight);
            }

            return WeightedPick(values, weights);
        }

        private static bool HasOneStarCopy(
            GameState state,
            string cardType)
        {
            foreach (CardState card in state.Hand)
            {
                if (card?.Type == cardType && card.Star == 1)
                {
                    return true;
                }
            }

            return false;
        }

        private string WeightedPick(
            IReadOnlyList<string> values,
            IReadOnlyList<float> weights)
        {
            if (values.Count == 0)
            {
                return null;
            }

            float total = 0f;
            for (int index = 0; index < weights.Count; index++)
            {
                total += Math.Max(0f, weights[index]);
            }

            if (total <= 0f)
            {
                return Pick(values);
            }

            float roll = _random.NextFloat() * total;
            for (int index = 0; index < values.Count; index++)
            {
                roll -= Math.Max(0f, weights[index]);
                if (roll < 0f)
                {
                    return values[index];
                }
            }

            return values[values.Count - 1];
        }

        private static void RemoveTypeIfPossible(
            List<string> values,
            string excludedType)
        {
            if (string.IsNullOrEmpty(excludedType)
                || values.Count <= 1)
            {
                return;
            }

            values.Remove(excludedType);
        }

        private static void RemoveScoredTypeIfPossible(
            List<ScoredCard> values,
            string excludedType)
        {
            if (string.IsNullOrEmpty(excludedType)
                || values.Count <= 1)
            {
                return;
            }

            values.RemoveAll(entry => entry.Type == excludedType);
        }

        private static void ReduceRoles(
            ref int build,
            ref int pivot,
            int amount)
        {
            int fromBuild = Math.Min(build, Math.Max(0, amount));
            build -= fromBuild;
            amount -= fromBuild;
            int fromPivot = Math.Min(pivot, Math.Max(0, amount));
            pivot -= fromPivot;
        }

        private static float Lerp(float from, float to, float ratio)
        {
            return from + (to - from) * ratio;
        }

        private static int RoundToInt(float value)
        {
            return (int)Math.Floor(value + 0.5f);
        }

        private static float Clamp01(float value)
        {
            return Math.Max(0f, Math.Min(1f, value));
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

        private void Shuffle<T>(List<T> values)
        {
            for (int index = values.Count - 1; index > 0; index--)
            {
                int other = Math.Min(
                    index,
                    (int)(_random.NextFloat() * (index + 1)));
                T current = values[index];
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

        private sealed class ScoredCard
        {
            public string Type { get; }
            public float Score { get; }
            public float Affinity { get; }

            public ScoredCard(
                string type,
                float score,
                float affinity)
            {
                Type = type;
                Score = score;
                Affinity = affinity;
            }
        }
    }
}
