using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class CardAffixesConfig
    {
        public string version;
        public string sourceVersion;
        public CardAffixPoolConfig[] cards =
            Array.Empty<CardAffixPoolConfig>();
    }

    [Serializable]
    public sealed class CardAffixPoolConfig
    {
        public string cardId;
        public int count;
        public CardAffixCandidateConfig[] candidates =
            Array.Empty<CardAffixCandidateConfig>();
    }

    [Serializable]
    public sealed class CardAffixCandidateConfig
    {
        public string stat;
        public float weight;
        public float min;
        public float max;
        public float step;
        public float consumableDuration;
    }
}
