using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class ProjectVLGameController : MonoBehaviour
    {
        private GameSimulation _simulation;
        private CombatWorld _world;
        private ArenaPresenter _presenter;

        public GameState State => _simulation?.State;

        private void Awake()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();

            GameState state = GameStateFactory.Create(combat);
            var random = new SystemRandomSource(System.Environment.TickCount);
            var enemyFactory = new EnemyFactory(combat, enemies, waves, random);
            var waveSystem = new WaveSystem(waves, enemyFactory);
            var combatSystem = new CombatSystem(combat);

            _world = new CombatWorld(combatSystem, waveSystem);
            _simulation = new GameSimulation(state, combat);
            _simulation.CombatStep += _world.Step;

            _presenter = gameObject.AddComponent<ArenaPresenter>();
            _presenter.Initialize(combat, state);

            state.StartRun();
            waveSystem.StartNextWave(state);
            _presenter.Sync();
        }

        private void Update()
        {
            _simulation.AdvanceFrame(Time.unscaledDeltaTime);
            _presenter.Sync();
        }

        private void OnDestroy()
        {
            if (_simulation != null && _world != null)
            {
                _simulation.CombatStep -= _world.Step;
            }
        }
    }
}
