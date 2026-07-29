using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CardInventorySystem
    {
        private readonly EconomyConfig _config;
        private readonly CardPoolSystem _cardPool;
        private readonly CardCatalog _catalog;
        private readonly CardAffixSystem _affixes;
        private int _nextRewardType;

        public CardInventorySystem(
            EconomyConfig config,
            CardPoolSystem cardPool = null,
            CardCatalog catalog = null,
            CardAffixSystem affixes = null)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _cardPool = cardPool;
            _catalog = catalog ?? CardCatalog.Default;
            _affixes = affixes;
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
                string type = _cardPool?.SelectRewardType(
                    state,
                    reward.TypePolicy);
                if (string.IsNullOrEmpty(type))
                {
                    type = _catalog.PlayableIds[
                        _nextRewardType % _catalog.PlayableIds.Count];
                    _nextRewardType++;
                }

                grantedAny |= AddCard(state, type, reward.Star);
            }

            return grantedAny;
        }

        public bool AddCard(GameState state, string type, int star)
        {
            if (state == null || !_catalog.IsPlayable(type))
            {
                return false;
            }

            int slot = FindEmpty(state.Hand);
            if (slot < 0)
            {
                return false;
            }

            CardState card = state.CreateCard(type, ClampStar(star));
            _affixes?.Attach(state, card);
            state.Hand[slot] = card;
            state.RecordCardCollected(type, card.Star);
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
                        state.RecordCardMerge(result.Type, result.Star);
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
            state.RecordCardMerge(target.Type, target.Star);
            QueueEvolutionChoice(state, target);
            if (kind == CardSlotKind.Hand)
            {
                AutoMergeHand(state);
            }
            else
            {
                state.EquipmentEffectWave = 0;
                CardAffixSystem.ReconcileMaxHp(state);
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
            CardAffixSystem.ReconcileMaxHp(state);

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
                state.RecordCardMerge(replaced.Type, replaced.Star);
                QueueEvolutionChoice(state, replaced);
                state.EquipmentEffectWave = 0;
                CardAffixSystem.ReconcileMaxHp(state);
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
                CardAffixSystem.ReconcileMaxHp(state);
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
                CardAffixSystem.ReconcileMaxHp(state);
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

        private bool QueueEvolutionChoice(
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

            string[] options =
                _catalog.EvolutionOptions(card.Type, checkpoint);
            if (options.Length == 0)
            {
                return false;
            }
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
