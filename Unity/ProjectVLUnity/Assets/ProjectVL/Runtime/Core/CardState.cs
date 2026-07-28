using System;

namespace ProjectVL.Core
{
    public sealed class CardState
    {
        public int Id { get; }
        public string Type { get; }
        public int Star { get; internal set; }

        public CardState(int id, string type, int star)
        {
            if (id < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(id));
            }

            if (string.IsNullOrWhiteSpace(type))
            {
                throw new ArgumentException("Card type is required.", nameof(type));
            }

            Id = id;
            Type = type;
            Star = star;
        }
    }
}
