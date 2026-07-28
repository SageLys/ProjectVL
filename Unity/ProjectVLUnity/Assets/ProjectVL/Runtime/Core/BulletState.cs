namespace ProjectVL.Core
{
    public sealed class BulletState
    {
        public int Id { get; }
        public Float2 Position { get; set; }
        public Float2 Velocity { get; }
        public float Radius { get; }
        public float LifeRemaining { get; set; }
        public float Damage { get; }

        public BulletState(
            int id,
            Float2 position,
            Float2 velocity,
            float radius,
            float lifeRemaining,
            float damage)
        {
            Id = id;
            Position = position;
            Velocity = velocity;
            Radius = radius;
            LifeRemaining = lifeRemaining;
            Damage = damage;
        }
    }
}
