using System;

namespace ProjectVL.Core
{
    public sealed class GameState
    {
        public GameMode Mode { get; private set; }
        public bool Paused { get; private set; }
        public bool DecisionLocked { get; private set; }
        public bool IntermissionActive { get; private set; }
        public float Time { get; private set; }
        public float Hp { get; private set; }
        public float BaseMaxHp { get; private set; }
        public float MaxHp { get; private set; }
        public int Wave { get; private set; }
        public float ShotCooldown { get; set; }
        public float TurretAngleRadians { get; set; }

        public bool CanAdvance =>
            Mode == GameMode.Playing
            && !Paused
            && !DecisionLocked;

        public bool CanAdvanceCombat => CanAdvance && !IntermissionActive;

        internal GameState(float maxHp)
        {
            Mode = GameMode.Ready;
            Hp = maxHp;
            BaseMaxHp = maxHp;
            MaxHp = maxHp;
            TurretAngleRadians = -(float)Math.PI / 2f;
        }

        public void StartRun()
        {
            if (Mode != GameMode.Ready)
            {
                throw new InvalidOperationException("Only a ready game can be started.");
            }

            Mode = GameMode.Playing;
        }

        public void SetPaused(bool paused)
        {
            Paused = Mode == GameMode.Playing && paused;
        }

        public void SetDecisionLocked(bool locked)
        {
            DecisionLocked = locked;
        }

        public void SetIntermission(bool active)
        {
            IntermissionActive = active;
        }

        public void BeginWave(int wave)
        {
            if (wave < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(wave));
            }

            Wave = wave;
            IntermissionActive = false;
        }

        public void EndRun()
        {
            Mode = GameMode.Ended;
            Paused = false;
        }

        internal void AdvanceTime(float deltaTime)
        {
            Time += deltaTime;
        }
    }
}
