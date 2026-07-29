using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class ProgressionSystem
    {
        private static readonly string[] Rarities =
        {
            "common",
            "rare",
            "epic"
        };

        private readonly ProgressionConfig _config;
        private readonly RelicsConfig _relics;
        private readonly IRandomSource _random;

        public ProgressionSystem(
            ProgressionConfig config,
            RelicsConfig relics,
            IRandomSource random)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _relics = relics ?? throw new ArgumentNullException(nameof(relics));
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        public void AddExperience(GameState state, float amount)
        {
            if (state == null || amount <= 0f)
            {
                return;
            }

            state.AddExperience(
                amount
                * _config.killXpMul
                * (1f + state.XpGainBonus));
            while (state.Level - 1 < _config.xpThresholds.Length
                && state.Experience
                    >= _config.xpThresholds[state.Level - 1])
            {
                int relicIndex = state.Level - 1;
                state.AdvanceLevel(ExperienceNeededFor(state.Level + 1));
                LevelUpgradeOption[] options = RollOptions(
                    state,
                    relicIndex);
                if (options.Length > 0)
                {
                    state.EnqueueLevelUpgrade(
                        new LevelUpgradeChoice(state.Level, options));
                }
            }
        }

        public bool Choose(GameState state, int optionIndex)
        {
            LevelUpgradeChoice choice = state?.PendingLevelUpgrade;
            if (choice == null
                || optionIndex < 0
                || optionIndex >= choice.Options.Length)
            {
                return false;
            }

            LevelUpgradeOption option = choice.Options[optionIndex];
            RelicConfig relic = FindRelic(option.Id);
            if (relic == null
                || StackCount(state, relic.id) >= relic.maxStacks)
            {
                return false;
            }

            state.RecordRelic(relic);
            state.CompleteLevelUpgrade();
            return true;
        }

        private float ExperienceNeededFor(int level)
        {
            if (_config.xpThresholds.Length == 0)
            {
                return 0f;
            }

            int index = Math.Max(
                0,
                Math.Min(_config.xpThresholds.Length - 1, level - 1));
            return _config.xpThresholds[index];
        }

        private LevelUpgradeOption[] RollOptions(
            GameState state,
            int relicIndex)
        {
            var selected = new HashSet<string>(state.SelectedGodIds);
            var eligible = new List<RelicConfig>();
            foreach (RelicConfig relic in _relics.relics)
            {
                int queued = QueuedCount(state, relic.id);
                if ((string.IsNullOrEmpty(relic.god)
                        || selected.Contains(relic.god))
                    && StackCount(state, relic.id) + queued < relic.maxStacks)
                {
                    eligible.Add(relic);
                }
            }

            var choices = new List<RelicConfig>();
            List<string> scopes = ChooseScopes(state);
            for (int index = 0; index < scopes.Count; index++)
            {
                string scope = scopes[index];
                var candidates = Remaining(
                    eligible,
                    choices,
                    relic => string.IsNullOrEmpty(scope)
                        ? string.IsNullOrEmpty(relic.god)
                        : relic.god == scope);
                RelicConfig picked = PickForRarity(candidates, relicIndex)
                    ?? PickForRarity(
                        Remaining(eligible, choices, relic => true),
                        relicIndex);
                if (picked != null)
                {
                    choices.Add(picked);
                }
            }

            int count = Math.Min(
                Math.Max(1, _config.relicChoices),
                eligible.Count);
            while (choices.Count < count)
            {
                RelicConfig picked = PickForRarity(
                    Remaining(eligible, choices, relic => true),
                    relicIndex);
                if (picked == null)
                {
                    break;
                }

                choices.Add(picked);
            }

            var options = new LevelUpgradeOption[
                Math.Min(count, choices.Count)];
            for (int index = 0; index < options.Length; index++)
            {
                RelicConfig relic = choices[index];
                options[index] = new LevelUpgradeOption(
                    relic.id,
                    relic.title,
                    relic.desc,
                    relic.god,
                    relic.rarity);
            }

            return options;
        }

        private List<string> ChooseScopes(GameState state)
        {
            var selected = new List<string>(state.SelectedGodIds);
            string focus = !string.IsNullOrEmpty(state.FocusGod)
                && selected.Contains(state.FocusGod)
                ? state.FocusGod
                : selected.Count > 0 ? selected[0] : null;
            var other = selected.FindAll(god => god != focus);
            string second = PickString(other);
            var remaining = other.FindAll(god => god != second);
            string third = remaining.Count > 0 && _random.NextFloat() >= 0.5f
                ? PickString(remaining)
                : null;
            return new List<string> { focus, second, third };
        }

        private string PickString(List<string> values)
        {
            if (values.Count == 0)
            {
                return null;
            }

            int index = Math.Min(
                values.Count - 1,
                (int)(_random.NextFloat() * values.Count));
            return values[index];
        }

        private RelicConfig PickForRarity(
            List<RelicConfig> candidates,
            int relicIndex)
        {
            if (candidates.Count == 0)
            {
                return null;
            }

            RelicRarityWeights weights = RarityWeightsFor(relicIndex);
            string rarity = WeightedRarity(weights);
            var matching = candidates.FindAll(
                relic => relic.rarity == rarity);
            List<RelicConfig> pool = matching.Count > 0
                ? matching
                : candidates;
            int picked = Math.Min(
                pool.Count - 1,
                (int)(_random.NextFloat() * pool.Count));
            return pool[picked];
        }

        private RelicRarityWeights RarityWeightsFor(int relicIndex)
        {
            if (_config.rarityByRelicIndex.Length == 0)
            {
                return new RelicRarityWeights { common = 1f };
            }

            return _config.rarityByRelicIndex[Math.Min(
                _config.rarityByRelicIndex.Length - 1,
                Math.Max(0, relicIndex))];
        }

        private string WeightedRarity(RelicRarityWeights weights)
        {
            float[] values = { weights.common, weights.rare, weights.epic };
            float total = Math.Max(0f, values[0])
                + Math.Max(0f, values[1])
                + Math.Max(0f, values[2]);
            if (total <= 0f)
            {
                return "common";
            }

            float roll = _random.NextFloat() * total;
            for (int index = 0; index < values.Length; index++)
            {
                roll -= Math.Max(0f, values[index]);
                if (roll < 0f)
                {
                    return Rarities[index];
                }
            }

            return "epic";
        }

        private static List<RelicConfig> Remaining(
            List<RelicConfig> eligible,
            List<RelicConfig> selected,
            Predicate<RelicConfig> predicate)
        {
            return eligible.FindAll(
                relic => !selected.Exists(item => item.id == relic.id)
                    && predicate(relic));
        }

        private static int StackCount(GameState state, string relicId)
        {
            return state.RelicStacks.TryGetValue(relicId, out int count)
                ? count
                : 0;
        }

        private static int QueuedCount(GameState state, string relicId)
        {
            int count = 0;
            for (int index = 0;
                index < state.PendingLevelUpgradeCount;
                index++)
            {
                LevelUpgradeChoice choice = state.LevelUpgradeAt(index);
                if (choice == null)
                {
                    continue;
                }

                foreach (LevelUpgradeOption option in choice.Options)
                {
                    if (option.Id == relicId)
                    {
                        count++;
                    }
                }
            }

            return count;
        }

        private RelicConfig FindRelic(string id)
        {
            return Array.Find(_relics.relics, relic => relic.id == id);
        }
    }
}
