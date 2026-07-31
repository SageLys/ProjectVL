using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class ProgressionConfig
    {
        public float killXpMul = 1f;
        public int relicChoices = 3;
        public float[] xpThresholds = Array.Empty<float>();
        public RelicRarityWeights[] rarityByRelicIndex =
            Array.Empty<RelicRarityWeights>();
        public SettlementConfig settlement = new SettlementConfig();
    }

    [Serializable]
    public sealed class RelicRarityWeights
    {
        public float common;
        public float rare;
        public float epic;
    }

    [Serializable]
    public sealed class SettlementConfig
    {
        public string version;
        public string sourceVersion;
        public int winBonus = 500;
        public int perWaveCleared = 40;
        public int perKill = 2;
        public int hpRatioBonusMax = 200;
        public int perEquippedStarSquared = 10;
        public WildcardSettlementValues wildcardStarValue =
            new WildcardSettlementValues();

        public int WildcardValue(int star)
        {
            switch (star)
            {
                case 1:
                    return wildcardStarValue.star1;
                case 2:
                    return wildcardStarValue.star2;
                case 3:
                    return wildcardStarValue.star3;
                case 4:
                    return wildcardStarValue.star4;
                case 5:
                    return wildcardStarValue.star5;
                default:
                    return 0;
            }
        }
    }

    [Serializable]
    public sealed class WildcardSettlementValues
    {
        public int star1 = 15;
        public int star2 = 40;
        public int star3 = 100;
        public int star4 = 250;
        public int star5 = 600;
    }
}
