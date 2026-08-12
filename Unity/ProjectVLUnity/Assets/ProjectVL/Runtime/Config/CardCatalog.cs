using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public sealed class CardCatalog
    {
        private static CardCatalog _default;
        private readonly CardsConfig _config;
        private readonly Dictionary<string, CardDefinitionConfig> _byId =
            new Dictionary<string, CardDefinitionConfig>(
                StringComparer.Ordinal);
        private readonly string[] _playableIds;

        public CardCatalog(CardsConfig config)
        {
            _config = config
                ?? throw new ArgumentNullException(nameof(config));

            var playable = new List<string>();
            foreach (CardDefinitionConfig card in _config.cards)
            {
                if (card == null || string.IsNullOrWhiteSpace(card.id))
                {
                    continue;
                }

                _byId.Add(card.id, card);
                if (!card.recipeOnly)
                {
                    playable.Add(card.id);
                }
            }

            _playableIds = playable.ToArray();
        }

        public IReadOnlyList<CardDefinitionConfig> Cards =>
            _config.cards;

        public static CardCatalog Default
        {
            get
            {
                if (_default == null)
                {
                    _default = new CardCatalog(
                        GameConfigLoader.LoadCards());
                }

                return _default;
            }
        }

        public IReadOnlyList<string> PlayableIds => _playableIds;

        public CardDefinitionConfig Find(string cardId)
        {
            return !string.IsNullOrEmpty(cardId)
                && _byId.TryGetValue(
                    cardId,
                    out CardDefinitionConfig card)
                ? card
                : null;
        }

        public bool IsPlayable(string cardId)
        {
            CardDefinitionConfig card = Find(cardId);
            return card != null && !card.recipeOnly;
        }

        public bool SupportsConsumable(string cardId)
        {
            return Find(cardId)?.consumable == true;
        }

        public string DisplayName(string cardId)
        {
            CardDefinitionConfig card = Find(cardId);
            return string.IsNullOrWhiteSpace(card?.displayName)
                ? cardId
                : card.displayName;
        }

        public string[] EvolutionOptions(
            string cardId,
            int checkpoint)
        {
            CardDefinitionConfig card = Find(cardId);
            if (card == null || card.recipeOnly)
            {
                return Array.Empty<string>();
            }

            return checkpoint == 3
                ? card.evolution3 ?? Array.Empty<string>()
                : checkpoint == 5
                    ? card.evolution5 ?? Array.Empty<string>()
                    : Array.Empty<string>();
        }
    }
}
