using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class GameHud : MonoBehaviour
    {
        private ProjectVLGameController _controller;
        private GUIStyle _titleStyle;
        private GUIStyle _hudStyle;
        private GUIStyle _leftStyle;
        private GUIStyle _centerStyle;
        private GUIStyle _buttonStyle;
        private GUIStyle _detailStyle;
        private GUIStyle _mainMenuTitleStyle;
        private GUIStyle _mainMenuButtonStyle;
        private GUIStyle _mainMenuOptionStyle;
        private readonly MainMenuState _mainMenu = new MainMenuState();
        private Vector2 _difficultyScroll;
        private Rect _physicalViewport;
        private float _uiScale = 1f;
        private CardSlotKind? _pressedSlotKind;
        private int _pressedSlotIndex = -1;
        private Vector2 _pressPoint;
        private int _tuningGroup;
        private int _tuningPage;
        private string _seedInput;
        private string _presetName = "playtest";
        private int _presetIndex;
        private string _presetStatus;
        private static readonly string[] TuningGroups =
            { "Combat", "Enemies", "Waves", "Drops", "Progression", "Bounty" };
        private const int TuningPageSize = 10;

        public void Initialize(ProjectVLGameController controller)
        {
            _controller = controller;
        }

        private void Update()
        {
            if (_controller == null || _controller.State == null)
            {
                return;
            }

            RefreshViewport();
            if (_controller.State.Mode == GameMode.Ready)
            {
                ClearPressedSlot();
                return;
            }

            if (_controller.DeveloperTools != null
                && _controller.DeveloperTools.Visible)
            {
                ClearPressedSlot();
                return;
            }

            if (!TryReadPointer(
                out Vector2 guiPosition,
                out bool pressed,
                out bool held,
                out bool released,
                out bool canceled))
            {
                return;
            }

            Vector2 designPointer = ToDesignPoint(guiPosition);
            if (pressed)
            {
                if (TryGetCardSlotAt(
                    designPointer,
                    out CardSlotKind sourceKind,
                    out int sourceIndex))
                {
                    _pressedSlotKind = sourceKind;
                    _pressedSlotIndex = sourceIndex;
                    _pressPoint = designPointer;
                }
                else
                {
                    ClearPressedSlot();
                }
            }

            if (held
                && !_controller.HasCardDrag
                && _pressedSlotKind != null
                && Vector2.Distance(_pressPoint, designPointer) >= 6f)
            {
                _controller.BeginCardDrag(
                    _pressedSlotKind.Value,
                    _pressedSlotIndex);
                ClearPressedSlot();
            }

            if (canceled)
            {
                _controller.CancelCardDrag();
                ClearPressedSlot();
                return;
            }

            if (!released)
            {
                return;
            }

            ClearPressedSlot();
            if (!_controller.HasCardDrag)
            {
                return;
            }

            if (TryGetCardSlotAt(
                designPointer,
                out CardSlotKind targetKind,
                out int targetIndex))
            {
                _controller.ReleaseCardDragToSlot(
                    targetKind,
                    targetIndex);
            }
            else if (ArenaRect().Contains(designPointer))
            {
                _controller.ReleaseCardDrag(guiPosition);
            }
            else
            {
                _controller.CancelCardDrag();
            }
        }

        private void OnGUI()
        {
            if (_controller == null || _controller.State == null)
            {
                return;
            }

            EnsureStyles();
            RefreshViewport();
            Matrix4x4 previousMatrix = GUI.matrix;
            GUI.matrix = Matrix4x4.TRS(
                new Vector3(_physicalViewport.x, _physicalViewport.y, 0f),
                Quaternion.identity,
                new Vector3(_uiScale, _uiScale, 1f));
            if (_controller.State.Mode == GameMode.Ready)
            {
                DrawMainMenu();
                GUI.matrix = previousMatrix;
                return;
            }

            DrawArenaFrame();
            DrawTopBar();
            DrawControls();
            DrawCardLoadout();
            DrawSelectedCardDetail();
            DrawCenterPanel();
            DrawDeveloperPanel();
            GUI.matrix = previousMatrix;
        }

        private void DrawMainMenu()
        {
            Rect viewport = ViewportRect();
            Color previousColor = GUI.color;
            GUI.color = new Color(0.025f, 0.045f, 0.075f, 1f);
            GUI.DrawTexture(viewport, Texture2D.whiteTexture);
            GUI.color = previousColor;

            GUI.color = new Color(0.08f, 0.22f, 0.30f, 0.72f);
            GUI.DrawTexture(new Rect(24f, 72f, 354f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(74f, 232f, 254f, 2f), Texture2D.whiteTexture);
            GUI.color = previousColor;

            GUI.Label(
                new Rect(28f, 94f, 346f, 96f),
                "守住心防",
                _mainMenuTitleStyle);
            GUI.Label(
                new Rect(28f, 184f, 346f, 30f),
                "PROJECT  VL",
                _hudStyle);

            const float buttonX = 69f;
            const float buttonWidth = 264f;
            const float buttonHeight = 58f;
            bool previousEnabled = GUI.enabled;
            GUI.enabled = previousEnabled
                && !_mainMenu.DifficultyPromptVisible;
            if (GUI.Button(
                new Rect(buttonX, 288f, buttonWidth, buttonHeight),
                "进入游戏",
                _mainMenuButtonStyle))
            {
                if (_mainMenu.RequestStart())
                {
                    _controller.StartGame();
                }
            }

            if (GUI.Button(
                new Rect(buttonX, 370f, buttonWidth, buttonHeight),
                $"难度选择  ·  {_mainMenu.SelectedDifficultyName}",
                _mainMenuButtonStyle))
            {
                _mainMenu.ToggleDifficultyOptions();
            }

            float codexY = _mainMenu.DifficultyOptionsVisible ? 640f : 452f;
            if (_mainMenu.DifficultyOptionsVisible)
            {
                DrawDifficultyMenu(buttonX, 438f, buttonWidth);
            }

            GUI.Button(
                new Rect(buttonX, codexY, buttonWidth, buttonHeight),
                "图鉴",
                _mainMenuButtonStyle);
            GUI.Label(
                new Rect(69f, codexY + 63f, 264f, 24f),
                "功能预留",
                _hudStyle);
            GUI.enabled = previousEnabled;

            if (_mainMenu.DifficultyPromptVisible)
            {
                DrawDifficultyPrompt();
            }
        }

        private void DrawDifficultyMenu(float x, float y, float width)
        {
            string[] labels = { "轻松", "标准", "困难", "地狱" };
            Rect scrollRect = new Rect(x, y, width, 180f);
            Rect contentRect = new Rect(0f, 0f, width - 18f, 212f);
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.055f, 0.10f, 0.16f, 0.98f);
            GUI.Box(scrollRect, GUIContent.none);
            GUI.backgroundColor = previous;
            _difficultyScroll = GUI.BeginScrollView(
                scrollRect,
                _difficultyScroll,
                contentRect);
            for (int i = 0; i < labels.Length; i++)
            {
                GUI.backgroundColor = i == _mainMenu.SelectedDifficultyIndex
                    ? new Color(0.22f, 0.72f, 0.88f)
                    : new Color(0.16f, 0.26f, 0.36f);
                if (GUI.Button(
                    new Rect(6f, 5f + i * 51f, width - 34f, 45f),
                    labels[i],
                    _mainMenuOptionStyle))
                {
                    _mainMenu.SelectDifficulty(i);
                    _controller.SelectDifficulty(i);
                }
            }

            GUI.EndScrollView();
            GUI.backgroundColor = previous;
        }

        private void DrawDifficultyPrompt()
        {
            Color previousColor = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.72f);
            GUI.DrawTexture(ViewportRect(), Texture2D.whiteTexture);
            GUI.color = previousColor;

            Rect panel = new Rect(51f, 326f, 300f, 190f);
            Color previousBackground = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.07f, 0.12f, 0.19f, 1f);
            GUI.Box(panel, GUIContent.none);
            GUI.backgroundColor = previousBackground;
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 28f, panel.width - 40f, 52f),
                "请选择难度",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 24f, panel.y + 78f, panel.width - 48f, 34f),
                "选择难度后才能进入游戏",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 72f, panel.y + 126f, panel.width - 144f, 42f),
                "确定",
                _mainMenuButtonStyle))
            {
                _mainMenu.DismissDifficultyPrompt();
            }
        }

        private void DrawDeveloperPanel()
        {
            DeveloperToolsSystem tools = _controller.DeveloperTools;
            RuntimeTuningSystem tuning = _controller.RuntimeTuning;
            if (tools == null
                || tuning == null
                || !tools.Enabled
                || !tools.Visible)
            {
                return;
            }

            Rect panel = new Rect(8f, 48f, 386f, 818f);
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.035f, 0.075f, 0.12f, 0.98f);
            GUI.Box(panel, GUIContent.none);
            GUI.backgroundColor = previous;

            GUI.Label(
                new Rect(panel.x + 10f, panel.y + 6f, 220f, 24f),
                $"DEV TOOLS  seed {tools.Seed}",
                _leftStyle);
            if (GUI.Button(
                new Rect(panel.xMax - 56f, panel.y + 5f, 46f, 24f),
                "Close",
                _buttonStyle))
            {
                tools.SetVisible(false);
                return;
            }

            float y = panel.y + 36f;
            float buttonWidth = 69f;
            if (GUI.Button(new Rect(panel.x + 10f, y, buttonWidth, 26f),
                tools.TimeScale == 0.5f ? "[0.5x]" : "0.5x", _buttonStyle))
                tools.SetTimeScale(0.5f);
            if (GUI.Button(new Rect(panel.x + 83f, y, buttonWidth, 26f),
                tools.TimeScale == 1f ? "[1x]" : "1x", _buttonStyle))
                tools.SetTimeScale(1f);
            if (GUI.Button(new Rect(panel.x + 156f, y, buttonWidth, 26f),
                tools.TimeScale == 2f ? "[2x]" : "2x", _buttonStyle))
                tools.SetTimeScale(2f);
            if (GUI.Button(new Rect(panel.x + 229f, y, buttonWidth, 26f),
                _controller.State.Invincible ? "Invincible ON" : "Invincible",
                _buttonStyle))
                tools.ToggleInvincible();
            if (GUI.Button(new Rect(panel.x + 302f, y, 74f, 26f),
                "Restart", _buttonStyle))
                tools.RestartWave();

            y += 32f;
            if (GUI.Button(new Rect(panel.x + 10f, y, 55f, 24f),
                "Wave -", _buttonStyle))
                tools.JumpToWave(_controller.State.Wave - 1);
            GUI.Label(new Rect(panel.x + 70f, y, 80f, 24f),
                $"Wave {_controller.State.Wave}", _leftStyle);
            if (GUI.Button(new Rect(panel.x + 145f, y, 55f, 24f),
                "Wave +", _buttonStyle))
                tools.JumpToWave(_controller.State.Wave + 1);
            if (GUI.Button(new Rect(panel.x + 273f, y, 103f, 24f),
                "Reset all", _buttonStyle))
                tuning.ResetAll();

            y += 34f;
            if (string.IsNullOrEmpty(_seedInput))
                _seedInput = tools.Seed.ToString();
            GUI.Label(new Rect(panel.x + 10f, y, 42f, 24f),
                "Seed", _leftStyle);
            _seedInput = GUI.TextField(
                new Rect(panel.x + 52f, y, 148f, 24f),
                _seedInput);
            if (GUI.Button(new Rect(panel.x + 206f, y, 170f, 24f),
                "Apply seed & restart", _buttonStyle))
            {
                if (int.TryParse(_seedInput, out int seed))
                    _controller.RestartWithSeed(seed);
                else
                    _presetStatus = "Seed must be an integer.";
            }

            y += 30f;
            GUI.Label(new Rect(panel.x + 10f, y, 48f, 24f),
                "Preset", _leftStyle);
            _presetName = GUI.TextField(
                new Rect(panel.x + 58f, y, 142f, 24f),
                _presetName);
            if (GUI.Button(new Rect(panel.x + 206f, y, 170f, 24f),
                "Save & export JSON", _buttonStyle))
            {
                string path = _controller.SaveTuningPreset(_presetName);
                _presetStatus = System.IO.Path.GetFileName(path);
                int count = _controller.TuningPresets?.Count ?? 0;
                _presetIndex = Mathf.Max(0, count - 1);
            }

            y += 30f;
            var presets = _controller.TuningPresets;
            int presetCount = presets?.Count ?? 0;
            if (presetCount > 0)
                _presetIndex = Mathf.Clamp(_presetIndex, 0, presetCount - 1);
            if (GUI.Button(new Rect(panel.x + 10f, y, 30f, 24f),
                "<", _buttonStyle) && presetCount > 0)
                _presetIndex = (_presetIndex - 1 + presetCount) % presetCount;
            GUI.Label(
                new Rect(panel.x + 44f, y, 112f, 24f),
                presetCount == 0
                    ? "No presets"
                    : presets[_presetIndex].name,
                _leftStyle);
            if (GUI.Button(new Rect(panel.x + 158f, y, 30f, 24f),
                ">", _buttonStyle) && presetCount > 0)
                _presetIndex = (_presetIndex + 1) % presetCount;
            if (GUI.Button(new Rect(panel.x + 192f, y, 54f, 24f),
                "Load", _buttonStyle))
            {
                int changed = _controller.LoadTuningPreset(_presetIndex);
                _presetStatus = changed < 0
                    ? "No preset selected."
                    : $"Loaded, {changed} changed.";
            }
            if (GUI.Button(new Rect(panel.x + 250f, y, 56f, 24f),
                "Delete", _buttonStyle))
            {
                _presetStatus = _controller.DeleteTuningPreset(_presetIndex)
                    ? "Preset deleted."
                    : "No preset selected.";
                _presetIndex = Mathf.Max(0, _presetIndex - 1);
            }
            if (GUI.Button(new Rect(panel.x + 310f, y, 66f, 24f),
                "Import", _buttonStyle))
            {
                int changed = _controller.ImportTuningPreset();
                _presetStatus = changed < 0
                    ? "Place JSON at tuning-import.json."
                    : $"Imported, {changed} changed.";
            }

            y += 26f;
            GUI.Label(
                new Rect(panel.x + 10f, y, 366f, 22f),
                string.IsNullOrEmpty(_presetStatus)
                    ? "Import path: "
                        + System.IO.Path.GetFileName(
                            _controller.TuningImportPath)
                    : _presetStatus,
                _leftStyle);

            y += 26f;
            float tabWidth = 59f;
            for (int i = 0; i < TuningGroups.Length; i++)
            {
                Color tabColor = GUI.backgroundColor;
                if (i == _tuningGroup)
                    GUI.backgroundColor = new Color(0.2f, 0.7f, 0.9f);
                if (GUI.Button(
                    new Rect(panel.x + 10f + i * (tabWidth + 2f), y,
                        tabWidth, 25f),
                    TuningGroups[i],
                    _buttonStyle))
                {
                    _tuningGroup = i;
                    _tuningPage = 0;
                }
                GUI.backgroundColor = tabColor;
            }

            string group = TuningGroups[_tuningGroup];
            y += 34f;
            DeveloperTelemetrySystem telemetry = _controller.Telemetry;
            if (telemetry != null)
            {
                telemetry.GetEnemyPercentiles(
                    _controller.State.Wave,
                    out float p50,
                    out float p95);
                GUI.Label(
                    new Rect(panel.x + 12f, y, 360f, 22f),
                    $"LIVE  enemies {_controller.State.Enemies.Count}"
                    + $"  E1 P50 {p50:0.#} / P95 {p95:0.#}",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 12f, y + 22f, 360f, 22f),
                    $"idle {telemetry.IdleSeconds:0.0}s"
                    + $"  opportunity/10s {telemetry.RecentOpportunities}"
                    + $"  danger {telemetry.DangerEntriesThisWave}"
                    + $"  input/90s {telemetry.First90SecondInputs}",
                    _leftStyle);
                y += 48f;
            }

            int groupCount = 0;
            foreach (TuningParameter parameter in tuning.Parameters)
            {
                if (parameter.Group == group)
                    groupCount++;
            }

            int pageCount = Mathf.Max(
                1,
                Mathf.CeilToInt(groupCount / (float)TuningPageSize));
            _tuningPage = Mathf.Clamp(_tuningPage, 0, pageCount - 1);
            int firstParameter = _tuningPage * TuningPageSize;
            int groupIndex = 0;
            int rendered = 0;
            foreach (TuningParameter parameter in tuning.Parameters)
            {
                if (parameter.Group != group)
                    continue;
                if (groupIndex++ < firstParameter)
                    continue;
                if (rendered++ >= TuningPageSize)
                    break;

                string suffix = parameter.AppliesNextWave ? " *" : string.Empty;
                if (tuning.WasChangedByLastPreset(parameter))
                    suffix += " Δ";
                GUI.Label(
                    new Rect(panel.x + 12f, y, 190f, 22f),
                    parameter.Label + suffix,
                    _leftStyle);
                float value = GUI.HorizontalSlider(
                    new Rect(panel.x + 180f, y + 5f, 130f, 18f),
                    parameter.Value,
                    parameter.Min,
                    parameter.Max);
                parameter.Set(value);
                GUI.Label(
                    new Rect(panel.x + 316f, y, 58f, 22f),
                    parameter.Integer
                        ? parameter.Value.ToString("0")
                        : parameter.Value.ToString("0.##"),
                    _leftStyle);
                y += 29f;
            }

            if (GUI.Button(
                new Rect(panel.x + 12f, y, 54f, 25f),
                "< Page",
                _buttonStyle))
                _tuningPage = (_tuningPage - 1 + pageCount) % pageCount;
            GUI.Label(
                new Rect(panel.x + 72f, y, 92f, 25f),
                $"{_tuningPage + 1} / {pageCount}",
                _centerStyle);
            if (GUI.Button(
                new Rect(panel.x + 170f, y, 54f, 25f),
                "Page >",
                _buttonStyle))
                _tuningPage = (_tuningPage + 1) % pageCount;
            y += 31f;

            if (group == "Bounty")
            {
                if (GUI.Button(
                    new Rect(panel.x + 12f, y, 160f, 25f),
                    tuning.BountyEnabled ? "Bounty enabled" : "Bounty disabled",
                    _buttonStyle))
                    tuning.SetBountyEnabled(!tuning.BountyEnabled);
                y += 31f;
            }

            if (GUI.Button(
                new Rect(panel.x + 216f, panel.yMax - 64f, 160f, 25f),
                "Reset this group",
                _buttonStyle))
                tuning.ResetGroup(group);
            if (GUI.Button(
                new Rect(panel.x + 216f, panel.yMax - 35f, 160f, 25f),
                "Export telemetry",
                _buttonStyle))
                _controller.ExportTelemetry();
            GUI.Label(
                new Rect(panel.x + 12f, panel.yMax - 62f, 190f, 24f),
                "* applies from next wave",
                _leftStyle);
            string exportPath = _controller.LastTelemetryExportPath;
            GUI.Label(
                new Rect(panel.x + 12f, panel.yMax - 35f, 194f, 25f),
                string.IsNullOrEmpty(exportPath)
                    ? $"Events {_controller.Telemetry?.Session.events.Count ?? 0}"
                    : "Saved: " + System.IO.Path.GetFileName(exportPath),
                _leftStyle);
        }

        private void DrawArenaFrame()
        {
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.05f, 0.18f, 0.27f, 0.34f);
            GUI.Box(ArenaRect(), GUIContent.none);
            GUI.backgroundColor = previous;
        }

        private void DrawTopBar()
        {
            GameState state = _controller.State;
            Rect viewport = MobileHudLayout.SafeRect(ViewportRect());
            Rect bar = new Rect(
                viewport.x + 3f,
                viewport.y + 3f,
                viewport.width - 6f,
                38f);
            GUI.Box(bar, GUIContent.none);

            float contentX = bar.x + 4f;
            float hpWidth = bar.width * 0.27f;
            DrawProgressBar(
                new Rect(contentX, bar.y + 3f, hpWidth, 7f),
                state.MaxHp <= 0f ? 0f : state.Hp / state.MaxHp,
                new Color(0.95f, 0.35f, 0.58f));
            GUI.Label(
                new Rect(contentX, bar.y + 11f, hpWidth, 22f),
                $"生命 {state.Hp:0}/{state.MaxHp:0}",
                _leftStyle);

            float waveWidth = bar.width * 0.16f;
            float waveX = contentX + hpWidth;
            GUI.Label(
                new Rect(waveX, bar.y, waveWidth, 34f),
                $"波次 {state.Wave}/{_controller.TotalWaves}",
                _hudStyle);

            float rewardSpan = Mathf.Max(1f, state.RewardThreshold);
            float rewardPoints = Mathf.Max(0f, state.RewardPoints);
            float levelX = waveX + waveWidth;
            float levelWidth = bar.width * 0.22f;
            GUI.Label(
                new Rect(levelX, bar.y, levelWidth, 19f),
                $"欢愉蓄力 · {rewardPoints:0.#}/{rewardSpan:0.#}",
                _leftStyle);
            DrawProgressBar(
                new Rect(levelX, bar.y + 25f, levelWidth, 6f),
                rewardPoints / rewardSpan,
                new Color(0.18f, 0.55f, 0.9f));
        }

        private void DrawControls()
        {
            GameState state = _controller.State;
            Rect viewport = MobileHudLayout.SafeRect(ViewportRect());
            float x = viewport.x + viewport.width * 0.65f;
            float width = viewport.xMax - 4f - x;
            float speedWidth = width * 0.28f;
            float pauseWidth = width * 0.31f;
            float y = viewport.y + 8f;
            if (GUI.Button(
                new Rect(x, y, speedWidth, 28f),
                $"{_controller.TimeScale:0.#}×",
                _buttonStyle))
            {
                float speed = _controller.TimeScale;
                _controller.SetTimeScale(
                    speed < 0.75f ? 1f : speed < 1.5f ? 2f : 0.5f);
            }

            GUI.enabled = state.Mode == GameMode.Playing
                && !state.DecisionLocked
                && !state.IntermissionActive;
            if (GUI.Button(
                new Rect(x + speedWidth + 3f, y, pauseWidth, 28f),
                state.Paused ? "继续" : "暂停",
                _buttonStyle))
            {
                _controller.TogglePause();
            }

            GUI.enabled = true;
            if (GUI.Button(
                new Rect(
                    x + speedWidth + pauseWidth + 6f,
                    y,
                    width - speedWidth - pauseWidth - 6f,
                    28f),
                state.Mode == GameMode.Ready ? "▶ 开始" : "重开",
                _buttonStyle))
            {
                if (state.Mode == GameMode.Ready)
                {
                    _controller.StartGame();
                }
                else
                {
                    _controller.RestartGame();
                }
            }
        }

        private void DrawCenterPanel()
        {
            GameState state = _controller.State;
            if (state.PendingRewardReceipt != null)
            {
                DrawRewardReceiptPanel(state.PendingRewardReceipt);
                return;
            }

            if (state.PendingLevelUpgrade != null)
            {
                DrawLevelUpgradePanel(state.PendingLevelUpgrade);
                return;
            }

            if (state.PendingGodChoice != null)
            {
                DrawGodChoicePanel(state.PendingGodChoice);
                return;
            }

            if (state.PendingEvolution != null)
            {
                DrawEvolutionPanel(state.PendingEvolution);
                return;
            }

            if (state.PendingBossReward != null)
            {
                DrawRewardPanel(state.PendingBossReward);
                return;
            }

            if (state.PendingWaveReward != null)
            {
                DrawWaveRewardPanel(state.PendingWaveReward);
                return;
            }

            if (state.IntermissionActive)
            {
                DrawIntermissionPanel(state);
                return;
            }

            if (state.Mode == GameMode.Playing && !state.Paused)
            {
                return;
            }

            if (state.Mode == GameMode.Ended)
            {
                DrawSettlementPanel(state);
                return;
            }

            Rect arena = ArenaRect();
            float width = Mathf.Min(390f, arena.width - 28f);
            float height = state.Mode == GameMode.Ready ? 220f : 180f;
            Rect panel = new Rect(
                arena.center.x - width / 2f,
                arena.center.y - height / 2f,
                width,
                height);
            GUI.Box(panel, GUIContent.none);

            string title;
            string subtitle;
            string button;
            if (state.Mode == GameMode.Ready)
            {
                title = "守住心防";
                subtitle = "选择难度";
                button = "开始游戏";
            }
            else if (state.Mode == GameMode.Ended)
            {
                title = state.Won == true ? "胜利" : "本局结束";
                subtitle = $"波次 {state.Wave} · 击败 {state.Kills}";
                button = "重新开始";
            }
            else
            {
                title = "游戏暂停";
                subtitle = "按 P 或 Esc 继续";
                button = "继续游戏";
            }

            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 18f, panel.width - 40f, 42f),
                title,
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 60f, panel.width - 40f, 24f),
                subtitle,
                _hudStyle);

            float actionY = panel.y + 112f;
            if (GUI.Button(
                new Rect(panel.x + 75f, actionY, panel.width - 150f, 44f),
                button,
                _buttonStyle))
            {
                if (state.Mode == GameMode.Ready)
                {
                    _controller.StartGame();
                }
                else if (state.Mode == GameMode.Ended)
                {
                    _controller.RestartGame();
                }
                else
                {
                    _controller.TogglePause();
                }
            }
        }

        private void DrawSettlementPanel(GameState state)
        {
            RunSummary summary = state.RunSummary;
            Rect panel = CenterPanelRect(374f, 520f);
            GUI.Box(panel, GUIContent.none);

            string title = summary != null && summary.Won
                ? "守住了！"
                : "防线失守";
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 14f, panel.width - 36f, 38f),
                title,
                _centerStyle);

            if (summary == null)
            {
                GUI.Label(
                    new Rect(panel.x + 20f, panel.y + 62f, panel.width - 40f, 40f),
                    "本局结算数据尚未生成",
                    _hudStyle);
            }
            else
            {
                GUI.Label(
                    new Rect(panel.x + 20f, panel.y + 56f, panel.width - 40f, 34f),
                    $"本局评分  {summary.Score.Total}",
                    _titleStyle);
                GUI.Label(
                    new Rect(panel.x + 20f, panel.y + 91f, panel.width - 40f, 25f),
                    $"{DifficultyName(summary.Difficulty)}  ·  "
                    + $"通过 {summary.ClearedWaves} 波  ·  "
                    + $"触发奖励 {summary.RewardActivations} 次",
                    _hudStyle);

                Rect scoreBox = new Rect(
                    panel.x + 18f,
                    panel.y + 123f,
                    panel.width - 36f,
                    76f);
                GUI.Box(scoreBox, GUIContent.none);
                GUI.Label(
                    new Rect(scoreBox.x + 10f, scoreBox.y + 5f, scoreBox.width - 20f, 30f),
                    $"胜利 {summary.Score.Win}    波次 {summary.Score.Waves}"
                    + $"    击杀 {summary.Score.Kills}",
                    _hudStyle);
                GUI.Label(
                    new Rect(scoreBox.x + 10f, scoreBox.y + 37f, scoreBox.width - 20f, 30f),
                    $"生命 {summary.Score.Hp}    卡组 {summary.Score.Build}"
                    + $"    万能牌 {summary.Score.Wildcards}",
                    _hudStyle);

                string highest = summary.HighestCard == null
                    ? "暂无"
                    : $"{CardDisplayName(summary.HighestCard.Type)} "
                        + $"{summary.HighestCard.Star}★";
                string subGods = summary.SubGods.Count == 0
                    ? "无"
                    : JoinGodNames(summary.SubGods);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 211f, panel.width - 48f, 26f),
                    $"战斗：击杀 {summary.Kills}  ·  "
                    + $"用时 {FormatDuration(summary.DurationSeconds)}  ·  "
                    + $"生命 {Mathf.CeilToInt(summary.Hp)}/{Mathf.CeilToInt(summary.MaxHp)}",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 241f, panel.width - 48f, 26f),
                    $"神祇：主神 {GodName(summary.MainGod)}  ·  副神 {subGods}",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 271f, panel.width - 48f, 26f),
                    $"构筑：最高 {highest}  ·  合成 {summary.Merges} 次",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 301f, panel.width - 48f, 26f),
                    $"欢愉奖励：触发 {summary.RewardActivations} 次"
                    + $"  ·  配方 {summary.CompletedRecipes.Count}",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 331f, panel.width - 48f, 26f),
                    $"成长：选择 {summary.WaveGrowthChoices} 次  ·  "
                    + $"伤害 +{summary.RunDamageAdd:0.##}  ·  "
                    + $"攻速 +{summary.RunFireRateAdd:0.##}",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 361f, panel.width - 48f, 26f),
                    $"成长属性：生命 +{summary.RunMaxHpAdd:0.##}  ·  "
                    + $"射程 +{summary.RunRangeAdd:0.##}  ·  "
                    + $"奖励进度 +{summary.XpGainBonus * 100f:0}%",
                    _leftStyle);
                GUI.Label(
                    new Rect(panel.x + 24f, panel.y + 391f, panel.width - 48f, 26f),
                    $"悬赏：完成 {summary.BountiesCompleted}"
                    + $"/接受 {summary.BountiesAccepted}"
                    + $"  ·  收集奖励 {summary.RewardsCollected}",
                    _leftStyle);
            }

            if (GUI.Button(
                new Rect(panel.x + 72f, panel.yMax - 58f, panel.width - 144f, 42f),
                "重新开始",
                _buttonStyle))
            {
                _controller.RestartGame();
            }
        }

        private static string DifficultyName(DifficultyId difficulty)
        {
            switch (difficulty)
            {
                case DifficultyId.Relaxed:
                    return "轻松";
                case DifficultyId.Hard:
                    return "困难";
                case DifficultyId.Hell:
                    return "地狱";
                default:
                    return "标准";
            }
        }

        private static string JoinGodNames(
            System.Collections.Generic.IReadOnlyList<string> gods)
        {
            string result = "";
            for (int i = 0; i < gods.Count; i++)
            {
                if (i > 0)
                {
                    result += "、";
                }

                result += GodName(gods[i]);
            }

            return result;
        }

        private static string FormatDuration(float seconds)
        {
            int totalSeconds = Mathf.Max(0, Mathf.FloorToInt(seconds));
            return $"{totalSeconds / 60:00}:{totalSeconds % 60:00}";
        }

        private void DrawLevelUpgradePanel(LevelUpgradeChoice choice)
        {
            Rect panel = CenterPanelRect(382f, 270f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 14f, panel.width - 36f, 38f),
                $"等级 {choice.Level} · 选择遗物",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 50f, panel.width - 36f, 24f),
                _controller.State.PendingLevelUpgradeCount > 1
                    ? $"连续升级：还有 {_controller.State.PendingLevelUpgradeCount} 次遗物选择"
                    : "经验已满，选择一件遗物强化本局构筑",
                _hudStyle);

            float gap = 7f;
            float width = (panel.width - 36f - gap * 2f) / 3f;
            for (int index = 0;
                index < choice.Options.Length && index < 3;
                index++)
            {
                var option = choice.Options[index];
                int stacks = _controller.State.UpgradeStacks.TryGetValue(
                    option.Id,
                    out int count)
                    ? count
                    : 0;
                Rect button = new Rect(
                    panel.x + 18f + index * (width + gap),
                    panel.y + 82f,
                    width,
                    154f);
                if (GUI.Button(
                    button,
                    $"{option.Title}\n"
                    + $"{GodName(option.God)} · {RarityName(option.Rarity)}\n\n"
                    + $"{option.Description}\n\n"
                    + $"已选 {stacks} 次",
                    _buttonStyle))
                {
                    _controller.ChooseLevelUpgrade(index);
                }
            }

            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 241f, panel.width - 36f, 20f),
                "选择后战斗自动继续",
                _hudStyle);
        }

        private void DrawRewardReceiptPanel(RewardReceipt receipt)
        {
            Rect panel = CenterPanelRect(382f, 260f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 14f, panel.width - 36f, 38f),
                RewardTitle(receipt.RewardId),
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 24f, panel.y + 58f, panel.width - 48f, 105f),
                RewardResultText(receipt.Result),
                _leftStyle);
            GUI.Label(
                new Rect(panel.x + 24f, panel.y + 166f, panel.width - 48f, 24f),
                $"第 {receipt.ActivationIndex + 1} 次欢愉奖励已结算",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 82f, panel.yMax - 58f, panel.width - 164f, 42f),
                "收下并继续",
                _buttonStyle))
            {
                _controller.ConfirmRewardReceipt();
            }
        }

        private static string RewardTitle(string rewardId)
        {
            switch (rewardId)
            {
                case "heartbreakNova":
                    return "心碎新星";
                case "absoluteStillness":
                    return "绝对静止";
                case "clarityReflux":
                    return "清明回流";
                case "wildHeart":
                    return "狂野之心";
                case "buildResonance":
                    return "构筑共振";
                default:
                    return "欢愉奖励";
            }
        }

        private static string RewardResultText(RewardExecutionResult result)
        {
            if (result == null)
                return "奖励已经生效。";
            if (result.DamageDealt > 0f)
                return $"向全场释放新星，造成 {result.DamageDealt:0} 点伤害，"
                    + $"击败 {result.EnemiesKilled} 名敌人。";
            if (result.FrozenCount > 0)
                return $"冻结并易伤全场 {result.FrozenCount} 名敌人。";
            if (result.HealingGranted > 0f || result.ShieldHitsGranted > 0)
                return $"恢复 {result.HealingGranted:0} 点生命，并获得 "
                    + $"{result.ShieldHitsGranted} 次护盾。";
            if (result.WildcardGrants != null
                && result.WildcardGrants.Length > 0)
            {
                WildcardGrant grant = result.WildcardGrants[0];
                return $"获得 {grant.Count} 张 {grant.Star}★ 万能牌。";
            }
            if (!string.IsNullOrEmpty(result.SurgeTag))
                return $"{BuildTagName(result.SurgeTag)}流派共振 "
                    + $"{result.SurgeDuration:0.#} 秒。";
            return "奖励已经生效。";
        }

        private static string BuildTagName(string tag)
        {
            switch (tag)
            {
                case "projectile": return "弹道";
                case "control": return "控制";
                case "domain": return "领域";
                case "defense": return "防御";
                case "utility": return "资源";
                default: return "当前";
            }
        }

        private void DrawGodChoicePanel(GodChoice choice)
        {
            Rect panel = CenterPanelRect(382f, 270f);
            GUI.Box(panel, GUIContent.none);
            string title = choice.Role == GodChoiceRole.Main
                ? "选择主神"
                : choice.Role == GodChoiceRole.Sub
                    ? "选择副神"
                    : "选择本波重点";
            string body = choice.Role == GodChoiceRole.Focus
                ? "重点神会影响后续卡池和掉落倾向。"
                : "主神和副神共同决定本局卡池范围。";
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 14f, panel.width - 36f, 38f),
                title,
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 52f, panel.width - 36f, 36f),
                body,
                _hudStyle);

            float gap = 8f;
            int count = Mathf.Max(1, choice.Options.Length);
            float width = (panel.width - 36f - gap * (count - 1)) / count;
            for (int index = 0; index < choice.Options.Length; index++)
            {
                GodConfig god = choice.Options[index];
                if (GUI.Button(
                    new Rect(
                        panel.x + 18f + index * (width + gap),
                        panel.y + 98f,
                        width,
                        126f),
                    $"{GodName(god.id)}\n\n{GodTheme(god.id)}",
                    _buttonStyle))
                {
                    _controller.ChooseGod(index);
                }
            }

            GUI.Label(
                new Rect(panel.x + 18f, panel.y + 234f, panel.width - 36f, 24f),
                "选择后自动继续游戏",
                _hudStyle);
        }

        private void DrawCardLoadout()
        {
            GameState state = _controller.State;
            Rect panel = LoadoutRect();
            GUI.Box(panel, GUIContent.none);

            float padding = 8f;
            float gap = 7f;
            float contentWidth = panel.width - padding * 2f;
            float equipmentWidth = (contentWidth - gap * 2f) / 3f;
            float handWidth = (contentWidth - gap * 3f) / 4f;

            GUI.Label(
                new Rect(panel.x + padding, panel.y + 2f, contentWidth, 17f),
                "装备  ·  放入 3★ 以上卡牌",
                _leftStyle);
            float equipmentY = panel.y + 19f;
            for (int i = 0; i < state.Equipment.Length && i < 3; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Equipment,
                    i,
                    new Rect(
                        panel.x + padding + i * (equipmentWidth + gap),
                        equipmentY,
                        equipmentWidth,
                        40f),
                    i == 0 ? "Q" : i == 1 ? "W" : "E");
            }

            float handLabelY = equipmentY + 42f;
            GUI.Label(
                new Rect(panel.x + padding, handLabelY, contentWidth, 17f),
                $"手牌 · 点击卡牌移动或交换 · {_controller.LastCardAction}",
                _leftStyle);

            float firstRowY = handLabelY + 17f;
            for (int i = 0; i < state.Hand.Length && i < 4; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Hand,
                    i,
                    new Rect(
                        panel.x + padding + i * (handWidth + gap),
                        firstRowY,
                        handWidth,
                        38f),
                    (i + 1).ToString());
            }

            float secondRowY = firstRowY + 42f;
            for (int i = 4; i < state.Hand.Length && i < 7; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Hand,
                    i,
                    new Rect(
                        panel.x + padding + (i - 4) * (handWidth + gap),
                        secondRowY,
                        handWidth,
                        38f),
                    (i + 1).ToString());
            }

            DrawWildcardSlot(
                new Rect(
                    panel.x + padding + 3f * (handWidth + gap),
                    secondRowY,
                    handWidth,
                    38f));
        }

        private void DrawSelectedCardDetail()
        {
            GameState state = _controller.State;
            CardState card = _controller.SelectedCard;
            if (card == null
                || state.Mode != GameMode.Playing
                || state.DecisionLocked
                || state.IntermissionActive
                || state.Paused
                || _controller.DeveloperTools?.Visible == true)
                return;

            Rect arena = ArenaRect();
            float width = Mathf.Min(360f, arena.width - 18f);
            Rect panel = new Rect(
                arena.x + 9f,
                arena.yMax - 152f,
                width,
                143f);
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.055f, 0.10f, 0.16f, 0.96f);
            GUI.Box(panel, GUIContent.none);
            GUI.backgroundColor = previous;

            const float artSize = 92f;
            Sprite cardSprite =
                _controller.VisualCatalog?.ResolveCardSprite(card.Type);
            Rect artRect = new Rect(
                panel.x + 9f,
                panel.y + 9f,
                artSize,
                panel.height - 18f);
            if (cardSprite != null)
                DrawSprite(artRect, cardSprite);
            else
            {
                Color oldColor = GUI.color;
                GUI.color = VisualCatalog.DefaultGodAccent(
                    CardCatalog.Default.Find(card.Type)?.god);
                GUI.DrawTexture(artRect, Texture2D.whiteTexture);
                GUI.color = oldColor;
                GUI.Label(artRect, $"{card.Star}★", _centerStyle);
            }

            GUI.Label(
                new Rect(
                    artRect.xMax + 10f,
                    panel.y + 7f,
                    panel.xMax - artRect.xMax - 18f,
                    panel.height - 14f),
                CardDetailFormatter.Format(card),
                _detailStyle);
        }

        private void DrawCardSlot(
            CardSlotKind kind,
            int index,
            Rect rect,
            string shortcut)
        {
            CardState[] slots = kind == CardSlotKind.Hand
                ? _controller.State.Hand
                : _controller.State.Equipment;
            CardState card = slots[index];
            string text;
            if (card == null)
            {
                text = kind == CardSlotKind.Equipment
                    ? "3★+\n＋"
                    : $"＋  [{shortcut}]";
            }
            else
            {
                text = $"{card.Star}★{(card.Provisional ? " ?" : "")}\n"
                    + CardDisplayName(card.Type)
                    + (card.Affixes.Count > 0 ? " ◆" : string.Empty);
            }

            Color previous = GUI.backgroundColor;
            if (_controller.IsCardSlotSelected(kind, index))
            {
                GUI.backgroundColor = new Color(0.25f, 0.85f, 1f);
            }
            else if (kind == CardSlotKind.Equipment)
            {
                GUI.backgroundColor = new Color(0.55f, 0.38f, 0.75f);
            }
            else
            {
                GUI.backgroundColor = new Color(0.18f, 0.32f, 0.45f);
            }

            if (GUI.Button(rect, text, _buttonStyle))
            {
                _controller.SelectCardSlot(kind, index);
            }

            GUI.backgroundColor = previous;
        }

        private void DrawWildcardSlot(Rect rect)
        {
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.55f, 0.38f, 0.75f);
            GUI.Box(rect, GUIContent.none);
            GUI.Label(
                new Rect(rect.x + 4f, rect.y, rect.width - 8f, 15f),
                "万能",
                _hudStyle);
            GUI.Label(
                new Rect(rect.x + 3f, rect.y + 13f, rect.width - 6f, 24f),
                WildcardText(_controller.State),
                _hudStyle);
            GUI.backgroundColor = previous;
        }

        private void RefreshViewport()
        {
            _physicalViewport = HudViewportMapper.Resolve(
                _controller.MobileViewportRect,
                Screen.safeArea,
                Screen.height);
            _uiScale = Mathf.Max(
                0.01f,
                Mathf.Min(
                    _physicalViewport.width / MobileHudLayout.ReferenceWidth,
                    _physicalViewport.height / MobileHudLayout.ReferenceHeight));
        }

        private static bool TryReadPointer(
            out Vector2 guiPosition,
            out bool pressed,
            out bool held,
            out bool released,
            out bool canceled)
        {
            if (Input.touchCount > 0)
            {
                Touch touch = Input.GetTouch(0);
                guiPosition = new Vector2(
                    touch.position.x,
                    Screen.height - touch.position.y);
                pressed = touch.phase == TouchPhase.Began;
                held = touch.phase == TouchPhase.Moved
                    || touch.phase == TouchPhase.Stationary;
                released = touch.phase == TouchPhase.Ended;
                canceled = touch.phase == TouchPhase.Canceled;
                return true;
            }

            pressed = Input.GetMouseButtonDown(0);
            held = Input.GetMouseButton(0);
            released = Input.GetMouseButtonUp(0);
            canceled = false;
            guiPosition = new Vector2(
                Input.mousePosition.x,
                Screen.height - Input.mousePosition.y);
            return pressed || held || released;
        }

        private void ClearPressedSlot()
        {
            _pressedSlotKind = null;
            _pressedSlotIndex = -1;
        }

        private bool TryGetCardSlotAt(
            Vector2 point,
            out CardSlotKind kind,
            out int index)
        {
            GameState state = _controller.State;
            Rect panel = LoadoutRect();
            float padding = 8f;
            float gap = 7f;
            float contentWidth = panel.width - padding * 2f;
            float equipmentWidth = (contentWidth - gap * 2f) / 3f;
            float handWidth = (contentWidth - gap * 3f) / 4f;
            float equipmentY = panel.y + 19f;

            for (int i = 0; i < state.Equipment.Length && i < 3; i++)
            {
                Rect slot = new Rect(
                    panel.x + padding + i * (equipmentWidth + gap),
                    equipmentY,
                    equipmentWidth,
                    40f);
                if (slot.Contains(point))
                {
                    kind = CardSlotKind.Equipment;
                    index = i;
                    return true;
                }
            }

            float firstRowY = equipmentY + 59f;
            for (int i = 0; i < state.Hand.Length && i < 4; i++)
            {
                Rect slot = new Rect(
                    panel.x + padding + i * (handWidth + gap),
                    firstRowY,
                    handWidth,
                    38f);
                if (slot.Contains(point))
                {
                    kind = CardSlotKind.Hand;
                    index = i;
                    return true;
                }
            }

            float secondRowY = firstRowY + 42f;
            for (int i = 4; i < state.Hand.Length && i < 7; i++)
            {
                Rect slot = new Rect(
                    panel.x + padding + (i - 4) * (handWidth + gap),
                    secondRowY,
                    handWidth,
                    38f);
                if (slot.Contains(point))
                {
                    kind = CardSlotKind.Hand;
                    index = i;
                    return true;
                }
            }

            kind = default(CardSlotKind);
            index = -1;
            return false;
        }

        private void DrawEvolutionPanel(EvolutionChoice choice)
        {
            Rect panel = CenterPanelRect(560f, 238f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 18f, panel.width - 40f, 42f),
                $"{choice.CheckpointStar}★ 进化选择",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 62f, panel.width - 40f, 30f),
                $"为 {CardDisplayName(choice.CardType)} 选择路线",
                _hudStyle);

            float optionWidth = (panel.width - 64f) / 3f;
            for (int i = 0; i < choice.Options.Length && i < 3; i++)
            {
                if (GUI.Button(
                    new Rect(
                        panel.x + 20f + i * (optionWidth + 12f),
                        panel.y + 105f,
                        optionWidth,
                        92f),
                    EvolutionLabel(choice.Options[i]),
                    _buttonStyle))
                {
                    _controller.ChooseEvolution(i);
                }
            }

            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 204f, panel.width - 40f, 24f),
                "所选路线将永久保留在这张卡牌上。",
                _hudStyle);
        }

        private void DrawRewardPanel(RunReward reward)
        {
            Rect panel = CenterPanelRect(360f, 180f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 24f, panel.width - 40f, 42f),
                "首领奖励",
                _centerStyle);
            string kind = reward.Kind == RewardKind.Wildcard ? "万能牌" : "卡牌";
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 70f, panel.width - 40f, 28f),
                $"{kind} · {reward.Star}★ · ×{reward.Count}",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 112f, panel.width - 150f, 44f),
                "领取 [空格]",
                _buttonStyle))
            {
                _controller.ClaimBossReward();
            }
        }

        private void DrawIntermissionPanel(GameState state)
        {
            Rect panel = CenterPanelRect(430f, 258f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 24f, panel.width - 40f, 42f),
                "波次完成",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 70f, panel.width - 40f, 28f),
                $"下一波倒计时 {state.IntermissionRemaining:0.0} 秒 · "
                + $"已获奖励 {state.CollectedRewards.Count}",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 108f, panel.width - 150f, 42f),
                "进入下一波 [空格]",
                _buttonStyle))
            {
                _controller.ConfirmNextWave();
            }

            string recipe = _controller.AvailableRecipeId;
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 160f, panel.width - 40f, 28f),
                CardDetailFormatter.FormatRecipe(
                    _controller.AvailableRecipe),
                _hudStyle);
            GUI.enabled = recipe != null;
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 198f, panel.width - 150f, 42f),
                "合成配方 [F]",
                _buttonStyle))
            {
                _controller.CraftAvailableRecipe();
            }

            GUI.enabled = true;
        }

        private void DrawWaveRewardPanel(WaveRewardChoice choice)
        {
            Rect panel = CenterPanelRect(374f, 394f);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 18f, panel.width - 40f, 38f),
                "选择波次成长",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 57f, panel.width - 40f, 24f),
                $"第 {choice.AfterWave} 波完成 · 选择一项永久强化",
                _hudStyle);

            for (int i = 0; i < choice.Options.Count; i++)
            {
                WaveRewardEffectConfig option = choice.Options[i];
                float y = panel.y + 91f + i * 52f;
                bool capped = choice.IsCapped(option.id);
                GUI.enabled = !capped;
                if (GUI.Button(
                    new Rect(panel.x + 28f, y, panel.width - 56f, 43f),
                    WaveRewardLabel(option) + (capped ? "（已达上限）" : ""),
                    _buttonStyle))
                {
                    _controller.ChooseWaveReward(i);
                }

                GUI.enabled = true;
            }

            GUI.Label(
                new Rect(panel.x + 20f, panel.yMax - 35f, panel.width - 40f, 22f),
                "每波只能选择一次，强化持续到本局结束",
                _hudStyle);
        }

        private static string WaveRewardLabel(WaveRewardEffectConfig reward)
        {
            switch (reward.stat)
            {
                case "damageAdd":
                    return $"炮塔伤害 +{reward.add:0.##}";
                case "fireRateAdd":
                    return $"每秒攻速 +{reward.add:0.##}";
                case "maxHpAdd":
                    return $"最大生命 +{reward.add:0.##}";
                case "rangeAdd":
                    return $"攻击射程 +{reward.add:0.##}";
                case "xpGainPct":
                    return $"奖励进度 +{reward.add * 100f:0}%";
                default:
                    return reward.id;
            }
        }

        private static void DrawProgressBar(Rect rect, float ratio, Color color)
        {
            Color previous = GUI.color;
            GUI.color = new Color(0.08f, 0.16f, 0.24f, 1f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = color;
            GUI.DrawTexture(
                new Rect(rect.x, rect.y, rect.width * Mathf.Clamp01(ratio), rect.height),
                Texture2D.whiteTexture);
            GUI.color = previous;
        }

        private static void DrawSprite(Rect rect, Sprite sprite)
        {
            Rect textureRect = sprite.textureRect;
            Rect uv = new Rect(
                textureRect.x / sprite.texture.width,
                textureRect.y / sprite.texture.height,
                textureRect.width / sprite.texture.width,
                textureRect.height / sprite.texture.height);
            GUI.DrawTextureWithTexCoords(
                rect,
                sprite.texture,
                uv,
                true);
        }

        private Rect ViewportRect()
        {
            return new Rect(
                0f,
                0f,
                MobileHudLayout.ReferenceWidth,
                MobileHudLayout.ReferenceHeight);
        }

        private Vector2 ToDesignPoint(Vector2 screenPoint)
        {
            return new Vector2(
                (screenPoint.x - _physicalViewport.x) / _uiScale,
                (screenPoint.y - _physicalViewport.y) / _uiScale);
        }

        private Rect ArenaRect()
        {
            return MobileHudLayout.ArenaRect(ViewportRect());
        }

        private Rect LoadoutRect()
        {
            return MobileHudLayout.LoadoutRect(ViewportRect());
        }

        private Rect CenterPanelRect(float width, float height)
        {
            Rect arena = ArenaRect();
            width = Mathf.Min(width, arena.width - 28f);
            return new Rect(
                arena.center.x - width / 2f,
                arena.center.y - height / 2f,
                width,
                height);
        }

        private static string WildcardText(GameState state)
        {
            return $"1★×{state.Wildcards[1]}  2★×{state.Wildcards[2]}\n"
                + $"3★×{state.Wildcards[3]}  4★×{state.Wildcards[4]} 5★×{state.Wildcards[5]}";
        }

        private static string CardDisplayName(string type)
        {
            return CardCatalog.Default.DisplayName(type);
        }

        private static string GodName(string god)
        {
            switch (god)
            {
                case "storm":
                    return "迅霆";
                case "winter":
                    return "凛冬";
                case "inferno":
                    return "焚狱";
                case "bulwark":
                    return "磐垒";
                case "plenty":
                    return "丰饶";
                default:
                    return "中立";
            }
        }

        private static string GodTheme(string god)
        {
            switch (god)
            {
                case "storm":
                    return "雷霆与速度\n连锁、穿透与攻速";
                case "winter":
                    return "冰封与迟滞\n减速、冻结与增伤";
                case "inferno":
                    return "烈焰与蔓延\n灼烧、区域与爆炸";
                case "bulwark":
                    return "壁垒与反击\n护盾、反伤与召唤";
                case "plenty":
                    return "收获与命运\n掉落、奖励与合成";
                default:
                    return "中立构筑";
            }
        }

        private static string RarityName(string rarity)
        {
            switch (rarity)
            {
                case "rare":
                    return "稀有";
                case "epic":
                    return "史诗";
                default:
                    return "普通";
            }
        }

        private static string EvolutionLabel(string option)
        {
            EvolutionOptionTextConfig text =
                EvolutionTextCatalog.Default.Find(option);
            if (text == null)
            {
                return "未知路线";
            }

            return text.name + "\n" + text.summary;
        }

        private void EnsureStyles()
        {
            if (_titleStyle != null)
            {
                return;
            }

            _titleStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 18,
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.4f, 0.9f, 1f) }
            };
            _hudStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 13,
                alignment = TextAnchor.MiddleCenter,
                wordWrap = true,
                normal = { textColor = new Color(0.85f, 0.92f, 1f) }
            };
            _leftStyle = new GUIStyle(_hudStyle)
            {
                alignment = TextAnchor.MiddleLeft
            };
            _centerStyle = new GUIStyle(_titleStyle)
            {
                fontSize = 30,
                alignment = TextAnchor.MiddleCenter
            };
            _buttonStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = 13,
                fontStyle = FontStyle.Bold,
                wordWrap = true,
                normal = { textColor = Color.white }
            };
            _detailStyle = new GUIStyle(_leftStyle)
            {
                fontSize = 12,
                alignment = TextAnchor.UpperLeft,
                wordWrap = true,
                richText = false
            };
            _mainMenuTitleStyle = new GUIStyle(_centerStyle)
            {
                fontSize = 52,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.72f, 0.94f, 1f) }
            };
            _mainMenuButtonStyle = new GUIStyle(_buttonStyle)
            {
                fontSize = 20,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = Color.white }
            };
            _mainMenuOptionStyle = new GUIStyle(_buttonStyle)
            {
                fontSize = 17,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = Color.white }
            };
        }
    }

    internal static class MobileHudLayout
    {
        public const float ReferenceWidth = 402f;
        public const float ReferenceHeight = 874f;
        private const float SafeTop = 62f;
        private const float SafeBottom = 34f;
        private const float SafeSide = 8f;

        public static Rect SafeRect(Rect viewport)
        {
            float scale = Mathf.Min(
                viewport.width / ReferenceWidth,
                viewport.height / ReferenceHeight);
            return new Rect(
                viewport.x + SafeSide * scale,
                viewport.y + SafeTop * scale,
                viewport.width - SafeSide * 2f * scale,
                viewport.height - (SafeTop + SafeBottom) * scale);
        }

        public static Rect ArenaRect(Rect viewport)
        {
            Rect safe = SafeRect(viewport);
            float scale = Mathf.Min(
                viewport.width / ReferenceWidth,
                viewport.height / ReferenceHeight);
            float topHeight = 44f * scale;
            float loadoutHeight = 188f * scale;
            return new Rect(
                safe.x + 3f * scale,
                safe.y + topHeight,
                safe.width - 6f * scale,
                Mathf.Max(
                    160f * scale,
                    safe.height - topHeight - loadoutHeight - 4f * scale));
        }

        public static Rect LoadoutRect(Rect viewport)
        {
            Rect safe = SafeRect(viewport);
            float scale = Mathf.Min(
                viewport.width / ReferenceWidth,
                viewport.height / ReferenceHeight);
            Rect arena = ArenaRect(viewport);
            float y = arena.yMax + 3f * scale;
            return new Rect(
                safe.x + 3f * scale,
                y,
                safe.width - 6f * scale,
                safe.yMax - y - 3f * scale);
        }
    }

    public static class HudViewportMapper
    {
        public static Rect Resolve(
            Rect gameViewport,
            Rect screenSafeArea,
            float screenHeight)
        {
            Rect guiSafeArea = new Rect(
                screenSafeArea.x,
                screenHeight - screenSafeArea.yMax,
                screenSafeArea.width,
                screenSafeArea.height);
            Rect available = Intersect(gameViewport, guiSafeArea);
            if (available.width <= 0f || available.height <= 0f)
                available = gameViewport;
            return FitReference(available);
        }

        public static Rect FitReference(Rect available)
        {
            float scale = Mathf.Max(
                0.0001f,
                Mathf.Min(
                    available.width / MobileHudLayout.ReferenceWidth,
                    available.height / MobileHudLayout.ReferenceHeight));
            float width = MobileHudLayout.ReferenceWidth * scale;
            float height = MobileHudLayout.ReferenceHeight * scale;
            return new Rect(
                available.center.x - width / 2f,
                available.center.y - height / 2f,
                width,
                height);
        }

        private static Rect Intersect(Rect first, Rect second)
        {
            float xMin = Mathf.Max(first.xMin, second.xMin);
            float yMin = Mathf.Max(first.yMin, second.yMin);
            float xMax = Mathf.Min(first.xMax, second.xMax);
            float yMax = Mathf.Min(first.yMax, second.yMax);
            return Rect.MinMaxRect(
                xMin,
                yMin,
                Mathf.Max(xMin, xMax),
                Mathf.Max(yMin, yMax));
        }
    }
}
