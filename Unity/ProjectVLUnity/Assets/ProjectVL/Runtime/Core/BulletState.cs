using System.Collections.Generic;

namespace ProjectVL.Core
{
    public sealed class BulletState
    {
        public int Id { get; }
        public Float2 Position { get; set; }
        public Float2 Velocity { get; }
        public float Radius { get; }
        public float LifeRemaining { get; set; }
        public float Damage { get; set; }
        public int PierceRemaining { get; set; }
        public float PierceDamageRetention { get; }
        public float RampPerPierce { get; }
        public int ChainBounces { get; }
        public float ChainDamageRetention { get; }
        public float ChainSearchRange { get; }
        public float SlowRatio { get; }
        public float SlowDuration { get; }
        public int FreezeStacksToTrigger { get; }
        public float FreezeDuration { get; }
        public float VulnerableRatio { get; }
        public float VulnerableDuration { get; }
        public float DotDamageRatio { get; }
        public float DotDuration { get; }
        public float DotTickInterval { get; }
        public int SplitCount { get; }
        public float SplitDamageRatio { get; }
        public float SplashRadius { get; }
        public float SplashDamageRatio { get; }
        public float KnockbackDistance { get; }
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
            ChainBounces = profile.ChainBounces;
            ChainDamageRetention = profile.ChainDamageRetention;
            ChainSearchRange = profile.ChainSearchRange;
            SlowRatio = profile.SlowRatio;
            SlowDuration = profile.SlowDuration;
            FreezeStacksToTrigger = profile.FreezeStacksToTrigger;
            FreezeDuration = profile.FreezeDuration;
            VulnerableRatio = profile.VulnerableRatio;
            VulnerableDuration = profile.VulnerableDuration;
            DotDamageRatio = profile.DotDamageRatio;
            DotDuration = profile.DotDuration;
            DotTickInterval = profile.DotTickInterval;
            SplitCount = profile.SplitCount;
            SplitDamageRatio = profile.SplitDamageRatio;
            SplashRadius = profile.SplashRadius;
            SplashDamageRatio = profile.SplashDamageRatio;
            KnockbackDistance = profile.KnockbackDistance;
        }
    }
}
