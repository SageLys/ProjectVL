using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class CardsConfig
    {
        public string version;
        public string sourceVersion;
        public CardDefinitionConfig[] cards =
            Array.Empty<CardDefinitionConfig>();
    }

    [Serializable]
    public sealed class CardDefinitionConfig
    {
        public string id;
        public string god;
        public string primaryGod;
        public string[] sourceGods = Array.Empty<string>();
        public string category;
        public string[] synergyTags = Array.Empty<string>();
        public string textKey;
        public string displayName;
        public bool recipeOnly;
        public bool consumable;
        public string[] evolution3 = Array.Empty<string>();
        public string[] evolution5 = Array.Empty<string>();
    }
}
