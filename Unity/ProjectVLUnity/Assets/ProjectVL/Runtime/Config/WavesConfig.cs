using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class WavesConfig
    {
        public int totalWaves;
        public string spawnMode;
        public int enemyCountBase;
        public int enemyCountPerWave;
        public float firstSpawnDelay;
        public SpawnIntervalConfig spawnInterval = new SpawnIntervalConfig();
        public BudgetConfig budget = new BudgetConfig();
        public StagePlanConfig stagePlan = new StagePlanConfig();
        public float spawnMargin;
        public TypeRollConfig typeRoll = new TypeRollConfig();
        public int[] bossWaves = Array.Empty<int>();
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

    [Serializable]
    public sealed class LinearWaveValue
    {
        public float @base;
        public float perWave;
    }

    [Serializable]
    public sealed class WaveEndSprintConfig
    {
        public float window;
        public float multiplier = 1f;
    }

    [Serializable]
    public sealed class BudgetConfig
    {
        public LinearWaveValue waveQuota = new LinearWaveValue();
        public LinearWaveValue targetOnScreen = new LinearWaveValue();
        public float checkInterval;
        public int batchMax;
        public WaveEndSprintConfig waveEndSprint = new WaveEndSprintConfig();
        public int maxAlive;
    }

    [Serializable]
    public sealed class StageCurveConfig
    {
        public float start;
        public float end;
        public float power = 1f;
    }

    [Serializable]
    public sealed class RegularStageConfig
    {
        public StageCurveConfig waveQuota = new StageCurveConfig();
        public StageCurveConfig targetOnScreen = new StageCurveConfig();
        public float checkInterval;
        public int batchMax;
        public int maxAlive;
        public WaveEndSprintConfig waveEndSprint = new WaveEndSprintConfig();
    }

    [Serializable]
    public sealed class StagePlanConfig
    {
        public int selectionWaves;
        public int validationWaves;
        public RegularStageConfig selection = new RegularStageConfig();
        public RegularStageConfig build = new RegularStageConfig();
    }
}
