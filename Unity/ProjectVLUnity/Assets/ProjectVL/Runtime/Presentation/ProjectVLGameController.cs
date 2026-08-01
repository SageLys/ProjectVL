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
        private CombatSystem _combatSystem;
        private RewardMeterSystem _rewardMeterSystem;
        private GodPoolSystem _godPoolSystem;
        private BountySystem _bountySystem;
        private DeveloperToolsSystem _developerTools;
        private RuntimeTuningSystem _runtimeTuning;
        private DeveloperTelemetrySystem _telemetry;
        private AudioDirector _audio;
        private TuningPresetStore _tuningPresets;
        private static int? _requestedSeed;
        private CardSlotKind? _selectedSlotKind;
        private int _selectedSlotIndex = -1;
        private CardSlotKind? _pendingCastSlotKind;
        private int _pendingCastSlotIndex = -1;
        private int _castArmedFrame = -1;
        private CardSlotKind? _draggedSlotKind;
        private int _draggedSlotIndex = -1;
        private int _totalWaves;
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
            "harvest",
            "stormLattice",
            "thunderRime",
            "emberSpark",
            "voltBastion",
            "ampereFlow",
            "crystalRelay",
            "glacialEpoch",
            "rimeShell",
            "tombSpire",
            "stasisLedger",
            "solarPiercer",
            "steamBurst",
            "volcanoCore",
            "emberMoat",
            "emberYield",
            "pylonCircuit",
            "glacialEffigy",
            "wrathMortar",
            "aegisCitadel",
            "rootLoom",
            "midasChain",
            "frostDew",
            "pyreBrand",
            "fortuneThorns",
            "goldenGrove"
        };

        public GameState State => _simulation?.State;
        public float TimeScale => _simulation?.TimeScale ?? 1f;
        public string LastCardAction { get; private set; } =
            "点击卡牌，再点击目标槽位。";
        public int TotalWaves => _totalWaves;
        public Rect MobileViewportRect =>
            _presenter != null
                ? _presenter.GetArenaGuiRect()
                : new Rect(0f, 0f, Screen.width, Screen.height);
        public string AvailableRecipeId =>
            _recipeSystem?.FirstAvailableRecipe(State);
        public EvolutionRecipeConfig AvailableRecipe =>
            _recipeSystem?.FindRecipe(AvailableRecipeId);
        public CardState SelectedCard =>
            _selectedSlotKind == null
                ? null
                : CardAt(_selectedSlotKind.Value, _selectedSlotIndex);
        public bool HasCardDrag => _draggedSlotKind != null;
        public DeveloperToolsSystem DeveloperTools => _developerTools;
        public RuntimeTuningSystem RuntimeTuning => _runtimeTuning;
        public DeveloperTelemetrySystem Telemetry => _telemetry;
        public VisualCatalog VisualCatalog => _presenter?.VisualCatalog;
        public AudioDirector Audio => _audio;
        public string LastTelemetryExportPath { get; private set; }
        public System.Collections.Generic.IReadOnlyList<TuningPreset>
            TuningPresets => _tuningPresets?.Presets;
        public string TuningImportPath => _tuningPresets?.ImportPath;

        private void Awake()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EnemiesConfig enemies = GameConfigLoader.LoadEnemies();
            WavesConfig waves = GameConfigLoader.LoadWaves();
            _totalWaves = waves.totalWaves;
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            EvolutionRecipesConfig recipes =
                GameConfigLoader.LoadEvolutionRecipes();
            DifficultyConfig difficulty = GameConfigLoader.LoadDifficulty();
            ProgressionConfig progression = GameConfigLoader.LoadProgression();
            RewardMeterConfig rewardMeter = GameConfigLoader.LoadRewardMeter();
            SettlementConfig settlement = GameConfigLoader.LoadSettlement();
            RecipeProductEffectsConfig recipeProductEffects =
                GameConfigLoader.LoadRecipeProductEffects();
            EvolutionBranchEffectsConfig evolutionBranchEffects =
                GameConfigLoader.LoadEvolutionBranchEffects();
            GodsConfig gods = GameConfigLoader.LoadGods();
            CardsConfig cards = GameConfigLoader.LoadCards();
            CardAffixesConfig affixes =
                GameConfigLoader.LoadCardAffixes();
            EvolutionTextConfig evolutionText =
                GameConfigLoader.LoadEvolutionText();
            RelicsConfig relics = GameConfigLoader.LoadRelics();
            BountyConfig bounty = GameConfigLoader.LoadBounty();
            WaveRewardsConfig waveRewards =
                GameConfigLoader.LoadWaveRewards();
            CardsConfigValidator.ThrowIfInvalid(
                cards,
                gods,
                recipes);
            var cardCatalog = new CardCatalog(cards);
            var cardAffixCatalog = new CardAffixCatalog(
                affixes,
                cardCatalog);
            _ = new RecipeProductEffectCatalog(
                recipeProductEffects,
                cardCatalog);
            _ = new EvolutionBranchEffectCatalog(
                evolutionBranchEffects,
                cards);

            GameState state = GameStateFactory.Create(combat, economy);
            state.AttachSettlement(
                new SettlementSystem(
                    settlement,
                    waves.totalWaves));
            int seed = _requestedSeed ?? System.Environment.TickCount;
            _requestedSeed = null;
            var random = new SystemRandomSource(seed);
            var cardAffixSystem = new CardAffixSystem(
                cardAffixCatalog,
                random);
            _rewardMeterSystem = new RewardMeterSystem(
                rewardMeter,
                random,
                cardCatalog);
            _rewardMeterSystem.Initialize(state);
            _recipeSystem = new RecipeSystem(
                recipes,
                cardAffixSystem,
                economy.evolution,
                cardCatalog,
                economy.mergeCopies);
            var difficultySystem =
                new DifficultySystem(difficulty, waves.totalWaves);
            var cardPoolSystem = new CardPoolSystem(
                random,
                economy,
                cardCatalog,
                recipes);
            _godPoolSystem = new GodPoolSystem(gods, random);
            _cardInventory = new CardInventorySystem(
                economy,
                cardPoolSystem,
                cardCatalog,
                cardAffixSystem,
                _recipeSystem);
            state.AttachInventory(_cardInventory);
            var enemyFactory = new EnemyFactory(
                combat,
                enemies,
                waves,
                random,
                difficultySystem);
            _dropSystem = new DropSystem(
                economy,
                random,
                _rewardMeterSystem,
                cardPoolSystem,
                waves);
            _bountySystem = new BountySystem(
                bounty,
                combat,
                waves,
                enemyFactory,
                cardPoolSystem,
                _dropSystem,
                random);
            var waveRewardSystem = new WaveRewardSystem(
                waveRewards,
                combat);
            _waveSystem = new WaveSystem(
                waves,
                enemyFactory,
                _godPoolSystem,
                cardPoolSystem,
                _bountySystem,
                waveRewardSystem);
            _combatSystem = new CombatSystem(
                combat,
                enemies,
                _dropSystem,
                _rewardMeterSystem,
                _bountySystem);
            _rewardMeterSystem.AttachDamageHandler(
                _combatSystem.ApplyRewardDamage);

            _world = new CombatWorld(
                _combatSystem,
                _waveSystem,
                _dropSystem,
                _bountySystem);
            _simulation = new GameSimulation(state, combat);
            _simulation.SimulationStep += _world.Step;
            _developerTools = new DeveloperToolsSystem(
                state,
                _simulation,
                _waveSystem,
                random,
                Application.isEditor || Debug.isDebugBuild);
            _runtimeTuning = new RuntimeTuningSystem(
                combat,
                enemies,
                waves,
                economy,
                bounty,
                progression);
            if (_developerTools.Enabled)
            {
                _tuningPresets = new TuningPresetStore(
                    System.IO.Path.Combine(
                        Application.persistentDataPath,
                        "tuning"));
                _telemetry = new DeveloperTelemetrySystem(
                    state,
                    seed,
                    Application.version,
                    combat,
                    enemies,
                    waves,
                    economy,
                    bounty,
                    progression,
                    difficulty,
                    gods,
                    cards,
                    affixes,
                    relics,
                    recipes,
                    evolutionText,
                    waveRewards,
                    () => _runtimeTuning.AppliedPresetName,
                    autoExportDirectory: System.IO.Path.Combine(
                        Application.persistentDataPath,
                        "telemetry"),
                    rewardMeter: rewardMeter,
                    settlement: settlement,
                    recipeProductEffects: recipeProductEffects,
                    evolutionBranchEffects: evolutionBranchEffects);
                _simulation.SimulationStep += _telemetry.Step;
            }

            _presenter = gameObject.AddComponent<ArenaPresenter>();
            _presenter.Initialize(combat, state);
            _audio = gameObject.AddComponent<AudioDirector>();
            _audio.Initialize(state, _presenter);
            gameObject.AddComponent<GameHud>().Initialize(this);
            _presenter.Sync();
        }

        private void Update()
        {
            HandleKeyboard();
            HandleDropPickup();
            _recipeSystem?.RefreshState(State);
            _recipeSystem?.TryGrantMaterialAssistance(State);
            _simulation.AdvanceFrame(Time.unscaledDeltaTime);
            _presenter.Sync();
        }

        public void StartGame()
        {
            _audio?.Play("ui.button", AudioBus.Ui);
            if (State.Mode != GameMode.Ready)
            {
                return;
            }

            State.StartRun();
            _telemetry?.RecordInput(State, "startRun");
            if (!_godPoolSystem.OfferInitial(State))
            {
                _waveSystem.StartNextWave(State);
            }
        }

        public void SelectDifficulty(int optionIndex)
        {
            DifficultyId difficulty = optionIndex <= 0
                ? DifficultyId.Relaxed
                : optionIndex == 1
                    ? DifficultyId.Standard
                    : optionIndex == 2
                        ? DifficultyId.Hard
                        : DifficultyId.Hell;
            State.SelectDifficulty(difficulty);
        }

        public void ChooseLevelUpgrade(int optionIndex)
        {
            if (State?.PendingLevelUpgrade != null)
            {
                LastCardAction = "旧版遗物选择已停用。";
            }
        }

        public void ConfirmRewardReceipt()
        {
            if (_rewardMeterSystem != null
                && _rewardMeterSystem.ConfirmReceipt(State))
            {
                _audio?.Play("sfx.level");
                _telemetry?.RecordInput(
                    State,
                    "rewardConfirmed");
                LastCardAction = "奖励结算完成，战斗继续。";
            }
        }

        public void ChooseGod(int optionIndex)
        {
            if (_godPoolSystem == null
                || !_godPoolSystem.Choose(State, optionIndex))
            {
                return;
            }

            _audio?.Play("ui.button", AudioBus.Ui);
            _telemetry?.RecordInput(
                State,
                "decision_resolved",
                "god:" + optionIndex);
            LastCardAction = "神祇选择已生效。";
            if (State.Wave == 0 && State.PendingGodChoice == null)
            {
                _waveSystem.StartNextWave(State);
            }
        }

        public void ChooseWaveReward(int optionIndex)
        {
            if (_waveSystem.ChooseWaveReward(State, optionIndex))
            {
                _telemetry?.RecordInput(
                    State,
                    "decision_resolved",
                    "waveReward:" + optionIndex);
                LastCardAction = "波次成长已生效。";
            }
        }

        public void TogglePause()
        {
            _audio?.Play("ui.button", AudioBus.Ui);
            if (State.Mode == GameMode.Playing)
            {
                State.SetPaused(!State.Paused);
            }
        }

        public void SetTimeScale(float timeScale)
        {
            _simulation.SetTimeScale(timeScale);
        }

        public string ExportTelemetry()
        {
            if (_telemetry == null)
            {
                LastTelemetryExportPath = "Telemetry is disabled.";
                return LastTelemetryExportPath;
            }

            LastTelemetryExportPath = _telemetry.Export(
                System.IO.Path.Combine(
                    Application.persistentDataPath,
                    "telemetry"));
            return LastTelemetryExportPath;
        }

        public void RestartWithSeed(int seed)
        {
            if (!_developerTools.Enabled)
            {
                return;
            }

            _requestedSeed = seed;
            SceneManager.LoadScene(
                SceneManager.GetActiveScene().buildIndex);
        }

        public string SaveTuningPreset(string name)
        {
            if (_tuningPresets == null || string.IsNullOrWhiteSpace(name))
            {
                return "Enter a preset name.";
            }

            TuningPreset preset = _runtimeTuning.CapturePreset(name);
            return _tuningPresets.Save(preset);
        }

        public int LoadTuningPreset(int index)
        {
            if (_tuningPresets == null
                || index < 0
                || index >= _tuningPresets.Presets.Count)
            {
                return -1;
            }

            return _runtimeTuning.ApplyPreset(
                _tuningPresets.Presets[index]);
        }

        public bool DeleteTuningPreset(int index)
        {
            return _tuningPresets != null
                && _tuningPresets.DeleteAt(index);
        }

        public int ImportTuningPreset()
        {
            TuningPreset preset = _tuningPresets?.Import();
            return preset == null
                ? -1
                : _runtimeTuning.ApplyPreset(preset);
        }

        public void RestartGame()
        {
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        public void ClaimBossReward()
        {
            _waveSystem.ClaimBossReward(State);
            _audio?.Play("sfx.reward");
            _telemetry?.RecordInput(State, "bossRewardGranted");
        }

        public void ConfirmNextWave()
        {
            _audio?.Play("ui.button", AudioBus.Ui);
            _waveSystem.ConfirmIntermissionReady(State);
        }

        public bool IsCardSlotSelected(CardSlotKind kind, int index)
        {
            return _selectedSlotKind == kind && _selectedSlotIndex == index;
        }

        public void SelectCardSlot(CardSlotKind kind, int index)
        {
            _audio?.Play("ui.button", AudioBus.Ui);
            CardState card = CardAt(kind, index);
            if (_selectedSlotKind == null)
            {
                if (card == null)
                {
                    LastCardAction = "这个槽位是空的。";
                    return;
                }

                _selectedSlotKind = kind;
                _selectedSlotIndex = index;
                LastCardAction =
                    $"已选择 {card.Star}★ "
                    + CardCatalog.Default.DisplayName(card.Type)
                    + AffixSummary(card);
                return;
            }

            if (_selectedSlotKind == kind && _selectedSlotIndex == index)
            {
                ClearCardSelection("已取消选择。");
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

        private static string AffixSummary(CardState card)
        {
            if (card == null || card.Affixes.Count == 0)
            {
                return "。";
            }

            string text = "；词缀：";
            for (int index = 0; index < card.Affixes.Count; index++)
            {
                CardAffixRoll roll = card.Affixes[index];
                if (index > 0)
                {
                    text += "、";
                }

                text += AffixName(roll.Stat)
                    + "+"
                    + FormatAffixValue(roll);
            }

            return text + "。";
        }

        private static string FormatAffixValue(CardAffixRoll roll)
        {
            bool percentage = roll.Stat.EndsWith("Mul");
            return percentage
                ? Mathf.RoundToInt(roll.Value * 100f) + "%"
                : roll.Value.ToString("0.##");
        }

        private static string AffixName(string stat)
        {
            switch (stat)
            {
                case "damageMul": return "伤害倍率";
                case "fireRateMul": return "攻速倍率";
                case "maxHpMul": return "生命倍率";
                case "effectDamageMul": return "效果伤害";
                case "quantityAdd": return "效果数量";
                case "controlPotencyMul": return "控制强度";
                case "controlledDamageTakenMul": return "受控增伤";
                case "areaScaleMul": return "范围";
                case "dotDamageMul": return "持续伤害";
                case "defenseDurabilityMul": return "防御耐久";
                case "retaliationMul": return "反击";
                case "dropRateMul": return "掉率";
                case "dropLifetimeMul": return "掉落时限";
                case "xpMul": return "经验";
                default: return stat;
            }
        }

        public void ConsumeSelectedCard()
        {
            if (_selectedSlotKind == null)
            {
                LastCardAction = "请先选择一张卡牌。";
                return;
            }

            CardState card = CardAt(
                _selectedSlotKind.Value,
                _selectedSlotIndex);
            if (!CombatSystem.SupportsConsumable(card))
            {
                LastCardAction =
                    "这张卡牌的主动效果尚未迁移。";
                return;
            }

            _pendingCastSlotKind = _selectedSlotKind;
            _pendingCastSlotIndex = _selectedSlotIndex;
            _castArmedFrame = Time.frameCount;
            ClearCardSelection(
                $"已瞄准 {card.Star}★ {card.Type}，请点击战场。");
        }

        public void BeginCardDrag(CardSlotKind kind, int index)
        {
            CardState card = CardAt(kind, index);
            if (card == null)
            {
                return;
            }

            _draggedSlotKind = kind;
            _draggedSlotIndex = index;
            LastCardAction =
                $"正在拖动 {card.Star}★ {card.Type}。";
        }

        public void CancelCardDrag()
        {
            _draggedSlotKind = null;
            _draggedSlotIndex = -1;
        }

        public void ReleaseCardDragToSlot(
            CardSlotKind targetKind,
            int targetIndex)
        {
            if (_draggedSlotKind == null)
            {
                return;
            }

            CardMoveResult result = _cardInventory.MoveOrSwap(
                State,
                _draggedSlotKind.Value,
                _draggedSlotIndex,
                targetKind,
                targetIndex);
            _telemetry?.RecordInput(State, "dragDrop", result.ToString());
            ClearCardSelection(CardActionText(result));
            CancelCardDrag();
        }

        public void ReleaseCardDrag(Vector2 guiPosition)
        {
            if (_draggedSlotKind == null)
            {
                return;
            }

            CardSlotKind kind = _draggedSlotKind.Value;
            int index = _draggedSlotIndex;
            CardState card = CardAt(kind, index);
            if (!CombatSystem.SupportsConsumable(card))
            {
                LastCardAction = "这张卡牌不能拖到战场施放。";
                CancelCardDrag();
                return;
            }

            Vector3 screenPoint = new Vector3(
                guiPosition.x,
                Screen.height - guiPosition.y,
                0f);
            bool hasPoint = _presenter.TryScreenToArenaPoint(
                screenPoint,
                out Float2 arenaPoint);
            bool cast = hasPoint
                && _combatSystem.CastConsumable(
                    State,
                    card,
                    arenaPoint);
            if (cast)
            {
                _presenter.PlayVfx(
                    "card.cast",
                    arenaPoint,
                    new Color(0.68f, 0.9f, 1f, 0.95f),
                    56f,
                    0.48f);
                _cardInventory.Consume(State, kind, index);
                _telemetry?.RecordInput(
                    State,
                    "consumeRelease",
                    card.Type);
                ClearCardSelection(
                    $"已拖拽施放 {card.Star}★ {card.Type}。");
            }
            else
            {
                LastCardAction =
                    "没有有效目标，卡牌未消耗。";
            }

            CancelCardDrag();
        }

        public void GrantTestCards()
        {
            State.GrantReward(new RunReward(RewardKind.Card, 3, 3, "debug"));
            LastCardAction = "已加入三张 3★ 测试卡牌。";
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
                "已生成必掉卡牌，请在消失前点击拾取。";
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
                "已加入四张冲击牌及各星级万能牌。";
        }

        public void UseWildcardOnSelected()
        {
            if (_selectedSlotKind == null)
            {
                LastCardAction = "使用万能牌前请先选择卡牌。";
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
                _audio?.Play("sfx.level");
                _telemetry?.RecordInput(
                    State,
                    "decision_resolved",
                    "evolution:" + optionIndex);
                LastCardAction =
                    $"已选择进化路线：{choice.Options[optionIndex]}。";
            }
        }

        public void GrantRecipeDemo()
        {
            if (State.PendingEvolution != null)
            {
                LastCardAction = "请先完成当前进化选择。";
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
                AddResolvedDemoCard("meteor");
                AddResolvedDemoCard("pierce");
                LastCardAction =
                    "已加入 5★ 穿透与灼烧配方材料。";
            }
            else
            {
                LastCardAction = "需要两个空手牌槽位。";
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
                ? $"已加入 {added} 张效果测试卡牌。"
                : "请腾出手牌槽位，再按 B 加入效果卡牌。";
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
                ? $"已加入 {added} 张 5★ 进阶效果卡牌。"
                : "请腾出手牌槽位，再按 N 加入进阶卡牌。";
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
                ? $"已加入 {added} 张 6★ 终阶卡牌。"
                : "请腾出手牌槽位，再按 U 加入终阶卡牌。";
        }

        public void CraftAvailableRecipe()
        {
            string recipeId = AvailableRecipeId;
            RecipeCraftResult result = _recipeSystem.Craft(
                State,
                recipeId);
            LastCardAction = result == RecipeCraftResult.Crafted
                ? $"已合成固定配方：{recipeId}。"
                : RecipeActionText(result);
        }

        private void HandleKeyboard()
        {
            if (Input.GetKeyDown(KeyCode.F1))
            {
                _developerTools.ToggleVisible();
            }

            if (_developerTools.Enabled)
            {
                HandleDeveloperKeyboard();
            }

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

            if (Input.GetKeyDown(KeyCode.C))
            {
                ConsumeSelectedCard();
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

        private void HandleDeveloperKeyboard()
        {
            if (Input.GetKeyDown(KeyCode.F2))
            {
                _developerTools.ToggleInvincible();
            }

            if (Input.GetKeyDown(KeyCode.F3))
            {
                _developerTools.RestartWave();
            }

            if (Input.GetKeyDown(KeyCode.LeftBracket))
            {
                _developerTools.JumpToWave(State.Wave - 1);
            }

            if (Input.GetKeyDown(KeyCode.RightBracket))
            {
                _developerTools.JumpToWave(State.Wave + 1);
            }

            if (Input.GetKeyDown(KeyCode.G))
            {
                GrantTestCards();
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
        }

        private void HandleDropPickup()
        {
            Vector2 guiPoint = new Vector2(
                Input.mousePosition.x,
                Screen.height - Input.mousePosition.y);
            if (!Input.GetMouseButtonDown(0)
                || _dropSystem == null
                || !MobileHudLayout.ArenaRect(MobileViewportRect)
                    .Contains(guiPoint)
                || !_presenter.TryScreenToArenaPoint(
                    Input.mousePosition,
                    out Float2 arenaPoint))
            {
                return;
            }

            if (_pendingCastSlotKind != null
                && Time.frameCount > _castArmedFrame)
            {
                CardState card = CardAt(
                    _pendingCastSlotKind.Value,
                    _pendingCastSlotIndex);
                bool cast = _combatSystem.CastConsumable(
                    State,
                    card,
                    arenaPoint);
                if (cast)
                {
                    _presenter.PlayVfx(
                        "card.cast",
                        arenaPoint,
                        new Color(0.68f, 0.9f, 1f, 0.95f),
                        56f,
                        0.48f);
                    _cardInventory.Consume(
                        State,
                        _pendingCastSlotKind.Value,
                        _pendingCastSlotIndex);
                    LastCardAction =
                        $"已施放 {card.Star}★ {card.Type}。";
                    _pendingCastSlotKind = null;
                    _pendingCastSlotIndex = -1;
                }
                else
                {
                    LastCardAction =
                        "没有有效目标，请再次点击战场。";
                }

                return;
            }

            if (_bountySystem != null
                && _bountySystem.AcceptAt(State, arenaPoint))
            {
                _telemetry?.RecordInput(State, "bountyAccept");
                LastCardAction = "已接受悬赏，消灭全部悬赏敌人可获得奖励。";
                return;
            }

            DropCollectResult result =
                _dropSystem.CollectNearest(State, arenaPoint);
            if (result == DropCollectResult.Collected)
            {
                _presenter.PlayVfx(
                    "hook",
                    arenaPoint,
                    new Color(1f, 0.86f, 0.26f, 0.9f),
                    42f,
                    0.34f);
                _telemetry?.RecordInput(State, "pickupClick");
                LastCardAction = "已拾取掉落卡牌。";
            }
            else if (result == DropCollectResult.HandFull)
            {
                LastCardAction =
                    "手牌已满，请腾出槽位后再次点击掉落物。";
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
                CardDefinitionConfig definition =
                    CardCatalog.Default.Find(type);
                if (definition?.recipeOnly != true)
                {
                    if ((definition?.evolution3?.Length ?? 0) > 0)
                        card.EvolutionPath.Add(
                            $"3:{definition.evolution3[0]}");
                    if (star >= 5
                        && (definition?.evolution5?.Length ?? 0) > 0)
                        card.EvolutionPath.Add(
                            $"5:{definition.evolution5[0]}");
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
                int branchIndex = branch == "B" ? 1 : branch == "C" ? 2 : 0;
                CardDefinitionConfig definition =
                    CardCatalog.Default.Find(type);
                card.EvolutionPath.Add(
                    $"3:{definition.evolution3[branchIndex]}");
                card.EvolutionPath.Add(
                    $"5:{definition.evolution5[branchIndex]}");
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
                CardDefinitionConfig definition =
                    CardCatalog.Default.Find(type);
                if (definition?.recipeOnly != true)
                {
                    if ((definition?.evolution3?.Length ?? 0) > 0)
                        card.EvolutionPath.Add(
                            $"3:{definition.evolution3[0]}");
                    if ((definition?.evolution5?.Length ?? 0) > 0)
                        card.EvolutionPath.Add(
                            $"5:{definition.evolution5[0]}");
                }
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
                    return "卡牌已移动。";
                case CardMoveResult.Swapped:
                    return "卡牌已交换。";
                case CardMoveResult.Fed:
                    return "同类装备已吞噬并升级。";
                case CardMoveResult.RecipeCrafted:
                    return "配方材料已合成为 6★ 终态卡。";
                case CardMoveResult.RecipeRejected:
                    return "当前暂停、决策或波次状态不能执行配方。";
                case CardMoveResult.StarTooLow:
                    return "装备槽只能放入 3★ 或以上卡牌。";
                case CardMoveResult.DuplicateType:
                    return "同类卡牌只能装备一张。";
                case CardMoveResult.EquipmentLocked:
                    return "当前装备操作已锁定。";
                case CardMoveResult.EvolutionPending:
                    return "装备前请先完成这张卡的进化选择。";
                case CardMoveResult.EmptySource:
                    return "所选来源槽位为空。";
                default:
                    return "没有移动卡牌。";
            }
        }

        private static string WildcardActionText(WildcardUseResult result)
        {
            switch (result)
            {
                case WildcardUseResult.Upgraded:
                    return "已消耗万能牌，卡牌完成升级。";
                case WildcardUseResult.MaxStar:
                    return "6★ 卡牌无法继续升级。";
                case WildcardUseResult.MissingWildcard:
                    return "没有与当前星级匹配的万能牌。";
                case WildcardUseResult.EvolutionPending:
                    return "请先完成待处理的进化选择。";
                default:
                    return "请选择一个非空卡牌槽位。";
            }
        }

        private static string RecipeActionText(RecipeCraftResult result)
        {
            switch (result)
            {
                case RecipeCraftResult.WrongPhase:
                    return "固定配方只能在波次间合成。";
                case RecipeCraftResult.MissingMaterials:
                    return "固定配方材料不足。";
                case RecipeCraftResult.HandFull:
                    return "需要空手牌槽位来接收合成结果。";
                case RecipeCraftResult.AlreadyCompleted:
                    return "该固定配方已经完成。";
                case RecipeCraftResult.LimitReached:
                    return "本局最多完成两个终态配方。";
                default:
                    return "当前没有可用的固定配方。";
            }
        }

        private void OnDestroy()
        {
            if (_simulation != null && _world != null)
            {
                _simulation.SimulationStep -= _world.Step;
            }

            if (_simulation != null && _telemetry != null)
            {
                _simulation.SimulationStep -= _telemetry.Step;
            }

            _telemetry?.Dispose();
        }
    }
}
