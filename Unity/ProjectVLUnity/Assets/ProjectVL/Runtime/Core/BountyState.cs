using System.Collections.Generic;

namespace ProjectVL.Core
{
    public enum BountySide
    {
        Top,
        Right,
        Bottom,
        Left
    }

    public enum BountyEncounterStatus
    {
        Spawning,
        Active,
        Completed,
        Failed
    }

    public sealed class BountyOfferState
    {
        public int Id { get; }
        public string RewardCardType { get; }
        public int RewardCardStar { get; }
        public int RewardCardCount { get; }
        public int WildcardStar { get; }
        public int WildcardCount { get; }
        public BountySide Side { get; }
        public Float2 Position { get; }
        public float Remaining { get; set; }
        public float MaxRemaining { get; }
        public bool Guaranteed { get; }
        public float CreatedAt { get; }

        public BountyOfferState(
            int id,
            string rewardCardType,
            int rewardCardStar,
            int rewardCardCount,
            int wildcardStar,
            int wildcardCount,
            BountySide side,
            Float2 position,
            float remaining,
            bool guaranteed,
            float createdAt)
        {
            Id = id;
            RewardCardType = rewardCardType;
            RewardCardStar = rewardCardStar;
            RewardCardCount = rewardCardCount;
            WildcardStar = wildcardStar;
            WildcardCount = wildcardCount;
            Side = side;
            Position = position;
            Remaining = remaining;
            MaxRemaining = remaining;
            Guaranteed = guaranteed;
            CreatedAt = createdAt;
        }
    }

    public sealed class BountyEncounterState
    {
        public int Id { get; }
        public int OfferId { get; }
        public string RewardCardType { get; }
        public int RewardCardStar { get; }
        public int RewardCardCount { get; }
        public int WildcardStar { get; }
        public int WildcardCount { get; }
        public BountySide Side { get; }
        public BountyEncounterStatus Status { get; set; }
        public List<int> MemberIds { get; } = new List<int>();
        public int PendingSpawnCount { get; set; }
        public float SpawnTimer { get; set; }
        public bool Guaranteed { get; }
        public float AcceptedAt { get; }
        public Float2 LastKillPosition { get; set; }

        public BountyEncounterState(
            int id,
            BountyOfferState offer,
            int pendingSpawnCount,
            float acceptedAt)
        {
            Id = id;
            OfferId = offer.Id;
            RewardCardType = offer.RewardCardType;
            RewardCardStar = offer.RewardCardStar;
            RewardCardCount = offer.RewardCardCount;
            WildcardStar = offer.WildcardStar;
            WildcardCount = offer.WildcardCount;
            Side = offer.Side;
            Status = BountyEncounterStatus.Spawning;
            PendingSpawnCount = pendingSpawnCount;
            Guaranteed = offer.Guaranteed;
            AcceptedAt = acceptedAt;
            LastKillPosition = offer.Position;
        }
    }
}
