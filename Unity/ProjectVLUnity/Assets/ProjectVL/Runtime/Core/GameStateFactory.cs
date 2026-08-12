using ProjectVL.Config;

namespace ProjectVL.Core
{
    public static class GameStateFactory
    {
        public static GameState Create(CombatConfig combat)
        {
            return Create(combat, new EconomyConfig());
        }

        public static GameState Create(
            CombatConfig combat,
            EconomyConfig economy)
        {
            CombatConfigValidator.ValidateOrThrow(combat);
            var state = new GameState(combat.hp.max, economy);
            state.AttachInventory(new ProjectVL.Systems.CardInventorySystem(economy));
            return state;
        }
    }
}
