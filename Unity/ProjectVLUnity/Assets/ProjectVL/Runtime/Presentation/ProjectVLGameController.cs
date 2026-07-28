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
        private CardInventorySystem _cardInventory;
        private CardSlotKind? _selectedSlotKind;
        private int _selectedSlotIndex = -1;

        public GameState State => _simulation?.State;
        public float TimeScale => _simulation?.TimeScale ?? 1f;
        public string LastCardAction { get; private set; } =
            "Click a card, then click a destination slot.";

        private void Awake()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();

            GameState state = GameStateFactory.Create(combat, economy);
            _cardInventory = new CardInventorySystem(economy);
            var random = new SystemRandomSource(System.Environment.TickCount);
            var enemyFactory = new EnemyFactory(combat, enemies, waves, random);
            _waveSystem = new WaveSystem(waves, enemyFactory);
            var combatSystem = new CombatSystem(combat, enemies);

            _world = new CombatWorld(combatSystem, _waveSystem);
            _simulation = new GameSimulation(state, combat);
            _simulation.SimulationStep += _world.Step;

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

        public void ClaimBossReward()
        {
            _waveSystem.ClaimBossReward(State);
        }

        public void ConfirmNextWave()
        {
            _waveSystem.ConfirmIntermissionReady(State);
        }

        public bool IsCardSlotSelected(CardSlotKind kind, int index)
        {
            return _selectedSlotKind == kind && _selectedSlotIndex == index;
        }

        public void SelectCardSlot(CardSlotKind kind, int index)
        {
            CardState card = CardAt(kind, index);
            if (_selectedSlotKind == null)
            {
                if (card == null)
                {
                    LastCardAction = "That slot is empty.";
                    return;
                }

                _selectedSlotKind = kind;
                _selectedSlotIndex = index;
                LastCardAction = $"Selected {card.Star} STAR {card.Type}.";
                return;
            }

            if (_selectedSlotKind == kind && _selectedSlotIndex == index)
            {
                ClearCardSelection("Selection cleared.");
                return;
            }

            CardMoveResult result = _cardInventory.MoveOrSwap(
                State,
                _selectedSlotKind.Value,
                _selectedSlotIndex,
                kind,
                index);
            ClearCardSelection(CardActionText(result));
        }

        public void ConsumeSelectedCard()
        {
            if (_selectedSlotKind == null)
            {
                LastCardAction = "Select a card before casting it.";
                return;
            }

            CardState card = CardAt(
                _selectedSlotKind.Value,
                _selectedSlotIndex);
            bool consumed = _cardInventory.Consume(
                State,
                _selectedSlotKind.Value,
                _selectedSlotIndex);
            ClearCardSelection(
                consumed && card != null
                    ? $"Cast {card.Star} STAR {card.Type}."
                    : "The selected slot is empty.");
        }

        public void GrantTestCards()
        {
            State.GrantReward(new RunReward(RewardKind.Card, 3, 3, "debug"));
            LastCardAction = "Added three 3 STAR migration test cards.";
        }

        public void GrantMergeDemo()
        {
            for (int i = 0; i < 4; i++)
            {
                _cardInventory.AddCard(State, "impact", 1);
            }

            for (int star = 1; star <= 5; star++)
            {
                State.GrantReward(
                    new RunReward(RewardKind.Wildcard, star, 1, "debug"));
            }

            LastCardAction =
                "Added four IMPACT cards and one wildcard per star.";
        }

        public void UseWildcardOnSelected()
        {
            if (_selectedSlotKind == null)
            {
                LastCardAction = "Select a card before using a wildcard.";
                return;
            }

            WildcardUseResult result = _cardInventory.UseWildcard(
                State,
                _selectedSlotKind.Value,
                _selectedSlotIndex);
            ClearCardSelection(WildcardActionText(result));
        }

        public void ChooseEvolution(int optionIndex)
        {
            EvolutionChoice choice = State.PendingEvolution;
            if (_cardInventory.ResolveEvolutionChoice(State, optionIndex))
            {
                LastCardAction =
                    $"Evolution selected: {choice.Options[optionIndex]}.";
            }
        }

        private void HandleKeyboard()
        {
            if (Input.GetKeyDown(KeyCode.Space) && State.PendingBossReward != null)
            {
                ClaimBossReward();
            }
            else if (Input.GetKeyDown(KeyCode.Space) && State.IntermissionActive)
            {
                ConfirmNextWave();
            }
            else if (Input.GetKeyDown(KeyCode.Space) && State.Mode == GameMode.Ready)
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

            if (Input.GetKeyDown(KeyCode.G))
            {
                GrantTestCards();
            }

            if (Input.GetKeyDown(KeyCode.C))
            {
                ConsumeSelectedCard();
            }

            if (Input.GetKeyDown(KeyCode.M))
            {
                GrantMergeDemo();
            }

            if (Input.GetKeyDown(KeyCode.V))
            {
                UseWildcardOnSelected();
            }

            for (int i = 0; i < State.Hand.Length && i < 7; i++)
            {
                if (Input.GetKeyDown((KeyCode)((int)KeyCode.Alpha1 + i)))
                {
                    SelectCardSlot(CardSlotKind.Hand, i);
                }
            }

            if (State.Equipment.Length > 0 && Input.GetKeyDown(KeyCode.Q))
            {
                SelectCardSlot(CardSlotKind.Equipment, 0);
            }
            else if (State.Equipment.Length > 1 && Input.GetKeyDown(KeyCode.W))
            {
                SelectCardSlot(CardSlotKind.Equipment, 1);
            }
            else if (State.Equipment.Length > 2 && Input.GetKeyDown(KeyCode.E))
            {
                SelectCardSlot(CardSlotKind.Equipment, 2);
            }
        }

        private CardState CardAt(CardSlotKind kind, int index)
        {
            CardState[] slots = kind == CardSlotKind.Hand
                ? State.Hand
                : State.Equipment;
            return index >= 0 && index < slots.Length ? slots[index] : null;
        }

        private void ClearCardSelection(string message)
        {
            _selectedSlotKind = null;
            _selectedSlotIndex = -1;
            LastCardAction = message;
        }

        private static string CardActionText(CardMoveResult result)
        {
            switch (result)
            {
                case CardMoveResult.Moved:
                    return "Card moved.";
                case CardMoveResult.Swapped:
                    return "Cards swapped.";
                case CardMoveResult.Fed:
                    return "Matching equipment fed and upgraded.";
                case CardMoveResult.StarTooLow:
                    return "Equipment requires a 3 STAR or higher card.";
                case CardMoveResult.DuplicateType:
                    return "Only one card of each type can be equipped.";
                case CardMoveResult.EquipmentLocked:
                    return "That equipment move is locked.";
                case CardMoveResult.EvolutionPending:
                    return "Choose this card's evolution before equipping it.";
                case CardMoveResult.EmptySource:
                    return "The selected source is empty.";
                default:
                    return "No card moved.";
            }
        }

        private static string WildcardActionText(WildcardUseResult result)
        {
            switch (result)
            {
                case WildcardUseResult.Upgraded:
                    return "Wildcard consumed; card upgraded.";
                case WildcardUseResult.MaxStar:
                    return "A 6 STAR card cannot be upgraded.";
                case WildcardUseResult.MissingWildcard:
                    return "No wildcard matching the card's current star.";
                case WildcardUseResult.EvolutionPending:
                    return "Choose the pending evolution first.";
                default:
                    return "Select a non-empty card slot.";
            }
        }

        private void OnDestroy()
        {
            if (_simulation != null && _world != null)
            {
                _simulation.SimulationStep -= _world.Step;
            }
        }
    }
}
