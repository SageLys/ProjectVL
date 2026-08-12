using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class RewardMeterConfig
    {
        public string version;
        public float pointMul = 1f;
        public float expiryConvertPointsPerStar = 4f;
        public float[] thresholds = Array.Empty<float>();
        public string afterSchedule = "repeatLast";
        public bool rewardKillsGrantPoints;
        public bool preventImmediateRepeat = true;
        public RewardLowHpWeightBoostConfig lowHpWeightBoost =
            new RewardLowHpWeightBoostConfig();
        public RewardDefinitionConfig[] rewards =
            Array.Empty<RewardDefinitionConfig>();
    }

    [Serializable]
    public sealed class RewardLowHpWeightBoostConfig
    {
        public float hpRatioBelow = 0.4f;
        public string rewardId;
        public float weightMul = 1f;
    }

    [Serializable]
    public sealed class RewardDefinitionConfig
    {
        public string id;
        public string textKey;
        public float weight = 1f;
        public RewardActionConfig action = new RewardActionConfig();
    }

    [Serializable]
    public sealed class RewardActionConfig
    {
        public string kind;
        public float damageMul;
        public float bossMaxHpRatioCap;
        public float freezeSeconds;
        public float vulnerableRatio;
        public float vulnerableSeconds;
        public float healRatio;
        public int shieldHits;
        public int count;
        public int[] starSchedule = Array.Empty<int>();
        public float duration;
        public float value;
    }
}
