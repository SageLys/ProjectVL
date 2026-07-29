using ProjectVL.Config;

namespace ProjectVL.Core
{
    public enum GodChoiceRole
    {
        Main,
        Sub,
        Focus
    }

    public sealed class GodChoice
    {
        public GodChoiceRole Role { get; }
        public int AfterWave { get; }
        public GodConfig[] Options { get; }

        public GodChoice(
            GodChoiceRole role,
            int afterWave,
            GodConfig[] options)
        {
            Role = role;
            AfterWave = afterWave;
            Options = options;
        }
    }
}
