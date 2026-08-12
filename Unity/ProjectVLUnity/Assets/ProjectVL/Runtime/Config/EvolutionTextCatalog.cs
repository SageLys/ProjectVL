using System;
using System.Collections.Generic;

namespace ProjectVL.Config
{
    public sealed class EvolutionTextCatalog
    {
        private static EvolutionTextCatalog _default;
        private readonly Dictionary<string, EvolutionOptionTextConfig>
            _options =
                new Dictionary<string, EvolutionOptionTextConfig>(
                    StringComparer.Ordinal);

        public EvolutionTextCatalog(EvolutionTextConfig config)
        {
            if (config?.cards == null)
            {
                throw new ArgumentNullException(nameof(config));
            }

            foreach (EvolutionCardTextConfig card in config.cards)
            {
                foreach (EvolutionOptionTextConfig option
                    in card?.options
                        ?? Array.Empty<EvolutionOptionTextConfig>())
                {
                    if (option == null
                        || string.IsNullOrWhiteSpace(option.id)
                        || string.IsNullOrWhiteSpace(option.name)
                        || string.IsNullOrWhiteSpace(option.summary)
                        || !_options.TryAdd(option.id, option))
                    {
                        throw new InvalidOperationException(
                            $"Invalid evolution text for {option?.id}.");
                    }
                }
            }
        }

        public static EvolutionTextCatalog Default =>
            _default ?? (_default = new EvolutionTextCatalog(
                GameConfigLoader.LoadEvolutionText()));

        public EvolutionOptionTextConfig Find(string optionId)
        {
            return !string.IsNullOrEmpty(optionId)
                && _options.TryGetValue(
                    optionId,
                    out EvolutionOptionTextConfig option)
                ? option
                : null;
        }
    }
}
