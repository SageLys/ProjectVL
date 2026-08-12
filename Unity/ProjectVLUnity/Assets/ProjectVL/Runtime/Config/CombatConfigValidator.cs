using System;

namespace ProjectVL.Config
{
    public static class CombatConfigValidator
    {
        public static void ValidateOrThrow(CombatConfig config)
        {
            if (config == null)
            {
                throw new ArgumentNullException(nameof(config));
            }

            RequirePositive(config.canvas.width, "canvas.width");
            RequirePositive(config.canvas.height, "canvas.height");
            RequirePositive(config.hp.max, "hp.max");
            RequirePositive(config.defaults.damage, "defaults.damage");
            RequirePositive(config.defaults.fireRate, "defaults.fireRate");
            RequirePositive(config.defaults.range, "defaults.range");
            RequirePositive(config.bullet.speed, "bullet.speed");
            RequirePositive(config.bullet.life, "bullet.life");
            RequirePositive(config.bullet.radius, "bullet.radius");
            RequirePositive(config.dtCap, "dtCap");

            if (config.controlBudget.maxControlledRatio < 0f
                || config.controlBudget.maxControlledRatio > 1f)
            {
                throw new InvalidOperationException(
                    "controlBudget.maxControlledRatio must be between 0 and 1.");
            }
        }

        private static void RequirePositive(float value, string path)
        {
            if (value <= 0f)
            {
                throw new InvalidOperationException($"{path} must be greater than zero.");
            }
        }
    }
}
