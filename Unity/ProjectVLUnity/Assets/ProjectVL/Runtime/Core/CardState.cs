using System;
using System.Collections.Generic;

namespace ProjectVL.Core
{
    public sealed class CardState
    {
        public int Id { get; }
        public string Type { get; }
        public int Star { get; internal set; }
        public bool Provisional { get; internal set; }
        public List<string> EvolutionPath { get; } =
            new List<string>();
        public List<CardAffixRoll> Affixes { get; } =
            new List<CardAffixRoll>();

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
