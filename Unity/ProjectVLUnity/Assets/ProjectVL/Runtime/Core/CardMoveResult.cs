namespace ProjectVL.Core
{
    public enum CardMoveResult
    {
        Moved,
        Swapped,
        Fed,
        NoChange,
        EmptySource,
        InvalidSlot,
        StarTooLow,
        DuplicateType,
        EquipmentLocked,
        EvolutionPending
    }
}
