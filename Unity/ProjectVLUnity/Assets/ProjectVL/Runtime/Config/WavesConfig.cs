using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class WavesConfig
    {
        public int totalWaves;
        public int enemyCountBase;
        public int enemyCountPerWave;
        public float firstSpawnDelay;
        public SpawnIntervalConfig spawnInterval = new SpawnIntervalConfig();
        public float spawnMargin;
        public TypeRollConfig typeRoll = new TypeRollConfig();
    }

    [Serializable]
    public sealed class SpawnIntervalConfig
    {
        public float @base;
        public float perWave;
        public float min;
    }

    [Serializable]
    public sealed class TypeRollConfig
    {
        public float tankBase;
        public float tankPerWave;
        public float fastThreshold;
    }
}
