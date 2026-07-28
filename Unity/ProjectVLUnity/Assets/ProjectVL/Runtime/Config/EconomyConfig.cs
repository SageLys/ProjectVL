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
        public EconomyDropsConfig drops = new EconomyDropsConfig();
        public EconomyDefaultsConfig defaults = new EconomyDefaultsConfig();
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
}
