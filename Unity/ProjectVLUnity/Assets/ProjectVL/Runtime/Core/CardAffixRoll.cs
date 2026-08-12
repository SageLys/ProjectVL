namespace ProjectVL.Core
{
    public sealed class CardAffixRoll
    {
        public string Stat { get; }
        public float Value { get; }
        public float ConsumableDuration { get; }

        public CardAffixRoll(
            string stat,
            float value,
            float consumableDuration)
        {
            Stat = stat;
            Value = value;
            ConsumableDuration = consumableDuration;
        }

        public CardAffixRoll Clone()
        {
            return new CardAffixRoll(
                Stat,
                Value,
                ConsumableDuration);
        }
    }
}
