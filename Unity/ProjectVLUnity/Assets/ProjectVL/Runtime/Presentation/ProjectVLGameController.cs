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
        private RecipeSystem _recipeSystem;
        private DropSystem _dropSystem;
        private CardSlotKind? _selectedSlotKind;
        private int _selectedSlotIndex = -1;
        private int _effectDemoIndex;
        private int _advancedDemoIndex;
        private int _transformDemoIndex;
        private static readonly string[] EffectDemoTypes =
        {
            "scorch",
            "splitBlast",
            "impact",
            "sanctum",
            "aegis",
            "thorns",
            "decoy",
            "harvest"
        };
        private static readonly string[] AdvancedDemoTypes =
        {
            "pierce",
            "pierce",
            "pierce",
            "chainLightning",
            "chainLightning",
            "chainLightning",
            "frost",
            "frost",
            "frost",
            "scorch",
            "scorch",
            "scorch",
            "splitBlast",
            "splitBlast",
            "splitBlast",
            "impact",
            "impact",
            "impact",
            "sanctum",
            "sanctum",
            "sanctum",
            "aegis",
            "aegis",
            "aegis",
            "thorns",
            "thorns",
            "thorns",
            "decoy",
            "decoy",
            "decoy",
            "harvest",
            "harvest",
            "harvest"
        };
        private static readonly string[] AdvancedDemoBranches =
        {
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C",
            "A",
            "B",
            "C"
        };
        private static readonly string[] TransformDemoTypes =
        {
            "pierce",
            "chainLightning",
            "frost",
            "scorch",
            "splitBlast",
            "impact",
            "sanctum",
            "aegis",
            "thorns",
            "decoy",
            "harvest"
        };

        public GameState State => _simulation?.State;
        public float TimeScale => _simulation?.TimeScale ?? 1f;
        public string LastCardAction { get; private set; } =
            "Click a card, then click a destination slot.";
        public string AvailableRecipeId =>
            _recipeSystem?.FirstAvailableRecipe(State);

        private void Awake()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            EvolutionRecipesConfig recipes =
                GameConfigLoader.LoadEvolutionRecipes();

            GameState state = GameStateFactory.Create(combat, economy);
            _cardInventory = new CardInventorySystem(economy);
            _recipeSystem = new RecipeSystem(recipes);
            var random = new SystemRandomSource(System.Environment.TickCount);
            var enemyFactory = new EnemyFactory(combat, enemies, waves, random);
            _waveSystem = new WaveSystem(waves, enemyFactory);
            _dropSystem = new DropSystem(economy, random);
            var combatSystem = new CombatSystem(combat, enemies, _dropSystem);

            _world = new CombatWorld(combatSystem, _waveSystem, _dropSystem);
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
            HandleDropPickup();
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

        public void SpawnDropDemo()
        {
            if (_dropSystem == null)
            {
                return;
            }

            var position = new Float2(
                400f + State.GroundDrops.Count * 36f,
                260f);
            _dropSystem.SpawnTestDrop(State, position);
            LastCardAction =
                "Spawned a guaranteed card drop. Click it before time runs out.";
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

        public void GrantRecipeDemo()
        {
            if (State.PendingEvolution != null)
            {
                LastCardAction = "Resolve the current evolution choice first.";
                return;
            }

            int emptySlots = 0;
            foreach (CardState card in State.Hand)
            {
                if (card == null)
                {
                    emptySlots++;
                }
            }

            if (emptySlots >= 2)
            {
                AddResolvedDemoCard("pierce");
                AddResolvedDemoCard("scorch");
                LastCardAction =
                    "Added 5 STAR PIERCE and SCORCH recipe materials.";
            }
            else
            {
                LastCardAction = "Two empty hand slots are required.";
            }
        }

        public void GrantEffectDemo()
        {
            int added = 0;
            while (_effectDemoIndex < EffectDemoTypes.Length)
            {
                string type = EffectDemoTypes[_effectDemoIndex];
                if (!AddResolvedDemoCard(type, 3))
                {
                    break;
                }

                _effectDemoIndex++;
                added++;
            }

            LastCardAction = added > 0
                ? $"Added {added} resolved effect test cards."
                : "Free hand slots, then press B for more effect cards.";
        }

        public void GrantAdvancedEffectDemo()
        {
            int added = 0;
            while (_advancedDemoIndex < AdvancedDemoTypes.Length)
            {
                string type = AdvancedDemoTypes[_advancedDemoIndex];
                string branch =
                    AdvancedDemoBranches[_advancedDemoIndex];
                if (!AddAdvancedDemoCard(type, branch))
                {
                    break;
                }

                _advancedDemoIndex++;
                added++;
            }

            LastCardAction = added > 0
                ? $"Added {added} five-star advanced effect cards."
                : "Free hand slots, then press N for more advanced cards.";
        }

        public void GrantTransformEffectDemo()
        {
            int added = 0;
            while (_transformDemoIndex < TransformDemoTypes.Length)
            {
                if (!AddTransformDemoCard(
                    TransformDemoTypes[_transformDemoIndex]))
                {
                    break;
                }

                _transformDemoIndex++;
                added++;
            }

            LastCardAction = added > 0
                ? $"Added {added} six-star transform cards."
                : "Free hand slots, then press U for more transforms.";
        }

        public void CraftAvailableRecipe()
        {
            string recipeId = AvailableRecipeId;
            RecipeCraftResult result = _recipeSystem.Craft(
                State,
                recipeId);
            LastCardAction = result == RecipeCraftResult.Crafted
                ? $"Crafted fixed recipe: {recipeId}."
                : RecipeActionText(result);
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

            if (Input.GetKeyDown(KeyCode.H))
            {
                GrantRecipeDemo();
            }

            if (Input.GetKeyDown(KeyCode.F))
            {
                CraftAvailableRecipe();
            }

            if (Input.GetKeyDown(KeyCode.B))
            {
                GrantEffectDemo();
            }

            if (Input.GetKeyDown(KeyCode.T))
            {
                SpawnDropDemo();
            }

            if (Input.GetKeyDown(KeyCode.N))
            {
                GrantAdvancedEffectDemo();
            }

            if (Input.GetKeyDown(KeyCode.U))
            {
                GrantTransformEffectDemo();
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

        private void HandleDropPickup()
        {
            if (!Input.GetMouseButtonDown(0)
                || _dropSystem == null
                || !_presenter.TryScreenToArenaPoint(
                    Input.mousePosition,
                    out Float2 arenaPoint))
            {
                return;
            }

            DropCollectResult result =
                _dropSystem.CollectNearest(State, arenaPoint);
            if (result == DropCollectResult.Collected)
            {
                LastCardAction = "Card drop collected.";
            }
            else if (result == DropCollectResult.HandFull)
            {
                LastCardAction =
                    "Hand full. Free a slot, then click the drop again.";
            }
        }

        private CardState CardAt(CardSlotKind kind, int index)
        {
            CardState[] slots = kind == CardSlotKind.Hand
                ? State.Hand
                : State.Equipment;
            return index >= 0 && index < slots.Length ? slots[index] : null;
        }

        private bool AddResolvedDemoCard(string type, int star = 5)
        {
            for (int i = 0; i < State.Hand.Length; i++)
            {
                if (State.Hand[i] != null)
                {
                    continue;
                }

                CardState card = State.CreateCard(type, star);
                card.EvolutionPath.Add($"3:{type}A");
                if (star >= 5)
                {
                    card.EvolutionPath.Add($"5:{type}A2");
                }
                State.Hand[i] = card;
                return true;
            }

            return false;
        }

        private bool AddAdvancedDemoCard(
            string type,
            string branch)
        {
            for (int i = 0; i < State.Hand.Length; i++)
            {
                if (State.Hand[i] != null)
                {
                    continue;
                }

                CardState card = State.CreateCard(type, 5);
                card.EvolutionPath.Add(
                    $"3:{type}{branch}");
                card.EvolutionPath.Add(
                    $"5:{type}{branch}2");
                State.Hand[i] = card;
                return true;
            }

            return false;
        }

        private bool AddTransformDemoCard(string type)
        {
            for (int i = 0; i < State.Hand.Length; i++)
            {
                if (State.Hand[i] != null)
                {
                    continue;
                }

                CardState card = State.CreateCard(type, 6);
                card.EvolutionPath.Add($"3:{type}A");
                card.EvolutionPath.Add($"5:{type}A2");
                State.Hand[i] = card;
                return true;
            }

            return false;
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

        private static string RecipeActionText(RecipeCraftResult result)
        {
            switch (result)
            {
                case RecipeCraftResult.WrongPhase:
                    return "Fixed recipes can only be crafted between waves.";
                case RecipeCraftResult.MissingMaterials:
                    return "No fixed recipe materials are ready.";
                case RecipeCraftResult.HandFull:
                    return "A hand slot is required for the recipe output.";
                case RecipeCraftResult.AlreadyCompleted:
                    return "That fixed recipe was already completed.";
                default:
                    return "No available fixed recipe.";
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
