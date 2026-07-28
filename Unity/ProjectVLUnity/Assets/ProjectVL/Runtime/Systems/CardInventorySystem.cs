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
                state.Wildcards[star] += Math.Max(0, reward.Count);
                return true;
            }

            bool grantedAny = false;
            for (int i = 0; i < Math.Max(0, reward.Count); i++)
            {
                int slot = FindEmpty(state.Hand);
                if (slot < 0)
                {
                    break;
                }

                string type = RewardCardTypes[_nextRewardType % RewardCardTypes.Length];
                _nextRewardType++;
                state.Hand[slot] = state.CreateCard(type, ClampStar(reward.Star));
                grantedAny = true;
            }

            return grantedAny;
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
            if (_config.feedEquipped
                && targetKind == CardSlotKind.Equipment
                && replaced != null
                && replaced.Type == moving.Type
                && replaced.Star == moving.Star
                && replaced.Star < _config.maxStar)
            {
                replaced.Star++;
                source[sourceIndex] = null;
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
            return replaced == null
                ? CardMoveResult.Moved
                : CardMoveResult.Swapped;
        }

        public bool Consume(GameState state, CardSlotKind kind, int index)
        {
            if (!IsValidSlot(state, kind, index))
            {
                return false;
            }

            CardState[] slots = Slots(state, kind);
            if (slots[index] == null)
            {
                return false;
            }

            slots[index] = null;
            state.ConsumedCards++;
            return true;
        }

        private int ClampStar(int star)
        {
            return Math.Max(1, Math.Min(_config.maxStar, star));
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
