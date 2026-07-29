using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class WaveRewardSystem
    {
        private readonly WaveRewardsConfig _rewards;
        private readonly CombatConfig _combat;

        public WaveRewardSystem(
            WaveRewardsConfig rewards,
            CombatConfig combat)
        {
            _rewards = rewards
                ?? throw new ArgumentNullException(nameof(rewards));
            _combat = combat
                ?? throw new ArgumentNullException(nameof(combat));
        }

        public bool GrantFloorRewards(GameState state, int wave)
        {
            if (state == null
                || wave <= 0
                || state.WaveRewardsClaimedWave >= wave)
            {
                return false;
            }

            state.WaveRewardsClaimedWave = wave;
            bool granted = false;
            foreach (WaveRewardEffectConfig reward in _rewards.floor)
            {
                if (reward.stat == "rangeAdd" && RangeIsCapped(state))
                {
                    continue;
                }

                Apply(state, reward);
                state.LastFloorRewards.Add(reward);
                granted = true;
            }

            return granted;
        }

        public bool OfferChoice(GameState state, int wave)
        {
            if (state == null
                || wave <= 0
                || state.WaveChoiceOfferedWave >= wave)
            {
                return false;
            }

            state.WaveChoiceOfferedWave = wave;
            var options = new List<WaveRewardEffectConfig>();
            var capped = new List<string>();
            foreach (WaveRewardEffectConfig reward in _rewards.choice)
            {
                options.Add(reward);
                if (reward.stat == "rangeAdd" && RangeIsCapped(state))
                {
                    capped.Add(reward.id);
                }
            }

            if (options.Count == 0)
            {
                return false;
            }

            state.PendingWaveReward = new WaveRewardChoice(
                wave,
                options,
                capped);
            state.SetDecisionLocked(true);
            return true;
        }

        public bool Choose(GameState state, int optionIndex)
        {
            WaveRewardChoice choice = state?.PendingWaveReward;
            if (choice == null
                || optionIndex < 0
                || optionIndex >= choice.Options.Count)
            {
                return false;
            }

            WaveRewardEffectConfig reward = choice.Options[optionIndex];
            if (choice.IsCapped(reward.id))
            {
                return false;
            }

            Apply(state, reward);
            state.ChosenWaveRewards.Add(reward);
            state.PendingWaveReward = null;
            state.RefreshDecisionLock();
            return true;
        }

        public void Apply(GameState state, WaveRewardEffectConfig reward)
        {
            switch (reward.stat)
            {
                case "damageAdd":
                    state.RunDamageAdd += reward.add;
                    break;
                case "fireRateAdd":
                    state.RunFireRateAdd += reward.add;
                    break;
                case "rangeAdd":
                    state.RunRangeAdd = Math.Min(
                        state.RunRangeAdd + reward.add,
                        Math.Max(0f, MaxAttackRange() - _combat.defaults.range));
                    break;
                case "multiAdd":
                    state.RunMultiAdd += reward.add;
                    break;
                case "maxHpAdd":
                    state.IncreaseBaseMaxHp(reward.add);
                    break;
                case "heal":
                    state.RestoreHp(reward.add);
                    break;
                case "xpGainPct":
                    state.XpGainBonus += reward.add;
                    break;
            }
        }

        public bool RangeIsCapped(GameState state)
        {
            return _combat.defaults.range + state.RunRangeAdd
                >= MaxAttackRange() - 0.001f;
        }

        public float MaxAttackRange()
        {
            float toLeft = _combat.turret.x;
            float toRight = _combat.canvas.width - _combat.turret.x;
            float toTop = _combat.turret.y;
            float toBottom = _combat.canvas.height - _combat.turret.y;
            float nearest = Math.Min(
                Math.Min(toLeft, toRight),
                Math.Min(toTop, toBottom));
            return Math.Max(
                _combat.defaults.range,
                nearest - _combat.attackPreviewMargin);
        }
    }
}
