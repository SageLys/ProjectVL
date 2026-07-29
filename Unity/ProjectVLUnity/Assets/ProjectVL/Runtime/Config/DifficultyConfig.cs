using System;

namespace ProjectVL.Config
{
    [Serializable]
    public sealed class DifficultyConfig
    {
        public string defaultDifficulty = "standard";
        public DifficultyProfilesConfig profiles = new DifficultyProfilesConfig();

        public DifficultyProfileConfig Get(string id)
        {
            switch (id)
            {
                case "relaxed":
                    return profiles.relaxed;
                case "hard":
                    return profiles.hard;
                case "hell":
                    return profiles.hell;
                default:
                    return profiles.standard;
            }
        }
    }

    [Serializable]
    public sealed class DifficultyProfilesConfig
    {
        public DifficultyProfileConfig relaxed = new DifficultyProfileConfig();
        public DifficultyProfileConfig standard = new DifficultyProfileConfig();
        public DifficultyProfileConfig hard = new DifficultyProfileConfig();
        public DifficultyProfileConfig hell = new DifficultyProfileConfig();
    }

    [Serializable]
    public sealed class DifficultyProfileConfig
    {
        public string label;
        public string description;
        public DifficultyStatCurvesConfig enemy = new DifficultyStatCurvesConfig();
        public DifficultyStatCurvesConfig boss = new DifficultyStatCurvesConfig();
    }

    [Serializable]
    public sealed class DifficultyStatCurvesConfig
    {
        public DifficultyCurveConfig hp = new DifficultyCurveConfig();
        public DifficultyCurveConfig damage = new DifficultyCurveConfig();
        public DifficultyCurveConfig speed = new DifficultyCurveConfig();
    }

    [Serializable]
    public sealed class DifficultyCurveConfig
    {
        public float start;
        public float end;
        public float power;

        public bool IsDefined => start > 0f && end > 0f && power > 0f;
    }
}
