using System;

namespace ProjectVL.Core
{
    public sealed class EvolutionChoice
    {
        public int CardId { get; }
        public string CardType { get; }
        public int CheckpointStar { get; }
        public string[] Options { get; }

        public EvolutionChoice(
            int cardId,
            string cardType,
            int checkpointStar,
            string[] options)
        {
            CardId = cardId;
            CardType = cardType
                ?? throw new ArgumentNullException(nameof(cardType));
            CheckpointStar = checkpointStar;
            Options = options
                ?? throw new ArgumentNullException(nameof(options));
        }
    }
}
