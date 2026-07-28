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
        public float ContactDps { get; }
        public EnemySpawnKind SpawnKind { get; }
        public BossPhase BossPhase { get; set; }
        public int OrbitDirection { get; }
        public float ContactTickRemaining { get; set; }
        public float ContactAngleRadians { get; set; }

        public EnemyState(
            int id,
            EnemyKind kind,
            Float2 position,
            float hp,
            float speed,
            float radius,
            float damage,
            EnemySpawnKind spawnKind = EnemySpawnKind.Regular,
            float contactDps = 0f)
        {
            Id = id;
            Kind = kind;
            Position = position;
            Hp = hp;
            MaxHp = hp;
            Speed = speed;
            Radius = radius;
            Damage = damage;
            SpawnKind = spawnKind;
            ContactDps = contactDps;
            BossPhase = BossPhase.Approach;
            OrbitDirection = id % 2 == 0 ? 1 : -1;
        }
    }
}
