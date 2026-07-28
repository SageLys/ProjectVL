using System;
using ProjectVL.Config;

namespace ProjectVL.Core
{
    public sealed class GameSimulation
    {
        private const int MaxStepsPerFrame = 8;
        private readonly CombatConfig _combat;

        public GameState State { get; }
        public float TimeScale { get; private set; } = 1f;
        public event Action<GameState, float> CombatStep;

        public GameSimulation(GameState state, CombatConfig combat)
        {
            State = state ?? throw new ArgumentNullException(nameof(state));
            CombatConfigValidator.ValidateOrThrow(combat);
            _combat = combat;
        }

        public void SetTimeScale(float timeScale)
        {
            TimeScale = Math.Max(0.25f, Math.Min(3f, timeScale));
        }

        public int AdvanceFrame(float frameDeltaTime)
        {
            if (float.IsNaN(frameDeltaTime)
                || float.IsInfinity(frameDeltaTime)
                || frameDeltaTime < 0f)
            {
                throw new ArgumentOutOfRangeException(nameof(frameDeltaTime));
            }

            if (!State.CanAdvance || frameDeltaTime == 0f)
            {
                return 0;
            }

            float remaining = frameDeltaTime * TimeScale;
            int steps = 0;

            while (remaining > 0.000001f && steps < MaxStepsPerFrame && State.CanAdvance)
            {
                float deltaTime = Math.Min(_combat.dtCap, remaining);
                State.AdvanceTime(deltaTime);

                if (State.CanAdvanceCombat)
                {
                    CombatStep?.Invoke(State, deltaTime);
                }

                remaining -= deltaTime;
                steps++;
            }

            return steps;
        }
    }
}
