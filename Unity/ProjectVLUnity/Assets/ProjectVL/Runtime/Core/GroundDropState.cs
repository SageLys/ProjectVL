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

        public GroundDropState(
            int id,
            Float2 position,
            string cardType,
            int star,
            float lifetime)
        {
            Id = id;
            Position = position;
            CardType = cardType;
            Star = star;
            LifeRemaining = lifetime;
            MaxLife = lifetime;
        }
    }
}
