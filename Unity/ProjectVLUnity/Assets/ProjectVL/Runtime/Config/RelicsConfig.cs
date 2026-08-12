using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class RelicsConfig
    {
        public string version;
        public RelicConfig[] relics = Array.Empty<RelicConfig>();
    }

    [Serializable]
    public sealed class RelicConfig
    {
        public string id;
        public string god;
        public string rarity;
        public string textKey;
        public string title;
        public string desc;
        public string[] targetTags = Array.Empty<string>();
        public RelicEffectConfig[] effects = Array.Empty<RelicEffectConfig>();
        public RelicPoolInfluenceConfig poolInfluence;
        public int maxStacks = 1;
    }

    [Serializable]
    public sealed class RelicEffectConfig
    {
        public string kind;
        public string[] targetTags = Array.Empty<string>();
        public string axis;
        public float value;
    }

    [Serializable]
    public sealed class RelicPoolInfluenceConfig
    {
        public float godWeightAdd;
        public int pityDrops;
    }
}
