using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class ProgressionConfig
    {
        public int relicChoices = 3;
        public float[] xpThresholds = Array.Empty<float>();
        public UpgradeOptionConfig[] choices = Array.Empty<UpgradeOptionConfig>();
    }

    [Serializable]
    public sealed class UpgradeOptionConfig
    {
        public string id;
        public string title;
        public string description;
        public string stat;
        public float add;
    }
}
