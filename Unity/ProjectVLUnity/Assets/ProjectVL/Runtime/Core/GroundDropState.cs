namespace ProjectVL.Core
{
    public sealed class GroundDropState
    {
        public int Id { get; }
        public Float2 Position { get; }
        public string CardType { get; }
        public int Star { get; }
        public float LifeRemaining { get; set; }
        public float MaxLife { get; }
        public string Source { get; }
        public bool Secure { get; }
        public int? BountyEncounterId { get; }
        public int? ValidationRewardWave { get; }

        public GroundDropState(
            int id,
            Float2 position,
            string cardType,
            int star,
            float lifetime,
            string source = "bonus",
            bool secure = false,
            int? bountyEncounterId = null,
            int? validationRewardWave = null)
        {
            Id = id;
            Position = position;
            CardType = cardType;
            Star = star;
            LifeRemaining = lifetime;
            MaxLife = lifetime;
            Source = source ?? "bonus";
            Secure = secure;
            BountyEncounterId = bountyEncounterId;
            ValidationRewardWave = validationRewardWave;
        }
    }
}
