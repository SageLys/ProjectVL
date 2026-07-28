using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class CombatConfig
    {
        public CanvasConfig canvas = new CanvasConfig();
        public TurretConfig turret = new TurretConfig();
        public HpConfig hp = new HpConfig();
        public CombatDefaults defaults = new CombatDefaults();
        public float attackPreviewMargin;
        public BulletConfig bullet = new BulletConfig();
        public WeaponFusionConfig weaponFusion = new WeaponFusionConfig();
        public float breakthroughDist;
        public float dangerZoneWidth;
        public float dtCap;
        public KnockbackFatigueConfig knockbackFatigue = new KnockbackFatigueConfig();
        public CrowdControlImmunityConfig ccImmunity = new CrowdControlImmunityConfig();
        public ControlCeilingConfig controlCeiling = new ControlCeilingConfig();
        public ControlBudgetConfig controlBudget = new ControlBudgetConfig();
        public VfxConfig vfx = new VfxConfig();
    }

    [Serializable]
    public sealed class CanvasConfig
    {
        public float width;
        public float height;
    }

    [Serializable]
    public sealed class TurretConfig
    {
        public float x;
        public float y;
    }

    [Serializable]
    public sealed class HpConfig
    {
        public float max;
    }

    [Serializable]
    public sealed class CombatDefaults
    {
        public float damage;
        public float fireRate;
        public float range;
    }

    [Serializable]
    public sealed class BulletConfig
    {
        public float speed;
        public float life;
        public float radius;
        public float spread;
        public float muzzleOffset;
    }

    [Serializable]
    public sealed class WeaponFusionConfig
    {
        public float damping;
        public float radiusMul;
    }

    [Serializable]
    public sealed class KnockbackFatigueConfig
    {
        public float decayFactor;
        public float windowSeconds;
        public float minMultiplier;
    }

    [Serializable]
    public sealed class CrowdControlImmunityConfig
    {
        public float afterFreezeSeconds;
        public float afterStunSeconds;
    }

    [Serializable]
    public sealed class ControlCeilingConfig
    {
        public float freezeSeconds;
        public float stunSeconds;
        public float knockbackDistance;
    }

    [Serializable]
    public sealed class ControlBudgetConfig
    {
        public float maxControlledRatio;
        public int minFreeAdvancers;
    }

    [Serializable]
    public sealed class VfxConfig
    {
        public int shootParticles;
        public int killParticles;
        public int breakthroughParticles;
    }
}
