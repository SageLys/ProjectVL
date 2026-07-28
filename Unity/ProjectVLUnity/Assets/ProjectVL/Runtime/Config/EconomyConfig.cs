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
    }
}
