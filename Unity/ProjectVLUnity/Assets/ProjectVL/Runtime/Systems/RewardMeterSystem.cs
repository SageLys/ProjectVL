using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class RewardMeterSystem
    {
        public delegate float RewardDamageHandler(
            GameState state,
            EnemyState enemy,
            float damageMultiplier,
            float bossMaxHpRatioCap);

        private static readonly string[] BuildTags =
        {
            "projectile",
            "control",
            "domain",
            "defense",
            "utility"
        };

        private readonly RewardMeterConfig _config;
        private readonly IRandomSource _random;
        private readonly CardCatalog _cards;
        private RewardDamageHandler _damageHandler;

        public RewardMeterSystem(
            RewardMeterConfig config,
            IRandomSource random,
            CardCatalog cards = null)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _cards = cards;
            ValidateConfig(config);
        }

        public RewardMeterConfig Config => _config;

        public void Initialize(GameState state)
        {
            if (state == null)
            {
                return;
            }

            state.RewardThresholdIndex = 0;
            state.RewardThreshold = ThresholdAt(0);
        }

        public void AttachDamageHandler(RewardDamageHandler handler)
        {
            _damageHandler = handler;
        }

        public void AddPoints(GameState state, float amount)
        {
            if (state == null
                || amount <= 0f
                || state.RewardPointSuppressionDepth > 0)
            {
                return;
            }

            float gained = amount
                * Math.Max(0f, _config.pointMul)
                * Math.Max(0f, 1f + state.RewardPointGainBonus);
            state.RewardPoints += gained;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "rewardPointsGained",
                value = gained,
                rewardPoints = state.RewardPoints
            });
            TryTrigger(state);
        }

        public bool ConfirmReceipt(GameState state)
        {
            RewardReceipt receipt = state?.PendingRewardReceipt;
            if (receipt == null)
            {
                return false;
            }

            state.PendingRewardReceipt = null;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "rewardConfirmed",
                rewardId = receipt.RewardId,
                activationIndex = receipt.ActivationIndex
            });
            state.RefreshDecisionLock();
            TryTrigger(state);
            return true;
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state == null || state.RewardSurgeRemaining <= 0f)
            {
                return;
            }

            state.RewardSurgeRemaining = Math.Max(
                0f,
                state.RewardSurgeRemaining - Math.Max(0f, deltaTime));
            if (state.RewardSurgeRemaining <= 0f)
            {
                state.RewardSurgeTag = null;
                state.RewardSurgeValue = 0f;
            }
        }

        private void TryTrigger(GameState state)
        {
            if (state.PendingRewardReceipt != null
                || state.RewardPoints < state.RewardThreshold
                || float.IsInfinity(state.RewardThreshold))
            {
                return;
            }

            state.RewardPoints -= state.RewardThreshold;
            int activationIndex = state.RewardActivationCount++;
            state.RewardThresholdIndex++;
            state.RewardThreshold = ThresholdAt(state.RewardThresholdIndex);
            RewardDefinitionConfig reward = PickReward(state);
            state.LastRewardId = reward.id;
            RewardExecutionResult result = Execute(
                state,
                reward,
                activationIndex);
            state.PendingRewardReceipt = new RewardReceipt(
                reward.id,
                activationIndex,
                result);
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "rewardTriggered",
                rewardId = reward.id,
                activationIndex = activationIndex,
                detail = ResultSummary(result)
            });
            state.RefreshDecisionLock();
        }

        private RewardExecutionResult Execute(
            GameState state,
            RewardDefinitionConfig reward,
            int activationIndex)
        {
            var result = new RewardExecutionResult();
            RewardActionConfig action = reward.action;
            state.RewardPointSuppressionDepth++;
            try
            {
                switch (action.kind)
                {
                    case "globalDamage":
                        ExecuteGlobalDamage(state, action, result);
                        break;
                    case "globalControl":
                        ExecuteGlobalControl(state, action, result);
                        break;
                    case "restoreAndShield":
                        ExecuteRestore(state, action, result);
                        break;
                    case "grantWildcards":
                        ExecuteWildcards(
                            state,
                            action,
                            activationIndex,
                            result);
                        break;
                    case "buildSurge":
                        ExecuteBuildSurge(state, action, result);
                        break;
                    default:
                        throw new InvalidOperationException(
                            $"Unknown reward action: {action.kind}.");
                }
            }
            finally
            {
                state.RewardPointSuppressionDepth--;
            }

            return result;
        }

        private void ExecuteGlobalDamage(
            GameState state,
            RewardActionConfig action,
            RewardExecutionResult result)
        {
            int killsBefore = state.Kills;
            EnemyState[] enemies = state.Enemies.ToArray();
            foreach (EnemyState enemy in enemies)
            {
                float before = enemy.Hp;
                if (_damageHandler != null)
                {
                    _damageHandler(
                        state,
                        enemy,
                        action.damageMul,
                        action.bossMaxHpRatioCap);
                }
                else
                {
                    float cap = enemy.Kind == EnemyKind.Boss
                        || enemy.SpawnKind == EnemySpawnKind.WaveBoss
                            ? enemy.MaxHp * action.bossMaxHpRatioCap
                            : float.PositiveInfinity;
                    enemy.Hp = Math.Max(
                        0f,
                        enemy.Hp - Math.Min(action.damageMul, cap));
                }

                result.DamageDealt += Math.Max(0f, before - enemy.Hp);
            }

            result.EnemiesKilled = Math.Max(0, state.Kills - killsBefore);
        }

        private static void ExecuteGlobalControl(
            GameState state,
            RewardActionConfig action,
            RewardExecutionResult result)
        {
            foreach (EnemyState enemy in state.Enemies)
            {
                enemy.FrozenRemaining = Math.Max(
                    enemy.FrozenRemaining,
                    action.freezeSeconds);
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    action.vulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    action.vulnerableSeconds);
                result.FrozenCount++;
            }
        }

        private static void ExecuteRestore(
            GameState state,
            RewardActionConfig action,
            RewardExecutionResult result)
        {
            float before = state.Hp;
            state.RestoreHp(state.MaxHp * action.healRatio);
            result.HealingGranted = state.Hp - before;
            state.ShieldHits = Math.Max(state.ShieldHits, action.shieldHits);
            state.ShieldMaxHits = Math.Max(
                state.ShieldMaxHits,
                action.shieldHits);
            result.ShieldHitsGranted = action.shieldHits;
        }

        private static void ExecuteWildcards(
            GameState state,
            RewardActionConfig action,
            int activationIndex,
            RewardExecutionResult result)
        {
            if (action.starSchedule == null
                || action.starSchedule.Length == 0
                || action.count <= 0)
            {
                return;
            }

            int star = action.starSchedule[Math.Min(
                activationIndex,
                action.starSchedule.Length - 1)];
            state.Wildcards[star] = state.Wildcards.TryGetValue(
                star,
                out int current)
                ? current + action.count
                : action.count;
            result.WildcardGrants = new[]
            {
                new WildcardGrant(star, action.count)
            };
        }

        private void ExecuteBuildSurge(
            GameState state,
            RewardActionConfig action,
            RewardExecutionResult result)
        {
            string tag = DominantBuildTag(state);
            state.RewardSurgeTag = tag;
            state.RewardSurgeRemaining = Math.Max(0f, action.duration);
            state.RewardSurgeValue = Math.Max(0f, action.value);
            result.SurgeTag = tag;
            result.SurgeDuration = state.RewardSurgeRemaining;
        }

        private RewardDefinitionConfig PickReward(GameState state)
        {
            var candidates = new List<RewardDefinitionConfig>();
            foreach (RewardDefinitionConfig reward in _config.rewards)
            {
                if (!_config.preventImmediateRepeat
                    || reward.id != state.LastRewardId)
                {
                    candidates.Add(reward);
                }
            }

            if (candidates.Count == 0 || TotalWeight(state, candidates) <= 0f)
            {
                candidates.AddRange(_config.rewards);
            }

            float roll = _random.NextFloat() * TotalWeight(state, candidates);
            foreach (RewardDefinitionConfig reward in candidates)
            {
                roll -= Weight(state, reward);
                if (roll < 0f)
                {
                    return reward;
                }
            }

            return candidates[candidates.Count - 1];
        }

        private float TotalWeight(
            GameState state,
            List<RewardDefinitionConfig> rewards)
        {
            float total = 0f;
            foreach (RewardDefinitionConfig reward in rewards)
            {
                total += Weight(state, reward);
            }

            return total;
        }

        private float Weight(GameState state, RewardDefinitionConfig reward)
        {
            float weight = Math.Max(0f, reward.weight);
            RewardLowHpWeightBoostConfig boost = _config.lowHpWeightBoost;
            if (boost != null
                && reward.id == boost.rewardId
                && state.Hp / Math.Max(1f, state.MaxHp) < boost.hpRatioBelow)
            {
                weight *= Math.Max(0f, boost.weightMul);
            }

            return weight;
        }

        private string DominantBuildTag(GameState state)
        {
            var scores = new Dictionary<string, float>(StringComparer.Ordinal);
            foreach (string tag in BuildTags)
            {
                scores[tag] = 0f;
            }

            ScoreCards(state.Equipment, 3f, scores);
            ScoreCards(state.Hand, 1f, scores);
            string best = BuildTags[0];
            foreach (string tag in BuildTags)
            {
                if (scores[tag] > scores[best])
                {
                    best = tag;
                }
            }

            return best;
        }

        private void ScoreCards(
            CardState[] cards,
            float multiplier,
            Dictionary<string, float> scores)
        {
            foreach (CardState card in cards)
            {
                if (card == null || card.Provisional)
                {
                    continue;
                }

                string tag = _cards?.Find(card.Type)?.category;
                if (tag == "economy")
                {
                    tag = "utility";
                }

                if (!string.IsNullOrEmpty(tag) && scores.ContainsKey(tag))
                {
                    scores[tag] += card.Star * multiplier;
                }
            }
        }

        private float ThresholdAt(int index)
        {
            if (index >= 0 && index < _config.thresholds.Length)
            {
                return _config.thresholds[index];
            }

            return _config.afterSchedule == "repeatLast"
                && _config.thresholds.Length > 0
                    ? _config.thresholds[_config.thresholds.Length - 1]
                    : float.PositiveInfinity;
        }

        private static string ResultSummary(RewardExecutionResult result)
        {
            if (result.DamageDealt > 0f)
                return $"damage:{result.DamageDealt:0.##}";
            if (result.FrozenCount > 0)
                return $"frozen:{result.FrozenCount}";
            if (result.HealingGranted > 0f || result.ShieldHitsGranted > 0)
                return $"heal:{result.HealingGranted:0.##},shield:{result.ShieldHitsGranted}";
            if (result.WildcardGrants.Length > 0)
                return $"wildcard:{result.WildcardGrants[0].Star}x{result.WildcardGrants[0].Count}";
            return string.IsNullOrEmpty(result.SurgeTag)
                ? "reward"
                : $"surge:{result.SurgeTag}:{result.SurgeDuration:0.##}";
        }

        private static void ValidateConfig(RewardMeterConfig config)
        {
            if (config.thresholds == null || config.thresholds.Length == 0)
                throw new InvalidOperationException("Reward thresholds are required.");
            if (config.rewards == null || config.rewards.Length == 0)
                throw new InvalidOperationException("Reward definitions are required.");

            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (RewardDefinitionConfig reward in config.rewards)
            {
                if (reward == null
                    || string.IsNullOrEmpty(reward.id)
                    || !ids.Add(reward.id)
                    || reward.action == null
                    || string.IsNullOrEmpty(reward.action.kind))
                {
                    throw new InvalidOperationException(
                        "Reward definitions must have unique ids and actions.");
                }
            }
        }
    }
}
