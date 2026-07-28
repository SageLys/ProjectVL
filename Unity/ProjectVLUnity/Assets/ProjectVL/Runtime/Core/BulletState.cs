using System.Collections.Generic;

namespace ProjectVL.Core
{
    public sealed class BulletState
    {
        public int Id { get; }
        public Float2 Position { get; set; }
        public Float2 Velocity { get; set; }
        public float Radius { get; }
        public float LifeRemaining { get; set; }
        public float Damage { get; set; }
        public int PierceRemaining { get; set; }
        public float PierceDamageRetention { get; }
        public float RampPerPierce { get; }
        public int RicochetRemaining { get; set; }
        public int ChainBounces { get; }
        public float ChainDamageRetention { get; }
        public float ChainSearchRange { get; }
        public int ChainKillBounces { get; }
        public float ChainKillDamageRetention { get; }
        public float ChainKillSearchRange { get; }
        public float SlowRatio { get; }
        public float SlowDuration { get; }
        public int FreezeStacksToTrigger { get; }
        public float FreezeDuration { get; }
        public float VulnerableRatio { get; }
        public float VulnerableDuration { get; }
        public float FrozenHitVulnerableRatio { get; }
        public float FrozenHitVulnerableDuration { get; }
        public float DotDamageRatio { get; }
        public float DotDuration { get; }
        public float DotTickInterval { get; }
        public float SecondaryDotDamageRatio { get; }
        public float SecondaryDotDuration { get; }
        public float SecondaryDotTickInterval { get; }
        public float DotAreaRadius { get; }
        public float DotAreaVulnerableRatio { get; }
        public float DotAreaVulnerableDuration { get; }
        public float DotHitVulnerableRatio { get; }
        public float DotHitVulnerableDuration { get; }
        public int SplitCount { get; }
        public float SplitDamageRatio { get; }
        public int RecursiveSplitCount { get; }
        public float RecursiveSplitDamageRatio { get; }
        public float SplashRadius { get; }
        public float SplashDamageRatio { get; }
        public float SecondarySplashRadius { get; }
        public float SecondarySplashDamageRatio { get; }
        public float HitAreaKnockbackRadius { get; }
        public float HitAreaKnockbackDistance { get; }
        public float KnockbackDistance { get; }
        public float KnockbackCollisionDamageRatio { get; }
        public float OnHitStunDuration { get; }
        public float OnHitStunCooldown { get; }
        public HashSet<int> HitEnemyIds { get; } = new HashSet<int>();

        public BulletState(
            int id,
            Float2 position,
            Float2 velocity,
            float radius,
            float lifeRemaining,
            float damage,
            CardCombatProfile profile = null)
        {
            Id = id;
            Position = position;
            Velocity = velocity;
            Radius = radius;
            LifeRemaining = lifeRemaining;
            Damage = damage;
            profile = profile ?? new CardCombatProfile();
            PierceRemaining = profile.PierceCount;
            PierceDamageRetention = profile.PierceDamageRetention;
            RampPerPierce = profile.RampPerPierce;
            RicochetRemaining = profile.RicochetBounces;
            ChainBounces = profile.ChainBounces;
            ChainDamageRetention = profile.ChainDamageRetention;
            ChainSearchRange = profile.ChainSearchRange;
            ChainKillBounces = profile.ChainKillBounces;
            ChainKillDamageRetention =
                profile.ChainKillDamageRetention;
            ChainKillSearchRange = profile.ChainKillSearchRange;
            SlowRatio = profile.SlowRatio;
            SlowDuration = profile.SlowDuration;
            FreezeStacksToTrigger = profile.FreezeStacksToTrigger;
            FreezeDuration = profile.FreezeDuration;
            VulnerableRatio = profile.VulnerableRatio;
            VulnerableDuration = profile.VulnerableDuration;
            FrozenHitVulnerableRatio =
                profile.FrozenHitVulnerableRatio;
            FrozenHitVulnerableDuration =
                profile.FrozenHitVulnerableDuration;
            DotDamageRatio = profile.DotDamageRatio;
            DotDuration = profile.DotDuration;
            DotTickInterval = profile.DotTickInterval;
            SecondaryDotDamageRatio =
                profile.SecondaryDotDamageRatio;
            SecondaryDotDuration = profile.SecondaryDotDuration;
            SecondaryDotTickInterval =
                profile.SecondaryDotTickInterval;
            DotAreaRadius = profile.DotAreaRadius;
            DotAreaVulnerableRatio =
                profile.DotAreaVulnerableRatio;
            DotAreaVulnerableDuration =
                profile.DotAreaVulnerableDuration;
            DotHitVulnerableRatio =
                profile.DotHitVulnerableRatio;
            DotHitVulnerableDuration =
                profile.DotHitVulnerableDuration;
            SplitCount = profile.SplitCount;
            SplitDamageRatio = profile.SplitDamageRatio;
            RecursiveSplitCount = profile.RecursiveSplitCount;
            RecursiveSplitDamageRatio =
                profile.RecursiveSplitDamageRatio;
            SplashRadius = profile.SplashRadius;
            SplashDamageRatio = profile.SplashDamageRatio;
            SecondarySplashRadius = profile.SecondarySplashRadius;
            SecondarySplashDamageRatio =
                profile.SecondarySplashDamageRatio;
            HitAreaKnockbackRadius =
                profile.HitAreaKnockbackRadius;
            HitAreaKnockbackDistance =
                profile.HitAreaKnockbackDistance;
            KnockbackDistance = profile.KnockbackDistance;
            KnockbackCollisionDamageRatio =
                profile.KnockbackCollisionDamageRatio;
            OnHitStunDuration = profile.OnHitStunDuration;
            OnHitStunCooldown = profile.OnHitStunCooldown;
        }
    }
}
