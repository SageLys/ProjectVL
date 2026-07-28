using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ProjectVL.Presentation
{
    public sealed class ProjectVLGameController : MonoBehaviour
    {
        private GameSimulation _simulation;
        private CombatWorld _world;
        private ArenaPresenter _presenter;
        private WaveSystem _waveSystem;

        public GameState State => _simulation?.State;
        public float TimeScale => _simulation?.TimeScale ?? 1f;

        private void Awake()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();

            GameState state = GameStateFactory.Create(combat);
            var random = new SystemRandomSource(System.Environment.TickCount);
            var enemyFactory = new EnemyFactory(combat, enemies, waves, random);
            _waveSystem = new WaveSystem(waves, enemyFactory);
            var combatSystem = new CombatSystem(combat, enemies);

            _world = new CombatWorld(combatSystem, _waveSystem);
            _simulation = new GameSimulation(state, combat);
            _simulation.CombatStep += _world.Step;

            _presenter = gameObject.AddComponent<ArenaPresenter>();
            _presenter.Initialize(combat, state);
            gameObject.AddComponent<GameHud>().Initialize(this);
            _presenter.Sync();
        }

        private void Update()
        {
            HandleKeyboard();
            _simulation.AdvanceFrame(Time.unscaledDeltaTime);
            _presenter.Sync();
        }

        public void StartGame()
        {
            if (State.Mode != GameMode.Ready)
            {
                return;
            }

            State.StartRun();
            _waveSystem.StartNextWave(State);
        }

        public void TogglePause()
        {
            if (State.Mode == GameMode.Playing)
            {
                State.SetPaused(!State.Paused);
            }
        }

        public void SetTimeScale(float timeScale)
        {
            _simulation.SetTimeScale(timeScale);
        }

        public void RestartGame()
        {
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        private void HandleKeyboard()
        {
            if (Input.GetKeyDown(KeyCode.Space) && State.Mode == GameMode.Ready)
            {
                StartGame();
            }

            if ((Input.GetKeyDown(KeyCode.P) || Input.GetKeyDown(KeyCode.Escape))
                && State.Mode == GameMode.Playing)
            {
                TogglePause();
            }

            if (Input.GetKeyDown(KeyCode.R))
            {
                RestartGame();
            }
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
