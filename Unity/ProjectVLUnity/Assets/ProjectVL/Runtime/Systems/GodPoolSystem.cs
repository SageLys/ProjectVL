using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class GodPoolSystem
    {
        private readonly GodsConfig _config;
        private readonly IRandomSource _random;

        public GodPoolSystem(GodsConfig config, IRandomSource random)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        public bool OfferInitial(GameState state)
        {
            return state != null
                && state.MainGod == null
                && Offer(state, GodChoiceRole.Main, 0, Unselected(state), 3);
        }

        public bool OfferForAfterWave(GameState state, int afterWave)
        {
            if (state == null || state.LastGodDecisionAfterWave == afterWave)
            {
                return false;
            }

            state.LastGodDecisionAfterWave = afterWave;
            if (afterWave == 1 && state.SubGods.Count == 0)
            {
                return Offer(
                    state,
                    GodChoiceRole.Sub,
                    afterWave,
                    Unselected(state),
                    2);
            }

            if (afterWave == 2 && state.SubGods.Count == 1)
            {
                return Offer(
                    state,
                    GodChoiceRole.Sub,
                    afterWave,
                    Unselected(state),
                    2);
            }

            if (afterWave >= 3 && afterWave <= 9)
            {
                int count = afterWave >= 8 ? 3 : 2;
                return Offer(
                    state,
                    GodChoiceRole.Focus,
                    afterWave,
                    Selected(state),
                    count);
            }

            return false;
        }

        public bool Choose(GameState state, int optionIndex)
        {
            GodChoice choice = state?.PendingGodChoice;
            if (choice == null
                || optionIndex < 0
                || optionIndex >= choice.Options.Length)
            {
                return false;
            }

            string godId = choice.Options[optionIndex].id;
            if (choice.Role == GodChoiceRole.Main)
            {
                state.MainGod = godId;
                state.FocusGod = godId;
            }
            else if (choice.Role == GodChoiceRole.Sub)
            {
                if (!state.SubGods.Contains(godId))
                {
                    state.SubGods.Add(godId);
                }

                state.FocusGod = godId;
            }
            else
            {
                state.FocusGod = godId;
            }

            state.CompleteGodChoice();
            return true;
        }

        private bool Offer(
            GameState state,
            GodChoiceRole role,
            int afterWave,
            List<GodConfig> candidates,
            int count)
        {
            GodConfig[] options = Sample(candidates, count);
            if (options.Length == 0)
            {
                return false;
            }

            state.SetGodChoice(new GodChoice(role, afterWave, options));
            return true;
        }

        private GodConfig[] Sample(List<GodConfig> candidates, int count)
        {
            var pool = new List<GodConfig>(candidates);
            int resultCount = Math.Min(Math.Max(0, count), pool.Count);
            var result = new GodConfig[resultCount];
            for (int index = 0; index < resultCount; index++)
            {
                int picked = Math.Min(
                    pool.Count - 1,
                    (int)(_random.NextFloat() * pool.Count));
                result[index] = pool[picked];
                pool.RemoveAt(picked);
            }

            return result;
        }

        private List<GodConfig> Selected(GameState state)
        {
            var ids = new HashSet<string>(state.SelectedGodIds);
            var result = new List<GodConfig>();
            foreach (GodConfig god in _config.gods)
            {
                if (ids.Contains(god.id))
                {
                    result.Add(god);
                }
            }

            return result;
        }

        private List<GodConfig> Unselected(GameState state)
        {
            var ids = new HashSet<string>(state.SelectedGodIds);
            var result = new List<GodConfig>();
            foreach (GodConfig god in _config.gods)
            {
                if (!ids.Contains(god.id))
                {
                    result.Add(god);
                }
            }

            return result;
        }
    }
}
