namespace ProjectVL.Core
{
    public enum CardMoveResult
    {
        Moved,
        Swapped,
        Fed,
        RecipeCrafted,
        RecipeRejected,
        NoChange,
        EmptySource,
        InvalidSlot,
        StarTooLow,
        DuplicateType,
        EquipmentLocked,
        EvolutionPending
    }
}
