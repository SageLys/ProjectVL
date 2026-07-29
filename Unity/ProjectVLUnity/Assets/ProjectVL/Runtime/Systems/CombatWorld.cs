using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CombatWorld
    {
        private readonly CombatSystem _combat;
        private readonly WaveSystem _waves;
        private readonly DropSystem _drops;
        private readonly BountySystem _bounties;

        public CombatWorld(
            CombatSystem combat,
            WaveSystem waves,
            DropSystem drops = null,
            BountySystem bounties = null)
        {
            _combat = combat;
            _waves = waves;
            _drops = drops;
            _bounties = bounties;
        }

        public void Step(GameState state, float deltaTime)
        {
            _drops?.Step(state, deltaTime);
            _bounties?.Step(state, deltaTime);
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
