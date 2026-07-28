namespace ProjectVL.Core
{
    public sealed class CardCombatProfile
    {
        public int PierceCount { get; set; }
        public float PierceDamageRetention { get; set; } = 1f;
        public float RampPerPierce { get; set; }
        public int ChainBounces { get; set; }
        public float ChainDamageRetention { get; set; } = 1f;
        public float ChainSearchRange { get; set; }
        public float SlowRatio { get; set; }
        public float SlowDuration { get; set; }
        public int FreezeStacksToTrigger { get; set; }
        public float FreezeDuration { get; set; }
        public float VulnerableRatio { get; set; }
        public float VulnerableDuration { get; set; }
        public float DotDamageRatio { get; set; }
        public float DotDuration { get; set; }
        public float DotTickInterval { get; set; }
        public int SplitCount { get; set; }
        public float SplitDamageRatio { get; set; }
        public float SplashRadius { get; set; }
        public float SplashDamageRatio { get; set; }
        public float KnockbackDistance { get; set; }
        public float AuraRadiusRatio { get; set; }
        public float AuraSlowRatio { get; set; }
        public float AuraVulnerableRatio { get; set; }
        public float WaveStartFireRateMultiplier { get; set; } = 1f;
        public float WaveStartFireRateDuration { get; set; }
        public int ShieldHits { get; set; }
        public float ShieldRegenSeconds { get; set; }
        public float ShieldBreakDamage { get; set; }
        public float ShieldBreakKnockback { get; set; }
        public float BreachReductionRatio { get; set; }
        public float ThornsRatio { get; set; }
        public float BreachBurstDamageMultiplier { get; set; }
        public float BreachBurstRadius { get; set; }
        public float BreachKnockback { get; set; }
        public float BreachSlowRatio { get; set; }
        public float BreachSlowDuration { get; set; }
        public float DecoyHp { get; set; }
        public float DecoyTauntRadius { get; set; }
        public float DecoyDistance { get; set; }
        public float DecoyExplodeDamageMultiplier { get; set; }
        public float DecoyExplodeKnockback { get; set; }
        public float DropRateMultiplier { get; set; } = 1f;
        public float DropLifetimeMultiplier { get; set; } = 1f;
        public float PickupRestore { get; set; }
    }
}
