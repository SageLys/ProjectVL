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

        public static DifficultyConfig LoadDifficulty()
        {
            return Load<DifficultyConfig>("Config/difficulty");
        }

        public static ProgressionConfig LoadProgression()
        {
            return Load<ProgressionConfig>("Config/progression");
        }

        public static GodsConfig LoadGods()
        {
            return Load<GodsConfig>("Config/gods");
        }

        public static RelicsConfig LoadRelics()
        {
            return Load<RelicsConfig>("Config/relics");
        }

        public static BountyConfig LoadBounty()
        {
            return Load<BountyConfig>("Config/bounty");
        }

        public static WaveRewardsConfig LoadWaveRewards()
        {
            return Load<WaveRewardsConfig>("Config/waveRewards");
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
