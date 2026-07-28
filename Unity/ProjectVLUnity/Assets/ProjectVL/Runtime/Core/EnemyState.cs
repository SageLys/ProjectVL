namespace ProjectVL.Core
{
    public sealed class EnemyState
    {
        public int Id { get; }
        public EnemyKind Kind { get; }
        public Float2 Position { get; set; }
        public float Hp { get; set; }
        public float MaxHp { get; }
        public float Speed { get; }
        public float Radius { get; }
        public float Damage { get; }

        public EnemyState(
            int id,
            EnemyKind kind,
            Float2 position,
            float hp,
            float speed,
            float radius,
            float damage)
        {
            Id = id;
            Kind = kind;
            Position = position;
            Hp = hp;
            MaxHp = hp;
            Speed = speed;
            Radius = radius;
            Damage = damage;
        }
    }
}
