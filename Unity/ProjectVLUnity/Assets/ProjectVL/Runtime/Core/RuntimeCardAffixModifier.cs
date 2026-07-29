namespace ProjectVL.Core
{
    public sealed class RuntimeCardAffixModifier
    {
        public string Stat { get; }
        public float Value { get; }
        public float Remaining { get; set; }

        public RuntimeCardAffixModifier(
            string stat,
            float value,
            float remaining)
        {
            Stat = stat;
            Value = value;
            Remaining = remaining;
        }
    }
}
