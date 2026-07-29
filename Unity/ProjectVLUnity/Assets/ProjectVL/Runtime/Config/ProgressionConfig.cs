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
    }

    [Serializable]
    public sealed class RelicRarityWeights
    {
        public float common;
        public float rare;
        public float epic;
    }
}
