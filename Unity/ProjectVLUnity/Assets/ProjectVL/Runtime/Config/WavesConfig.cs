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
        public IntermissionConfig intermission = new IntermissionConfig();
        public float spawnMargin;
        public float bottomSpawnInset = 226f;
        public TypeRollConfig typeRoll = new TypeRollConfig();
        public int[] bossWaves = Array.Empty<int>();
        public WaveBossConfig waveBoss = new WaveBossConfig();
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
        public ValidationWaveConfig[] validation = Array.Empty<ValidationWaveConfig>();
    }

    [Serializable]
    public sealed class RewardConfig
    {
        public string kind;
        public int star;
        public int count;
        public string typePolicy;
    }

    [Serializable]
    public sealed class ValidationEnemyConfig
    {
        public string type;
        public float hpMul = 1f;
        public float damageMul = 1f;
        public float speedMul = 1f;
        public float ccResistOverride;
        public float knockbackResistOverride;
        public RewardConfig reward = new RewardConfig();
    }

    [Serializable]
    public sealed class ValidationWaveConfig
    {
        public ValidationEnemyConfig[] enemies = Array.Empty<ValidationEnemyConfig>();
        public RewardConfig bossReward = new RewardConfig();
    }

    [Serializable]
    public sealed class IntermissionFreeSecondsConfig
    {
        public float selection;
        public float buildEarly;
        public float buildLate;
        public float validation;
    }

    [Serializable]
    public sealed class IntermissionConfig
    {
        public IntermissionFreeSecondsConfig freeSeconds =
            new IntermissionFreeSecondsConfig();
        public float settleSeconds;
        public bool autoReadyHighlight;
    }

    [Serializable]
    public sealed class BossRewardScheduleConfig
    {
        public int[] selection = Array.Empty<int>();
        public int[] build = Array.Empty<int>();
        public int[] validation = Array.Empty<int>();
    }

    [Serializable]
    public sealed class BossRewardConfig
    {
        public BossRewardScheduleConfig schedule = new BossRewardScheduleConfig();
        public int count = 1;
    }

    [Serializable]
    public sealed class WaveBossConfig
    {
        public BossRewardConfig reward = new BossRewardConfig();
    }
}
