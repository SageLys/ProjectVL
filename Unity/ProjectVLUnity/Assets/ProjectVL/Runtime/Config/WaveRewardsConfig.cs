using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class WaveRewardsConfig
    {
        public string version;
        public WaveRewardEffectConfig[] floor =
            Array.Empty<WaveRewardEffectConfig>();
        public WaveRewardEffectConfig[] choice =
            Array.Empty<WaveRewardEffectConfig>();
    }

    [Serializable]
    public sealed class WaveRewardEffectConfig
    {
        public string id;
        public string stat;
        public float add;
    }
}
