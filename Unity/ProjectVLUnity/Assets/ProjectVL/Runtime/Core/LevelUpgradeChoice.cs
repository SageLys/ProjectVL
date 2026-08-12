namespace ProjectVL.Core
{
    public sealed class LevelUpgradeOption
    {
        public string Id { get; }
        public string Title { get; }
        public string Description { get; }
        public string God { get; }
        public string Rarity { get; }

        public LevelUpgradeOption(
            string id,
            string title,
            string description,
            string god,
            string rarity)
        {
            Id = id;
            Title = title;
            Description = description;
            God = god;
            Rarity = rarity;
        }
    }

    public sealed class LevelUpgradeChoice
    {
        public int Level { get; }
        public LevelUpgradeOption[] Options { get; }

        public LevelUpgradeChoice(int level, LevelUpgradeOption[] options)
        {
            Level = level;
            Options = options;
        }
    }
}
