using System;
using ProjectVL.Core;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class EnemiesConfig
    {
        public EnemyDefaults defaults = new EnemyDefaults();
        public EnemyTypes types = new EnemyTypes();

        public EnemyTypeConfig Get(EnemyKind kind)
        {
            switch (kind)
            {
                case EnemyKind.Normal:
                    return types.normal;
                case EnemyKind.Fast:
                    return types.fast;
                case EnemyKind.Tank:
                    return types.tank;
                case EnemyKind.Boss:
                    return types.boss;
                default:
                    throw new ArgumentOutOfRangeException(nameof(kind));
            }
        }
    }

    [Serializable]
    public sealed class EnemyDefaults
    {
        public float enemySpeed = 1f;
    }

    [Serializable]
    public sealed class EnemyTypes
    {
        public EnemyTypeConfig normal = new EnemyTypeConfig();
        public EnemyTypeConfig fast = new EnemyTypeConfig();
        public EnemyTypeConfig tank = new EnemyTypeConfig();
        public EnemyTypeConfig boss = new EnemyTypeConfig();
    }

    [Serializable]
    public sealed class EnemyTypeConfig
    {
        public string label;
        public float hpBase;
        public float hpPerWave;
        public float speedBase;
        public float speedPerWave;
        public float r;
        public string color;
        public float damage;
        public int xp;
        public int sides;
    }
}
