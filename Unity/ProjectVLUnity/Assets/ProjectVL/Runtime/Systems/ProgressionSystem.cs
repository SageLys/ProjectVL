using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class ProgressionSystem
    {
        private readonly ProgressionConfig _config;
        private readonly CombatConfig _combat;
        private readonly IRandomSource _random;

        public ProgressionSystem(
            ProgressionConfig config,
            CombatConfig combat,
            IRandomSource random)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _combat = combat ?? throw new ArgumentNullException(nameof(combat));
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        public void AddExperience(GameState state, float amount)
        {
            if (state == null || amount <= 0f)
            {
                return;
            }

            state.AddExperience(amount * (1f + state.XpGainBonus));
            while (state.Level - 1 < _config.xpThresholds.Length
                && state.Experience
                    >= _config.xpThresholds[state.Level - 1])
            {
                state.AdvanceLevel(ExperienceNeededFor(state.Level + 1));
                UpgradeOptionConfig[] options = RollOptions();
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

            Apply(state, choice.Options[optionIndex]);
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

        private UpgradeOptionConfig[] RollOptions()
        {
            int count = Math.Min(
                Math.Max(1, _config.relicChoices),
                _config.choices.Length);
            var pool = new List<UpgradeOptionConfig>(_config.choices);
            var result = new UpgradeOptionConfig[count];
            for (int index = 0; index < count; index++)
            {
                int picked = Math.Min(
                    pool.Count - 1,
                    (int)(_random.NextFloat() * pool.Count));
                result[index] = pool[picked];
                pool.RemoveAt(picked);
            }

            return result;
        }

        private void Apply(GameState state, UpgradeOptionConfig option)
        {
            switch (option.stat)
            {
                case "damageAdd":
                    _combat.defaults.damage += option.add;
                    break;
                case "fireRateAdd":
                    _combat.defaults.fireRate += option.add;
                    break;
                case "rangeAdd":
                    _combat.defaults.range += option.add;
                    break;
                case "maxHpAdd":
                    state.IncreaseMaxHp(option.add, true);
                    break;
                case "xpGainPct":
                    state.XpGainBonus += option.add;
                    break;
            }

            state.RecordUpgrade(option.id);
        }
    }
}
