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
        private readonly CardPoolSystem _cardPool;

        public GodPoolSystem(GodsConfig config, IRandomSource random)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _cardPool = new CardPoolSystem(random);
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
                FreezeRoster(state, choice.Options[optionIndex], true);
            }
            else if (choice.Role == GodChoiceRole.Sub)
            {
                if (!state.SubGods.Contains(godId))
                {
                    state.SubGods.Add(godId);
                }

                state.FocusGod = godId;
                FreezeRoster(state, choice.Options[optionIndex], false);
                state.BootstrapCardQueue.Clear();
                state.BootstrapCardQueue.AddRange(
                    state.RosterByGod[godId]);
                state.BootstrapDropsRemaining = 9;
            }
            else
            {
                state.FocusGod = godId;
            }

            _cardPool.UpdateRunRoster(
                state,
                state.SubGods.Count >= 2);
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "god_selected",
                godId = godId,
                focusGod = state.FocusGod,
                godRole = choice.Role.ToString().ToLowerInvariant(),
                choice = godId
            });
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "decision_resolved",
                decisionKind = "god",
                choice = godId,
                godId = godId,
                godRole = choice.Role.ToString().ToLowerInvariant()
            });
            state.CompleteGodChoice();
            return true;
        }

        private void FreezeRoster(
            GameState state,
            GodConfig god,
            bool main)
        {
            if (state.RosterByGod.ContainsKey(god.id))
            {
                return;
            }

            int target = Math.Max(
                0,
                main ? god.mainRosterSize : god.subRosterSize);
            var roster = new List<string>();
            AddUnique(roster, god.anchorCardIds, target);
            var variables = new List<string>(god.variableCardIds);
            Shuffle(variables);
            AddUnique(roster, variables, target);
            state.RosterByGod[god.id] = roster;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "run_roster_created",
                godId = god.id,
                godRole = main ? "main" : "sub",
                cardTypes = roster.ToArray()
            });
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

        private static void AddUnique(
            List<string> target,
            IEnumerable<string> values,
            int limit)
        {
            foreach (string value in values)
            {
                if (target.Count >= limit)
                {
                    return;
                }

                if (!string.IsNullOrEmpty(value)
                    && !target.Contains(value))
                {
                    target.Add(value);
                }
            }
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
            var ids = new string[options.Length];
            for (int index = 0; index < options.Length; index++)
                ids[index] = options[index].id;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "god_offer",
                godRole = role.ToString().ToLowerInvariant(),
                candidates = ids,
                focusGod = state.FocusGod
            });
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "decision_offered",
                decisionKind = "god",
                godRole = role.ToString().ToLowerInvariant(),
                candidates = ids
            });
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
