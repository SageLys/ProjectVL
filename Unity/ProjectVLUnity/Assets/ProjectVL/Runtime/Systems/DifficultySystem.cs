using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class DifficultySystem
    {
        private readonly DifficultyConfig _config;
        private readonly int _totalWaves;

        public DifficultySystem(DifficultyConfig config, int totalWaves)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _totalWaves = Math.Max(1, totalWaves);
        }

        public DifficultyMultipliers Get(
            DifficultyId difficulty,
            EnemyKind kind,
            int wave)
        {
            DifficultyProfileConfig profile =
                _config.Get(ToConfigId(difficulty));
            DifficultyStatCurvesConfig regular = profile.enemy;
            DifficultyStatCurvesConfig boss = profile.boss;
            bool isBoss = kind == EnemyKind.Boss;
            return new DifficultyMultipliers(
                Evaluate(Choose(isBoss, boss.hp, regular.hp), wave),
                Evaluate(Choose(isBoss, boss.damage, regular.damage), wave),
                Evaluate(Choose(isBoss, boss.speed, regular.speed), wave));
        }

        public static string ToConfigId(DifficultyId difficulty)
        {
            switch (difficulty)
            {
                case DifficultyId.Relaxed:
                    return "relaxed";
                case DifficultyId.Hard:
                    return "hard";
                case DifficultyId.Hell:
                    return "hell";
                default:
                    return "standard";
            }
        }

        private static DifficultyCurveConfig Choose(
            bool useOverride,
            DifficultyCurveConfig candidate,
            DifficultyCurveConfig fallback)
        {
            return useOverride && candidate != null && candidate.IsDefined
                ? candidate
                : fallback;
        }

        private float Evaluate(DifficultyCurveConfig curve, int wave)
        {
            if (curve == null || !curve.IsDefined)
            {
                return 1f;
            }

            float progress = _totalWaves <= 1
                ? 1f
                : Math.Max(
                    0f,
                    Math.Min(1f, (wave - 1f) / (_totalWaves - 1f)));
            return curve.start
                + (curve.end - curve.start)
                * (float)Math.Pow(progress, curve.power);
        }
    }

    public readonly struct DifficultyMultipliers
    {
        public float Hp { get; }
        public float Damage { get; }
        public float Speed { get; }

        public DifficultyMultipliers(float hp, float damage, float speed)
        {
            Hp = hp;
            Damage = damage;
            Speed = speed;
        }
    }
}
