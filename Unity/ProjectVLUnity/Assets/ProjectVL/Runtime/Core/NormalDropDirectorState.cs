namespace ProjectVL.Core
{
    public enum NormalDropRole
    {
        Discovery,
        Build,
        Pivot
    }

    public sealed class CardTypeRunStats
    {
        public int OrdinaryShown { get; internal set; }
        public int TotalShown { get; internal set; }
        public int Collected { get; internal set; }
        public int MergeOperations { get; internal set; }
        public int HighestStarReached { get; internal set; }
        public int LastOrdinaryShownAt { get; internal set; }
    }
}
