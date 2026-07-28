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
    }
}
