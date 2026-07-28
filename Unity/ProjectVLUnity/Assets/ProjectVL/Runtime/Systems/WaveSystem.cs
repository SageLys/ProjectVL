using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class WaveSystem
    {
        private readonly WavesConfig _waves;
        private readonly EnemyFactory _enemyFactory;

        public WaveSystem(WavesConfig waves, EnemyFactory enemyFactory)
        {
            _waves = waves;
            _enemyFactory = enemyFactory;
        }

        public void StartNextWave(GameState state)
        {
            int nextWave = state.Wave + 1;
            if (nextWave > _waves.totalWaves)
            {
                state.EndRun(true);
                return;
            }

            state.BeginWave(nextWave);
            state.SpawnLeft = EnemyCountFor(nextWave);
            state.SpawnTimer = _waves.firstSpawnDelay;
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state.SpawnLeft > 0)
            {
                state.SpawnTimer -= deltaTime;
                if (state.SpawnTimer <= 0f)
                {
                    _enemyFactory.SpawnRegular(state);
                    state.SpawnLeft--;
                    state.SpawnTimer = Math.Max(
                        _waves.spawnInterval.min,
                        _waves.spawnInterval.@base
                        - state.Wave * _waves.spawnInterval.perWave);
                }
            }

            if (state.SpawnLeft == 0 && state.Enemies.Count == 0)
            {
                StartNextWave(state);
            }
        }

        public int EnemyCountFor(int wave)
        {
            return _waves.enemyCountBase + wave * _waves.enemyCountPerWave;
        }
    }
}
