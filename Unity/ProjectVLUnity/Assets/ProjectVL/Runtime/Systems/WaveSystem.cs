using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class WaveSystem
    {
        private readonly WavesConfig _waves;
        private readonly EnemyFactory _enemyFactory;
        private readonly WavePlanResolver _planResolver;
        private ResolvedWavePlan _activePlan;

        public WaveSystem(WavesConfig waves, EnemyFactory enemyFactory)
        {
            _waves = waves;
            _enemyFactory = enemyFactory;
            _planResolver = new WavePlanResolver(waves);
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
            _activePlan = _planResolver.Resolve(nextWave);
            state.SpawnLeft = _activePlan.Quota;
            state.SpawnTimer = _waves.firstSpawnDelay;
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state.WavePhase == WavePhase.Boss)
            {
                if (state.BossId.HasValue
                    && !state.Enemies.Exists(enemy => enemy.Id == state.BossId.Value))
                {
                    StartNextWave(state);
                }

                return;
            }

            if (state.SpawnLeft > 0)
            {
                state.SpawnTimer -= deltaTime;
                if (state.SpawnTimer <= 0f)
                {
                    int alive = state.Enemies.FindAll(
                        enemy => enemy.SpawnKind == EnemySpawnKind.Regular).Count;
                    BudgetAdmission admission = BudgetAdmission.Calculate(
                        _activePlan,
                        state.SpawnLeft,
                        alive);
                    for (int index = 0; index < admission.SpawnCount; index++)
                    {
                        _enemyFactory.SpawnRegular(state);
                        state.SpawnLeft--;
                    }

                    state.LastSpawnCheckCount = admission.SpawnCount;
                    state.SpawnTimer = _activePlan.CheckInterval;
                }
            }

            bool hasRegularEnemy = state.Enemies.Exists(
                enemy => enemy.SpawnKind == EnemySpawnKind.Regular);
            if (state.SpawnLeft == 0 && !hasRegularEnemy)
            {
                if (IsBossWave(state.Wave))
                {
                    EnemyState boss = _enemyFactory.SpawnWaveBoss(state);
                    state.WavePhase = WavePhase.Boss;
                    state.BossId = boss.Id;
                }
                else
                {
                    StartNextWave(state);
                }
            }
        }

        public int EnemyCountFor(int wave)
        {
            return _waves.enemyCountBase + wave * _waves.enemyCountPerWave;
        }

        private bool IsBossWave(int wave)
        {
            return Array.IndexOf(_waves.bossWaves, wave) >= 0;
        }
    }
}
