using System;
using ProjectVL.Config;

namespace ProjectVL.Systems
{
    public enum RunStage
    {
        Selection,
        Build,
        Validation
    }

    public sealed class ResolvedWavePlan
    {
        public RunStage Stage { get; }
        public int Quota { get; }
        public float TargetOnScreen { get; }
        public float CheckInterval { get; }
        public int BatchMax { get; }
        public int MaxAlive { get; }
        public float SprintWindow { get; }
        public float SprintMultiplier { get; }

        public ResolvedWavePlan(
            RunStage stage,
            int quota,
            float targetOnScreen,
            float checkInterval,
            int batchMax,
            int maxAlive,
            float sprintWindow,
            float sprintMultiplier)
        {
            Stage = stage;
            Quota = Math.Max(0, quota);
            TargetOnScreen = Math.Max(0f, targetOnScreen);
            CheckInterval = Math.Max(0f, checkInterval);
            BatchMax = Math.Max(1, batchMax);
            MaxAlive = Math.Max(0, maxAlive);
            SprintWindow = Math.Max(0f, sprintWindow);
            SprintMultiplier = Math.Max(1f, sprintMultiplier);
        }
    }

    public sealed class WavePlanResolver
    {
        private readonly WavesConfig _waves;

        public WavePlanResolver(WavesConfig waves)
        {
            _waves = waves;
        }

        public ResolvedWavePlan Resolve(int wave)
        {
            RunStage stage = StageForWave(wave);
            if (stage == RunStage.Validation)
            {
                return new ResolvedWavePlan(stage, 0, 0f, 0f, 1, 0, 0f, 1f);
            }

            RegularStageConfig config = stage == RunStage.Selection
                ? _waves.stagePlan.selection
                : _waves.stagePlan.build;
            float progress = StageProgress(wave, stage);
            return new ResolvedWavePlan(
                stage,
                (int)CurveValue(config.waveQuota, progress),
                CurveValue(config.targetOnScreen, progress),
                config.checkInterval,
                config.batchMax,
                config.maxAlive,
                config.waveEndSprint.window,
                config.waveEndSprint.multiplier);
        }

        public RunStage StageForWave(int wave)
        {
            if (wave <= _waves.stagePlan.selectionWaves)
            {
                return RunStage.Selection;
            }

            if (wave > _waves.totalWaves - _waves.stagePlan.validationWaves)
            {
                return RunStage.Validation;
            }

            return RunStage.Build;
        }

        private float StageProgress(int wave, RunStage stage)
        {
            int start = stage == RunStage.Selection
                ? 1
                : _waves.stagePlan.selectionWaves + 1;
            int end = stage == RunStage.Selection
                ? _waves.stagePlan.selectionWaves
                : _waves.totalWaves - _waves.stagePlan.validationWaves;
            if (end <= start)
            {
                return 1f;
            }

            return Math.Max(0f, Math.Min(1f, (float)(wave - start) / (end - start)));
        }

        private static float CurveValue(StageCurveConfig curve, float progress)
        {
            float t = Math.Max(0f, Math.Min(1f, progress));
            return curve.start
                + (curve.end - curve.start)
                * (float)Math.Pow(t, curve.power);
        }
    }
}
