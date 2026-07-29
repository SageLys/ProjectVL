using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class EvolutionTextConfig
    {
        public string version;
        public EvolutionCardTextConfig[] cards =
            Array.Empty<EvolutionCardTextConfig>();
    }

    [Serializable]
    public sealed class EvolutionCardTextConfig
    {
        public string cardId;
        public EvolutionOptionTextConfig[] options =
            Array.Empty<EvolutionOptionTextConfig>();
    }

    [Serializable]
    public sealed class EvolutionOptionTextConfig
    {
        public string id;
        public string name;
        public string summary;
    }
}
