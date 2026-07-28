using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CombatWorld
    {
        private readonly CombatSystem _combat;
        private readonly WaveSystem _waves;
        private readonly DropSystem _drops;

        public CombatWorld(
            CombatSystem combat,
            WaveSystem waves,
            DropSystem drops = null)
        {
            _combat = combat;
            _waves = waves;
            _drops = drops;
        }

        public void Step(GameState state, float deltaTime)
        {
            _drops?.Step(state, deltaTime);
            if (state.IntermissionActive)
            {
                _waves.Step(state, deltaTime);
                return;
            }

            _combat.StepPassives(state, deltaTime);
            _combat.StepTurret(state, deltaTime);
            _waves.Step(state, deltaTime);
            _combat.StepBullets(state, deltaTime);
            _combat.StepEnemies(state, deltaTime);
        }
    }
}
