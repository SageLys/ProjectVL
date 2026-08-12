using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class EvolutionBranchEffectsConfig
    {
        public string version;
        public string sourceVersion;
        public CompiledEvolutionCardConfig[] cards =
            Array.Empty<CompiledEvolutionCardConfig>();
    }

    [Serializable]
    public sealed class CompiledEvolutionCardConfig
    {
        public string cardId;
        public CompiledEvolutionOptionConfig[] options =
            Array.Empty<CompiledEvolutionOptionConfig>();
    }

    [Serializable]
    public sealed class CompiledEvolutionOptionConfig
    {
        public string optionId;
        public CompiledEffectBindingConfig[] bindings =
            Array.Empty<CompiledEffectBindingConfig>();
    }
}
