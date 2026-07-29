using ProjectVL.Config;

namespace ProjectVL.Core
{
    public sealed class LevelUpgradeChoice
    {
        public int Level { get; }
        public UpgradeOptionConfig[] Options { get; }

        public LevelUpgradeChoice(int level, UpgradeOptionConfig[] options)
        {
            Level = level;
            Options = options;
        }
    }
}
