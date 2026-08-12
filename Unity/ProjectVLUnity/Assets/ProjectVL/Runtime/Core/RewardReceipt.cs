using System;

namespace ProjectVL.Core
{
    [Serializable]
    public sealed class RewardReceipt
    {
        public string RewardId { get; }
        public int ActivationIndex { get; }
        public RewardExecutionResult Result { get; }

        public RewardReceipt(
            string rewardId,
            int activationIndex,
            RewardExecutionResult result)
        {
            RewardId = rewardId;
            ActivationIndex = activationIndex;
            Result = result ?? new RewardExecutionResult();
        }
    }

    [Serializable]
    public sealed class RewardExecutionResult
    {
        public float DamageDealt { get; internal set; }
        public int EnemiesKilled { get; internal set; }
        public float HealingGranted { get; internal set; }
        public int ShieldHitsGranted { get; internal set; }
        public int FrozenCount { get; internal set; }
        public WildcardGrant[] WildcardGrants { get; internal set; } =
            Array.Empty<WildcardGrant>();
        public string SurgeTag { get; internal set; }
        public float SurgeDuration { get; internal set; }
    }

    [Serializable]
    public sealed class WildcardGrant
    {
        public int Star { get; }
        public int Count { get; }

        public WildcardGrant(int star, int count)
        {
            Star = star;
            Count = count;
        }
    }
}
