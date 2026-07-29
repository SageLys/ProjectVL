namespace ProjectVL.Core
{
    public sealed class CardCombatProfile
    {
        public int PierceCount { get; set; }
        public float PierceDamageRetention { get; set; } = 1f;
        public float RampPerPierce { get; set; }
        public int RicochetBounces { get; set; }
        public int ChainBounces { get; set; }
        public float ChainDamageRetention { get; set; } = 1f;
        public float ChainSearchRange { get; set; }
        public int ChainKillBounces { get; set; }
        public float ChainKillDamageRetention { get; set; }
        public float ChainKillSearchRange { get; set; }
        public float SlowRatio { get; set; }
        public float SlowDuration { get; set; }
        public int FreezeStacksToTrigger { get; set; }
        public float FreezeDuration { get; set; }
        public float VulnerableRatio { get; set; }
        public float VulnerableDuration { get; set; }
        public float FrozenHitVulnerableRatio { get; set; }
        public float FrozenHitVulnerableDuration { get; set; }
        public float FrozenKillSplashRadius { get; set; }
        public float FrozenKillSplashDamageRatio { get; set; }
        public float FrozenKillSlowRatio { get; set; }
        public float FrozenKillSlowDuration { get; set; }
        public float BeamInterval { get; set; }
        public float BeamWidth { get; set; }
        public float BeamDamageRatio { get; set; }
        public float ChainPulseInterval { get; set; }
        public int ChainPulseTargets { get; set; }
        public int ChainPulseBounces { get; set; }
        public float ChainPulseDamageRetention { get; set; }
        public float ChainPulseSearchRange { get; set; }
        public float FrostAuraRadiusRatio { get; set; }
        public float FrostAuraSlowRatio { get; set; }
        public float FrostAuraSlowDuration { get; set; }
        public float FrostNovaInterval { get; set; }
        public float FrostNovaRadius { get; set; }
        public float FrostNovaDuration { get; set; }
        public float DotDamageRatio { get; set; }
        public float DotDuration { get; set; }
        public float DotTickInterval { get; set; }
        public float SecondaryDotDamageRatio { get; set; }
        public float SecondaryDotDuration { get; set; }
        public float SecondaryDotTickInterval { get; set; }
        public float DotAreaRadius { get; set; }
        public float DotAreaVulnerableRatio { get; set; }
        public float DotAreaVulnerableDuration { get; set; }
        public float DotHitVulnerableRatio { get; set; }
        public float DotHitVulnerableDuration { get; set; }
        public int SplitCount { get; set; }
        public float SplitDamageRatio { get; set; }
        public int RecursiveSplitCount { get; set; }
        public float RecursiveSplitDamageRatio { get; set; }
        public float SplashRadius { get; set; }
        public float SplashDamageRatio { get; set; }
        public float SecondarySplashRadius { get; set; }
        public float SecondarySplashDamageRatio { get; set; }
        public float ProjectileDamageMultiplier { get; set; } = 1f;
        public float SplashFalloff { get; set; }
        public float ScorchAuraRadius { get; set; }
        public float ScorchAuraTickInterval { get; set; }
        public float ScorchAuraDamageRatio { get; set; }
        public float ScorchAuraSlowRatio { get; set; }
        public float ScorchAuraSlowDuration { get; set; }
        public float HitAreaKnockbackRadius { get; set; }
        public float HitAreaKnockbackDistance { get; set; }
        public float KnockbackDistance { get; set; }
        public float KnockbackCollisionDamageRatio { get; set; }
        public float ImpactBreachRadius { get; set; }
        public float ImpactBreachKnockback { get; set; }
        public float ImpactBreachStunDuration { get; set; }
        public float ImpactBreachCooldown { get; set; }
        public float ImpactPulseRadius { get; set; }
        public float ImpactPulseKnockback { get; set; }
        public float ImpactPulseInterval { get; set; }
        public float ImpactPulseStunDuration { get; set; }
        public float OnHitStunDuration { get; set; }
        public float OnHitStunCooldown { get; set; }
        public float AuraRadiusRatio { get; set; }
        public float AuraSlowRatio { get; set; }
        public float AuraVulnerableRatio { get; set; }
        public float AuraFocusPriorityWeight { get; set; } = 1f;
        public float AuraFocusHpThresholdRatio { get; set; }
        public float SanctumPulseInterval { get; set; }
        public float SanctumPulseRadius { get; set; }
        public float SanctumPulseVulnerableRatio { get; set; }
        public float SanctumPulseVulnerableDuration { get; set; }
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
        public float ThornsAuraRadius { get; set; }
        public float ThornsAuraTickInterval { get; set; }
        public float ThornsAuraDamageRatio { get; set; }
        public float ThornsAuraExecuteThresholdRatio { get; set; }
        public float BreachVulnerableRadius { get; set; }
        public float BreachVulnerableRatio { get; set; }
        public float BreachVulnerableDuration { get; set; }
        public float BreachExecuteRadius { get; set; }
        public float BreachExecuteThresholdRatio { get; set; }
        public float DecoyHp { get; set; }
        public float DecoyTauntRadius { get; set; }
        public float DecoyDistance { get; set; }
        public float DecoyExplodeDamageMultiplier { get; set; }
        public float DecoyExplodeKnockback { get; set; }
        public int DecoyCount { get; set; }
        public int DecoyRespawns { get; set; }
        public float SecondaryDecoyDistance { get; set; }
        public float DecoyAuraRadius { get; set; }
        public float DecoyAuraSlowRatio { get; set; }
        public float DecoyAuraSlowDuration { get; set; }
        public float DropRateMultiplier { get; set; } = 1f;
        public float DropLifetimeMultiplier { get; set; } = 1f;
        public float PickupRestore { get; set; }
        public float ExpiryConvertRatio { get; set; }
        public float XpMultiplier { get; set; } = 1f;
        public float MergePulseDamagePerStar { get; set; }
    }
}
