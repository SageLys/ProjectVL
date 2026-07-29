using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class BountyConfig
    {
        public bool enabled = true;
        public BountyRewardBiasConfig rewardBias =
            new BountyRewardBiasConfig();
        public BountyOfferConfig offer = new BountyOfferConfig();
        public BountyEncounterConfig encounter =
            new BountyEncounterConfig();
        public BountyRewardConfig reward = new BountyRewardConfig();
        public BountyVisualConfig visual = new BountyVisualConfig();
    }

    [Serializable]
    public sealed class BountyRewardBiasConfig
    {
        public bool enabled = true;
        public float primaryShare = 0.7f;
        public float secondaryShare = 0.15f;
        public float nearMergeBonus = 2f;
        public float investedBonus = 1.5f;
        public float droughtBonus = 1.5f;
    }

    [Serializable]
    public sealed class BountyOfferConfig
    {
        public int enabledFromWave = 1;
        public float checkIntervalSeconds = 4f;
        public float baseChancePerCheck = 0.1f;
        public float minChancePerCheck = 0.02f;
        public float maxChancePerCheck = 0.42f;
        public float noDamageRampSeconds = 35f;
        public float noDamageBonusMax = 0.18f;
        public float healthyHpThreshold = 0.75f;
        public float healthyHpBonusMax = 0.1f;
        public float recentDamagePenalty = 0.12f;
        public float recentDamagePenaltySeconds = 10f;
        public float markWindowSeconds = 8f;
        public float cooldownSeconds = 12f;
        public int minOffersPerWave = 1;
        public int maxOffersPerWave = 2;
        public float guaranteeAtWaveProgress = 0.55f;
        public int maxConcurrentOffers = 1;
        public int maxConcurrentEncounters = 1;
    }

    [Serializable]
    public sealed class BountyEncounterConfig
    {
        public int enemyCountBase = 3;
        public float enemyCountPerWave = 0.5f;
        public int enemyCountMax = 7;
        public float hpMul = 1.35f;
        public float speedMul = 1.1f;
        public float damageMul = 1.15f;
        public float spawnIntervalSeconds = 0.18f;
        public float spawnSpread = 110f;
        public float emergencyOverrideDistance = 95f;
        public BountyCompositionConfig composition =
            new BountyCompositionConfig();
    }

    [Serializable]
    public sealed class BountyCompositionConfig
    {
        public float normalWeight = 0.5f;
        public float fastWeight = 0.3f;
        public float tankWeight = 0.2f;
    }

    [Serializable]
    public sealed class BountyRewardConfig
    {
        public int cardCount = 1;
        public int[] cardStarByWave = { 1, 1, 2, 2, 3, 3 };
        public int cardStarMax = 3;
        public int wildcardCount = 1;
        public int[] wildcardStarByWave = { 1, 1, 2, 2, 3, 4 };
        public int wildcardStarMax = 4;
        public float dropLifetimeSeconds = 12f;
        public int repeatProtection = 1;
    }

    [Serializable]
    public sealed class BountyVisualConfig
    {
        public float offerRadius = 30f;
        public float offerEdgeInset = 28f;
        public float enemyGlowRadius = 10f;
        public float enemyPulseSpeed = 3f;
        public bool showRewardName = true;
    }
}
