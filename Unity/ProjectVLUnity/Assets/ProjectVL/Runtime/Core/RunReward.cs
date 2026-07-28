namespace ProjectVL.Core
{
    public sealed class RunReward
    {
        public RewardKind Kind { get; }
        public int Star { get; }
        public int Count { get; }
        public string TypePolicy { get; }

        public RunReward(
            RewardKind kind,
            int star,
            int count,
            string typePolicy = "")
        {
            Kind = kind;
            Star = star;
            Count = count;
            TypePolicy = typePolicy ?? "";
        }
    }
}
