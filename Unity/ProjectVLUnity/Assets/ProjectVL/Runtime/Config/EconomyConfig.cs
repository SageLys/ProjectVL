using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class EconomyConfig
    {
        public int maxStar = 6;
        public int mergeCopies = 2;
        public int equipThreshold = 3;
        public int handSlots = 7;
        public int equipSlots = 3;
        public bool equipSwappable = true;
        public bool equipDistinctTypes = true;
        public bool feedEquipped = true;
        public EconomyPlaceholderAssumptions placeholderAssumptions =
            new EconomyPlaceholderAssumptions();
        public int mergeCopiesWhenTwoCopyDisabled = 3;
        public bool equipIrreversible;
        public string unequipPolicy = "consume";
        public bool inRunSlotExpansion;
        public DropStarPolicyConfig dropStarPolicy =
            new DropStarPolicyConfig();
        public EconomyDropsConfig drops = new EconomyDropsConfig();
        public EconomyDefaultsConfig defaults = new EconomyDefaultsConfig();
        public OrdinaryDropRateConfig ordinaryDropRate =
            new OrdinaryDropRateConfig();
        public NormalDropTypePolicyConfig normalDropTypePolicy =
            new NormalDropTypePolicyConfig();
    }

    [Serializable]
    public sealed class EconomyPlaceholderAssumptions
    {
        public bool twoCopyMerge = true;
        public bool normalDropsOnlyOneStar = true;
        public bool feedEquipped = true;
        public bool distinctEquippedTypes = true;
    }

    [Serializable]
    public sealed class DropStarPolicyConfig
    {
        public int normal = 1;
        public int bountyBossMax = 2;
        public float star2Share = 0.05f;
    }

    [Serializable]
    public sealed class OrdinaryDropRateConfig
    {
        public bool enabled;
        public float selectionPerMinute = 35f;
        public float buildPerMinute = 40f;
        public float buildTransitionSeconds = 20f;
        public float carryCap = 1.5f;
        public bool modifiersAffectTarget = true;
    }

    [Serializable]
    public sealed class EconomyDropsConfig
    {
        public float pickupRadius = 34f;
        public float chanceCap = 0.95f;
    }

    [Serializable]
    public sealed class EconomyDefaultsConfig
    {
        public float dropChance = 0.27f;
        public float dropLifetime = 5f;
    }

    [Serializable]
    public sealed class NormalDropTypePolicyConfig
    {
        public bool enabled = true;
        public int roleBagSize = 10;
        public NormalDropRoleMixConfig earlyMix =
            new NormalDropRoleMixConfig(6, 3, 1);
        public NormalDropRoleMixConfig lateMix =
            new NormalDropRoleMixConfig(1, 7, 2);
        public int bootstrapMinDiscovery = 6;
        public GodAffinityPolicyConfig godAffinity =
            new GodAffinityPolicyConfig();
        public BuildMaturityPolicyConfig maturity =
            new BuildMaturityPolicyConfig();
        public BuildDropPolicyConfig build = new BuildDropPolicyConfig();
        public PivotDropPolicyConfig pivot = new PivotDropPolicyConfig();
        public int maxSameTypeStreak = 2;
    }

    [Serializable]
    public sealed class NormalDropRoleMixConfig
    {
        public int discovery;
        public int build;
        public int pivot;

        public NormalDropRoleMixConfig()
        {
        }

        public NormalDropRoleMixConfig(
            int discovery,
            int build,
            int pivot)
        {
            this.discovery = discovery;
            this.build = build;
            this.pivot = pivot;
        }
    }

    [Serializable]
    public sealed class GodAffinityPolicyConfig
    {
        public float scorePerStack = 2.5f;
        public float scoreCap = 6f;
    }

    [Serializable]
    public sealed class BuildMaturityPolicyConfig
    {
        public int fullMergeOps = 10;
        public int fullHighestStar = 4;
        public int fullEquippedTypes = 2;
        public float mergeWeight = 0.25f;
        public float starWeight = 0.35f;
        public float equipWeight = 0.4f;
    }

    [Serializable]
    public sealed class BuildDropPolicyConfig
    {
        public int topK = 3;
        public float scorePower = 1.25f;
        public float mergeReadyMultiplier = 1.5f;
        public float equippedBaseBonus = 6f;
        public float equippedStarBonus = 2f;
        public float historicalMergeWeight = 0.5f;
        public int historicalMergeCap = 8;
        public float maxWeightRatio = 6f;
    }

    [Serializable]
    public sealed class PivotDropPolicyConfig
    {
        public int excludeTopK = 2;
        public float candidateFraction = 0.5f;
    }
}
