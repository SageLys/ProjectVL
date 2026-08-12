using System.Collections.Generic;

namespace ProjectVL.Core
{
    public sealed class RunSummary
    {
        public bool Won { get; }
        public DifficultyId Difficulty { get; }
        public int WaveReached { get; }
        public int ClearedWaves { get; }
        public int Kills { get; }
        public int Level { get; }
        public float DurationSeconds { get; }
        public float Hp { get; }
        public float MaxHp { get; }
        public string MainGod { get; }
        public IReadOnlyList<string> SubGods { get; }
        public string FocusGod { get; }
        public int RelicKinds { get; }
        public int RelicStacks { get; }
        public RelicRaritySummary RelicRarity { get; }
        public int Merges { get; }
        public IReadOnlyList<string> CompletedRecipes { get; }
        public int BountiesOffered { get; }
        public int BountiesAccepted { get; }
        public int BountiesCompleted { get; }
        public int RewardsCollected { get; }
        public int WaveGrowthChoices { get; }
        public float RunDamageAdd { get; }
        public float RunFireRateAdd { get; }
        public float RunMaxHpAdd { get; }
        public float RunRangeAdd { get; }
        public float XpGainBonus { get; }
        public CardSummary HighestCard { get; }
        public RunScore Score { get; }
        public int RewardActivations { get; }

        public RunSummary(
            bool won,
            DifficultyId difficulty,
            int waveReached,
            int clearedWaves,
            int kills,
            int level,
            float durationSeconds,
            float hp,
            float maxHp,
            string mainGod,
            IReadOnlyList<string> subGods,
            string focusGod,
            int relicKinds,
            int relicStacks,
            RelicRaritySummary relicRarity,
            int merges,
            IReadOnlyList<string> completedRecipes,
            int bountiesOffered,
            int bountiesAccepted,
            int bountiesCompleted,
            int rewardsCollected,
            int waveGrowthChoices,
            float runDamageAdd,
            float runFireRateAdd,
            float runMaxHpAdd,
            float runRangeAdd,
            float xpGainBonus,
            CardSummary highestCard,
            RunScore score,
            int rewardActivations = 0)
        {
            Won = won;
            Difficulty = difficulty;
            WaveReached = waveReached;
            ClearedWaves = clearedWaves;
            Kills = kills;
            Level = level;
            DurationSeconds = durationSeconds;
            Hp = hp;
            MaxHp = maxHp;
            MainGod = mainGod;
            SubGods = subGods;
            FocusGod = focusGod;
            RelicKinds = relicKinds;
            RelicStacks = relicStacks;
            RelicRarity = relicRarity;
            Merges = merges;
            CompletedRecipes = completedRecipes;
            BountiesOffered = bountiesOffered;
            BountiesAccepted = bountiesAccepted;
            BountiesCompleted = bountiesCompleted;
            RewardsCollected = rewardsCollected;
            WaveGrowthChoices = waveGrowthChoices;
            RunDamageAdd = runDamageAdd;
            RunFireRateAdd = runFireRateAdd;
            RunMaxHpAdd = runMaxHpAdd;
            RunRangeAdd = runRangeAdd;
            XpGainBonus = xpGainBonus;
            HighestCard = highestCard;
            Score = score;
            RewardActivations = rewardActivations;
        }
    }

    public sealed class RunScore
    {
        public int Win { get; }
        public int Waves { get; }
        public int Kills { get; }
        public int Hp { get; }
        public int Build { get; }
        public int Wildcards { get; }
        public int Total =>
            Win + Waves + Kills + Hp + Build + Wildcards;

        public RunScore(
            int win,
            int waves,
            int kills,
            int hp,
            int build,
            int wildcards)
        {
            Win = win;
            Waves = waves;
            Kills = kills;
            Hp = hp;
            Build = build;
            Wildcards = wildcards;
        }
    }

    public sealed class RelicRaritySummary
    {
        public int Common { get; }
        public int Rare { get; }
        public int Epic { get; }

        public RelicRaritySummary(int common, int rare, int epic)
        {
            Common = common;
            Rare = rare;
            Epic = epic;
        }
    }

    public sealed class CardSummary
    {
        public string Type { get; }
        public int Star { get; }

        public CardSummary(string type, int star)
        {
            Type = type;
            Star = star;
        }
    }
}
