using System;

namespace ProjectVL.Systems
{
    public struct BudgetAdmission
    {
        public float NormalTarget;
        public int EffectiveTarget;
        public bool InEndSprint;
        public int Capacity;
        public int Deficit;
        public int SpawnCount;

        public static BudgetAdmission Calculate(
            ResolvedWavePlan plan,
            int spawnLeft,
            int alive)
        {
            float normalTarget = Math.Max(0f, plan.TargetOnScreen);
            int releaseChecks = (int)Math.Ceiling(
                (float)Math.Max(0, spawnLeft) / plan.BatchMax);
            float releaseEstimate = releaseChecks * plan.CheckInterval;
            bool inEndSprint = plan.SprintWindow > 0f
                && releaseEstimate <= plan.SprintWindow;
            int effectiveTarget = (int)Math.Ceiling(
                normalTarget * (inEndSprint ? plan.SprintMultiplier : 1f));
            int capacity = Math.Max(0, plan.MaxAlive - alive);
            int deficit = Math.Max(0, effectiveTarget - alive);
            int spawnCount = Math.Min(
                Math.Max(0, spawnLeft),
                Math.Min(plan.BatchMax, Math.Min(capacity, deficit)));

            return new BudgetAdmission
            {
                NormalTarget = normalTarget,
                EffectiveTarget = effectiveTarget,
                InEndSprint = inEndSprint,
                Capacity = capacity,
                Deficit = deficit,
                SpawnCount = spawnCount
            };
        }
    }
}
