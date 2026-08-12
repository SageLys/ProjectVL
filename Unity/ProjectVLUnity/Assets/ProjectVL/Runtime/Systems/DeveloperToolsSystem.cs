using System;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class DeveloperToolsSystem
    {
        private readonly GameState _state;
        private readonly GameSimulation _simulation;
        private readonly WaveSystem _waves;
        private readonly SystemRandomSource _random;

        public bool Enabled { get; }
        public bool Visible { get; private set; }
        public int Seed => _random.Seed;
        public float TimeScale => _simulation.TimeScale;

        public DeveloperToolsSystem(
            GameState state,
            GameSimulation simulation,
            WaveSystem waves,
            SystemRandomSource random,
            bool enabled)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _simulation = simulation
                ?? throw new ArgumentNullException(nameof(simulation));
            _waves = waves ?? throw new ArgumentNullException(nameof(waves));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            Enabled = enabled;
        }

        public void ToggleVisible()
        {
            if (Enabled)
            {
                Visible = !Visible;
            }
        }

        public void SetVisible(bool visible)
        {
            Visible = Enabled && visible;
        }

        public void SetInvincible(bool invincible)
        {
            if (Enabled)
            {
                _state.SetInvincible(invincible);
            }
        }

        public void ToggleInvincible()
        {
            SetInvincible(!_state.Invincible);
        }

        public void SetTimeScale(float timeScale)
        {
            if (Enabled)
            {
                _simulation.SetTimeScale(timeScale);
            }
        }

        public void JumpToWave(int wave)
        {
            if (Enabled)
            {
                _waves.JumpToWave(_state, wave);
            }
        }

        public void RestartWave()
        {
            if (Enabled)
            {
                _waves.RestartWave(_state);
            }
        }
    }
}
