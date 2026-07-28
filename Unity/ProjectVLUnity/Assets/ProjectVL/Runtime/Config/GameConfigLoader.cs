using System;
using UnityEngine;

namespace ProjectVL.Config
{
    public static class GameConfigLoader
    {
        public static EnemiesConfig LoadEnemies()
        {
            return Load<EnemiesConfig>("Config/enemies");
        }

        public static WavesConfig LoadWaves()
        {
            return Load<WavesConfig>("Config/waves");
        }

        public static EconomyConfig LoadEconomy()
        {
            return Load<EconomyConfig>("Config/economy");
        }

        public static EvolutionRecipesConfig LoadEvolutionRecipes()
        {
            return Load<EvolutionRecipesConfig>("Config/evolutionRecipes");
        }

        private static T Load<T>(string resourcePath)
        {
            TextAsset asset = Resources.Load<TextAsset>(resourcePath);
            if (asset == null)
            {
                throw new InvalidOperationException($"Missing Resources/{resourcePath}.json.");
            }

            T config = JsonUtility.FromJson<T>(asset.text);
            if (config == null)
            {
                throw new InvalidOperationException($"Could not parse {resourcePath}.json.");
            }

            return config;
        }
    }
}
