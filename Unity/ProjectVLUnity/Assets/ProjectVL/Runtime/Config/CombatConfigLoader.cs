using System;
using UnityEngine;

namespace ProjectVL.Config
{
    public static class CombatConfigLoader
    {
        private const string DefaultResourcePath = "Config/combat";

        public static CombatConfig LoadDefault()
        {
            TextAsset asset = Resources.Load<TextAsset>(DefaultResourcePath);
            if (asset == null)
            {
                throw new InvalidOperationException(
                    $"Missing Resources/{DefaultResourcePath}.json.");
            }

            return FromJson(asset.text);
        }

        public static CombatConfig FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Combat configuration JSON is empty.", nameof(json));
            }

            CombatConfig config = JsonUtility.FromJson<CombatConfig>(json);
            CombatConfigValidator.ValidateOrThrow(config);
            return config;
        }
    }
}
