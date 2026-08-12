using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class GodsConfig
    {
        public string version;
        public GodConfig[] gods = Array.Empty<GodConfig>();
    }

    [Serializable]
    public sealed class GodConfig
    {
        public string id;
        public string textKey;
        public string[] anchorCardIds = Array.Empty<string>();
        public string[] variableCardIds = Array.Empty<string>();
        public int mainRosterSize;
        public int subRosterSize;
    }
}
