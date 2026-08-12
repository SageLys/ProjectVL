using System;

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
        public float XpReward { get; }
        public string Label { get; }
        public string Color { get; }
        public int Sides { get; }
        public float KnockbackResist { get; }
        public float CcResist { get; }
        public EnemySpawnKind SpawnKind { get; internal set; }
        public int? BountyEncounterId { get; internal set; }
        public string BountyRewardType { get; internal set; }
        public BossPhase BossPhase { get; set; }
        public int OrbitDirection { get; }
        public float ContactTickRemaining { get; set; }
        public float ContactAngleRadians { get; set; }
        public RunReward Reward { get; }
        public float SlowRatio { get; set; }
        public float SlowRemaining { get; set; }
        public int FreezeStacks { get; set; }
        public float FrozenRemaining
        {
            get => _frozenRemaining;
            set => _frozenRemaining = value > _frozenRemaining
                ? Math.Max(_frozenRemaining, ScaleControlDuration(value))
                : Math.Max(0f, value);
        }
        public float VulnerableRatio { get; set; }
        public float VulnerableRemaining { get; set; }
        public float DotDamagePerTick { get; set; }
        public float DotTickInterval { get; set; }
        public float DotTickRemaining { get; set; }
        public float DotRemaining { get; set; }
        public float SecondaryDotDamagePerTick { get; set; }
        public float SecondaryDotTickInterval { get; set; }
        public float SecondaryDotTickRemaining { get; set; }
        public float SecondaryDotRemaining { get; set; }
        public float StunnedRemaining
        {
            get => _stunnedRemaining;
            set => _stunnedRemaining = value > _stunnedRemaining
                ? Math.Max(_stunnedRemaining, ScaleControlDuration(value))
                : Math.Max(0f, value);
        }
        public float FocusPriorityWeight { get; set; } = 1f;
        public float FocusPriorityRemaining { get; set; }
        public float? KnockbackResistOverride { get; }
        public float? CcResistOverride { get; }

        private float _frozenRemaining;
        private float _stunnedRemaining;

        public EnemyState(
            int id,
            EnemyKind kind,
            Float2 position,
            float hp,
            float speed,
            float radius,
            float damage,
            EnemySpawnKind spawnKind = EnemySpawnKind.Regular,
            float contactDps = 0f,
            RunReward reward = null,
            float xpReward = 1f,
            string label = null,
            string color = null,
            int sides = 4,
            float knockbackResist = 0f,
            float ccResist = 0f,
            float? knockbackResistOverride = null,
            float? ccResistOverride = null)
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
            Reward = reward;
            XpReward = xpReward;
            Label = label ?? kind.ToString();
            Color = color ?? "#8793a3";
            Sides = sides;
            KnockbackResist = knockbackResist;
            CcResist = ccResist;
            KnockbackResistOverride = knockbackResistOverride;
            CcResistOverride = ccResistOverride;
            BossPhase = BossPhase.Approach;
            OrbitDirection = id % 2 == 0 ? 1 : -1;
        }

        public bool ApplyKnockback(
            Float2 direction,
            float distance,
            float distanceCeiling)
        {
            if (FrozenRemaining > 0f)
            {
                return false;
            }

            float resistance = Clamp01(
                KnockbackResistOverride ?? KnockbackResist);
            float effectiveDistance =
                Math.Min(Math.Max(0f, distance), distanceCeiling)
                * (1f - resistance);
            Float2 normalized = direction.Normalized();
            if (effectiveDistance <= 0f || normalized.Length <= 0f)
            {
                return false;
            }

            Position += normalized * effectiveDistance;
            return true;
        }

        private float ScaleControlDuration(float duration)
        {
            float resistance = Clamp01(CcResistOverride ?? CcResist);
            return Math.Max(0f, duration) * (1f - resistance);
        }

        private static float Clamp01(float value)
        {
            return Math.Max(0f, Math.Min(1f, value));
        }
    }
}
