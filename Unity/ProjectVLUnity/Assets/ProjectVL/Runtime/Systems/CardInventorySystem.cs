using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CardInventorySystem
    {
        private static readonly string[] RewardCardTypes =
        {
            "pierce",
            "chainLightning",
            "frost",
            "decoy",
            "scorch",
            "harvest",
            "aegis",
            "splitBlast",
            "impact",
            "sanctum",
            "thorns"
        };

        private readonly EconomyConfig _config;
        private int _nextRewardType;

        public CardInventorySystem(EconomyConfig config)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        public bool GrantReward(GameState state, RunReward reward)
        {
            if (state == null || reward == null)
            {
                return false;
            }

            if (reward.Kind == RewardKind.Wildcard)
            {
                int star = ClampStar(reward.Star);
                if (star >= _config.maxStar)
                {
                    return false;
                }

                state.Wildcards[star] += Math.Max(0, reward.Count);
                return true;
            }

            bool grantedAny = false;
            for (int i = 0; i < Math.Max(0, reward.Count); i++)
            {
                string type = RewardCardTypes[_nextRewardType % RewardCardTypes.Length];
                _nextRewardType++;
                grantedAny |= AddCard(state, type, reward.Star);
            }

            return grantedAny;
        }

        public bool AddCard(GameState state, string type, int star)
        {
            if (state == null)
            {
                return false;
            }

            int slot = FindEmpty(state.Hand);
            if (slot < 0)
            {
                return false;
            }

            CardState card = state.CreateCard(type, ClampStar(star));
            state.Hand[slot] = card;
            QueueEvolutionChoice(state, card);
            AutoMergeHand(state);
            return true;
        }

        public int AutoMergeHand(GameState state)
        {
            if (state == null || state.PendingEvolution != null)
            {
                return 0;
            }

            int merged = 0;
            bool changed = true;
            while (changed && state.PendingEvolution == null)
            {
                changed = false;
                for (int i = 0; i < state.Hand.Length; i++)
                {
                    CardState first = state.Hand[i];
                    if (first == null
                        || first.Provisional
                        || first.Star >= _config.maxStar)
                    {
                        continue;
                    }

                    for (int j = i + 1; j < state.Hand.Length; j++)
                    {
                        CardState second = state.Hand[j];
                        if (second == null
                            || second.Provisional
                            || first.Type != second.Type
                            || first.Star != second.Star)
                        {
                            continue;
                        }

                        CardState result = state.CreateCard(
                            first.Type,
                            first.Star + 1);
                        result.EvolutionPath.AddRange(first.EvolutionPath);
                        state.Hand[i] = result;
                        state.Hand[j] = null;
                        state.Merges++;
                        state.MergeResultStarTotal += result.Star;
                        merged++;
                        QueueEvolutionChoice(state, result);
                        changed = true;
                        break;
                    }

                    if (changed)
                    {
                        break;
                    }
                }
            }

            return merged;
        }

        public WildcardUseResult UseWildcard(
            GameState state,
            CardSlotKind kind,
            int index)
        {
            if (!IsValidSlot(state, kind, index))
            {
                return WildcardUseResult.EmptyTarget;
            }

            CardState[] slots = Slots(state, kind);
            CardState target = slots[index];
            if (target == null)
            {
                return WildcardUseResult.EmptyTarget;
            }

            if (target.Provisional)
            {
                return WildcardUseResult.EvolutionPending;
            }

            if (target.Star >= _config.maxStar)
            {
                return WildcardUseResult.MaxStar;
            }

            if (!state.Wildcards.TryGetValue(target.Star, out int count)
                || count <= 0)
            {
                return WildcardUseResult.MissingWildcard;
            }

            state.Wildcards[target.Star]--;
            target.Star++;
            state.Merges++;
            state.MergeResultStarTotal += target.Star;
            QueueEvolutionChoice(state, target);
            if (kind == CardSlotKind.Hand)
            {
                AutoMergeHand(state);
            }
            else
            {
                state.EquipmentEffectWave = 0;
            }

            return WildcardUseResult.Upgraded;
        }

        public bool ResolveEvolutionChoice(GameState state, int optionIndex)
        {
            EvolutionChoice choice = state?.PendingEvolution;
            if (choice == null
                || optionIndex < 0
                || optionIndex >= choice.Options.Length)
            {
                return false;
            }

            CardState card = FindCardById(state, choice.CardId);
            if (card == null || !card.Provisional)
            {
                return false;
            }

            string prefix = choice.CheckpointStar + ":";
            card.EvolutionPath.RemoveAll(
                entry => entry.StartsWith(
                    prefix,
                    StringComparison.Ordinal));
            card.EvolutionPath.Add(
                prefix + choice.Options[optionIndex]);
            card.EvolutionPath.Sort(
                (left, right) =>
                    ParseCheckpoint(left).CompareTo(ParseCheckpoint(right)));
            card.Provisional = false;
            state.PendingEvolution = null;
            state.RefreshDecisionLock();
            state.EquipmentEffectWave = 0;

            QueueNextEvolutionChoice(state);
            AutoMergeHand(state);
            return true;
        }

        public CardMoveResult MoveOrSwap(
            GameState state,
            CardSlotKind sourceKind,
            int sourceIndex,
            CardSlotKind targetKind,
            int targetIndex)
        {
            if (!IsValidSlot(state, sourceKind, sourceIndex)
                || !IsValidSlot(state, targetKind, targetIndex))
            {
                return CardMoveResult.InvalidSlot;
            }

            if (sourceKind == targetKind && sourceIndex == targetIndex)
            {
                return CardMoveResult.NoChange;
            }

            if (sourceKind == CardSlotKind.Equipment
                && targetKind != CardSlotKind.Equipment
                && !_config.equipSwappable)
            {
                return CardMoveResult.EquipmentLocked;
            }

            CardState[] source = Slots(state, sourceKind);
            CardState[] target = Slots(state, targetKind);
            CardState moving = source[sourceIndex];
            if (moving == null)
            {
                return CardMoveResult.EmptySource;
            }

            CardState replaced = target[targetIndex];
            if ((moving.Provisional || replaced?.Provisional == true)
                && (sourceKind == CardSlotKind.Equipment
                    || targetKind == CardSlotKind.Equipment))
            {
                return CardMoveResult.EvolutionPending;
            }

            if (_config.feedEquipped
                && targetKind == CardSlotKind.Equipment
                && replaced != null
                && replaced.Type == moving.Type
                && replaced.Star == moving.Star
                && replaced.Star < _config.maxStar)
            {
                replaced.Star++;
                source[sourceIndex] = null;
                state.Merges++;
                state.MergeResultStarTotal += replaced.Star;
                QueueEvolutionChoice(state, replaced);
                state.EquipmentEffectWave = 0;
                return CardMoveResult.Fed;
            }

            CardState enteringEquipment = null;
            int enteringIndex = -1;
            if (targetKind == CardSlotKind.Equipment)
            {
                enteringEquipment = moving;
                enteringIndex = targetIndex;
            }
            else if (sourceKind == CardSlotKind.Equipment && replaced != null)
            {
                enteringEquipment = replaced;
                enteringIndex = sourceIndex;
            }

            if (enteringEquipment != null)
            {
                if (enteringEquipment.Star < _config.equipThreshold)
                {
                    return CardMoveResult.StarTooLow;
                }

                if (_config.equipDistinctTypes
                    && HasDuplicateEquippedType(
                        state,
                        enteringEquipment.Type,
                        enteringIndex))
                {
                    return CardMoveResult.DuplicateType;
                }
            }

            if (sourceKind == CardSlotKind.Hand
                && targetKind == CardSlotKind.Equipment
                && replaced != null
                && !_config.equipSwappable)
            {
                return CardMoveResult.EquipmentLocked;
            }

            target[targetIndex] = moving;
            source[sourceIndex] = replaced;
            CardMoveResult result = replaced == null
                ? CardMoveResult.Moved
                : CardMoveResult.Swapped;
            if (sourceKind == CardSlotKind.Hand
                || targetKind == CardSlotKind.Hand)
            {
                AutoMergeHand(state);
            }
            if (sourceKind == CardSlotKind.Equipment
                || targetKind == CardSlotKind.Equipment)
            {
                state.EquipmentEffectWave = 0;
            }

            return result;
        }

        public bool Consume(GameState state, CardSlotKind kind, int index)
        {
            if (!IsValidSlot(state, kind, index))
            {
                return false;
            }

            CardState[] slots = Slots(state, kind);
            if (slots[index] == null || slots[index].Provisional)
            {
                return false;
            }

            slots[index] = null;
            state.ConsumedCards++;
            if (kind == CardSlotKind.Equipment)
            {
                state.EquipmentEffectWave = 0;
            }
            return true;
        }

        private int ClampStar(int star)
        {
            return Math.Max(1, Math.Min(_config.maxStar, star));
        }

        private void QueueNextEvolutionChoice(GameState state)
        {
            if (state.PendingEvolution != null)
            {
                return;
            }

            for (int i = 0; i < state.Hand.Length; i++)
            {
                if (QueueEvolutionChoice(state, state.Hand[i]))
                {
                    return;
                }
            }

            for (int i = 0; i < state.Equipment.Length; i++)
            {
                if (QueueEvolutionChoice(state, state.Equipment[i]))
                {
                    return;
                }
            }
        }

        private static bool QueueEvolutionChoice(
            GameState state,
            CardState card)
        {
            if (state.PendingEvolution != null || card == null)
            {
                return false;
            }

            int checkpoint = MissingCheckpoint(card, 3)
                ? 3
                : MissingCheckpoint(card, 5)
                    ? 5
                    : 0;
            if (checkpoint == 0)
            {
                return false;
            }

            string suffix = checkpoint == 3 ? "" : "2";
            string[] options =
            {
                card.Type + "A" + suffix,
                card.Type + "B" + suffix,
                card.Type + "C" + suffix
            };
            card.Provisional = true;
            state.PendingEvolution = new EvolutionChoice(
                card.Id,
                card.Type,
                checkpoint,
                options);
            state.SetDecisionLocked(true);
            return true;
        }

        private static bool MissingCheckpoint(CardState card, int checkpoint)
        {
            if (card.Star < checkpoint)
            {
                return false;
            }

            string prefix = checkpoint + ":";
            return !card.EvolutionPath.Exists(
                entry => entry.StartsWith(
                    prefix,
                    StringComparison.Ordinal));
        }

        private static CardState FindCardById(GameState state, int id)
        {
            foreach (CardState card in state.Hand)
            {
                if (card?.Id == id)
                {
                    return card;
                }
            }

            foreach (CardState card in state.Equipment)
            {
                if (card?.Id == id)
                {
                    return card;
                }
            }

            return null;
        }

        private static int ParseCheckpoint(string entry)
        {
            int separator = entry.IndexOf(':');
            return separator > 0
                && int.TryParse(
                    entry.Substring(0, separator),
                    out int checkpoint)
                ? checkpoint
                : int.MaxValue;
        }

        private static int FindEmpty(CardState[] cards)
        {
            for (int i = 0; i < cards.Length; i++)
            {
                if (cards[i] == null)
                {
                    return i;
                }
            }

            return -1;
        }

        private static CardState[] Slots(GameState state, CardSlotKind kind)
        {
            return kind == CardSlotKind.Hand ? state.Hand : state.Equipment;
        }

        private static bool IsValidSlot(
            GameState state,
            CardSlotKind kind,
            int index)
        {
            if (state == null)
            {
                return false;
            }

            CardState[] slots = Slots(state, kind);
            return index >= 0 && index < slots.Length;
        }

        private static bool HasDuplicateEquippedType(
            GameState state,
            string type,
            int skipIndex)
        {
            for (int i = 0; i < state.Equipment.Length; i++)
            {
                if (i != skipIndex && state.Equipment[i]?.Type == type)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
