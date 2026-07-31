using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class RecipeProductEffectsConfig
    {
        public string version;
        public string sourceVersion;
        public RecipeProductCardEffectsConfig[] cards =
            Array.Empty<RecipeProductCardEffectsConfig>();
    }

    [Serializable]
    public sealed class RecipeProductCardEffectsConfig
    {
        public string cardId;
        public string category;
        public string[] synergyTags = Array.Empty<string>();
        public CompiledEffectBindingConfig[] bindings =
            Array.Empty<CompiledEffectBindingConfig>();
    }

    [Serializable]
    public sealed class CompiledEffectBindingConfig
    {
        public string trigger;
        public string at;
        public CompiledEffectParamConfig[] triggerParams =
            Array.Empty<CompiledEffectParamConfig>();
        public CompiledEffectAtomConfig[] effects =
            Array.Empty<CompiledEffectAtomConfig>();
    }

    [Serializable]
    public sealed class CompiledEffectAtomConfig
    {
        public string atom;
        public string relation;
        public CompiledEffectParamConfig[] parameters =
            Array.Empty<CompiledEffectParamConfig>();
        public CompiledEffectParamConfig[] @params =
            Array.Empty<CompiledEffectParamConfig>();
        public CompiledEffectAtomConfig[] children =
            Array.Empty<CompiledEffectAtomConfig>();

        public CompiledEffectParamConfig[] Params =>
            @params != null && @params.Length > 0 ? @params : parameters;
    }

    [Serializable]
    public sealed class CompiledEffectParamConfig
    {
        public string key;
        public string kind;
        public float number;
        public string text;
        public bool flag;
    }
}
