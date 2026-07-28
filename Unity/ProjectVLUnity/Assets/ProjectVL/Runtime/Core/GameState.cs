using System;
using System.Collections.Generic;

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
        public bool? Won { get; private set; }
        public float ShotCooldown { get; set; }
        public float TurretAngleRadians { get; set; }
        public int SpawnLeft { get; internal set; }
        public float SpawnTimer { get; internal set; }
        public int Kills { get; internal set; }
        public List<EnemyState> Enemies { get; } = new List<EnemyState>();
        public List<BulletState> Bullets { get; } = new List<BulletState>();

        private int _nextEnemyId = 1;
        private int _nextBulletId = 1;

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

        public void EndRun(bool won = false)
        {
            Mode = GameMode.Ended;
            Paused = false;
            Won = won;
        }

        internal int TakeNextEnemyId()
        {
            return _nextEnemyId++;
        }

        internal int TakeNextBulletId()
        {
            return _nextBulletId++;
        }

        internal void ApplyDamage(float damage)
        {
            Hp = Math.Max(0f, Hp - Math.Max(0f, damage));
            if (Hp <= 0f)
            {
                EndRun(false);
            }
        }

        internal void AdvanceTime(float deltaTime)
        {
            Time += deltaTime;
        }
    }
}
