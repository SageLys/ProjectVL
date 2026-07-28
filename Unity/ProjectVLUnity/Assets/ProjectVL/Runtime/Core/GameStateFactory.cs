using ProjectVL.Config;

namespace ProjectVL.Core
{
    public static class GameStateFactory
    {
        public static GameState Create(CombatConfig combat)
        {
            CombatConfigValidator.ValidateOrThrow(combat);
            return new GameState(combat.hp.max);
        }
    }
}
