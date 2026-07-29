using System.Collections.Generic;
using ProjectVL.Config;

namespace ProjectVL.Core
{
    public sealed class WaveRewardChoice
    {
        public int AfterWave { get; }
        public IReadOnlyList<WaveRewardEffectConfig> Options { get; }
        public IReadOnlyList<string> CappedOptionIds { get; }

        public WaveRewardChoice(
            int afterWave,
            IReadOnlyList<WaveRewardEffectConfig> options,
            IReadOnlyList<string> cappedOptionIds)
        {
            AfterWave = afterWave;
            Options = options;
            CappedOptionIds = cappedOptionIds;
        }

        public bool IsCapped(string optionId)
        {
            for (int i = 0; i < CappedOptionIds.Count; i++)
            {
                if (CappedOptionIds[i] == optionId)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
