using ProjectVL.Core;
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
        private int _selectedDifficulty = 1;

        public void Initialize(ProjectVLGameController controller)
        {
            _controller = controller;
        }

        private void OnGUI()
        {
            if (_controller == null || _controller.State == null)
            {
                return;
            }

            EnsureStyles();
            DrawArenaFrame();
            DrawTopBar();
            DrawControls();
            DrawCardLoadout();
            DrawCenterPanel();
            HandleCardDrag();
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
            Rect bar = new Rect(8f, 6f, Screen.width - 16f, 42f);
            GUI.Box(bar, GUIContent.none);

            float hpWidth = Mathf.Clamp(Screen.width * 0.27f, 108f, 250f);
            DrawProgressBar(
                new Rect(12f, 9f, hpWidth, 8f),
                state.MaxHp <= 0f ? 0f : state.Hp / state.MaxHp,
                new Color(0.95f, 0.35f, 0.58f));
            GUI.Label(
                new Rect(12f, 18f, hpWidth, 22f),
                $"生命 {state.Hp:0}/{state.MaxHp:0}",
                _leftStyle);

            float waveX = hpWidth + 18f;
            GUI.Label(
                new Rect(waveX, 6f, 78f, 36f),
                $"波次 {state.Wave}/{_controller.TotalWaves}",
                _hudStyle);

            int level = 1 + Mathf.FloorToInt(state.Experience / 10f);
            float levelXp = state.Experience % 10f;
            float levelX = waveX + 78f;
            float levelWidth = Mathf.Clamp(
                Screen.width - 146f - levelX,
                72f,
                112f);
            GUI.Label(
                new Rect(levelX, 6f, levelWidth, 20f),
                $"等级 {level} · {levelXp:0.#}/10",
                _leftStyle);
            DrawProgressBar(
                new Rect(levelX, 29f, levelWidth, 7f),
                levelXp / 10f,
                new Color(0.18f, 0.55f, 0.9f));
        }

        private void DrawControls()
        {
            GameState state = _controller.State;
            float x = Screen.width - 140f;
            if (GUI.Button(
                new Rect(x, 11f, 40f, 30f),
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
                new Rect(x + 44f, 11f, 42f, 30f),
                state.Paused ? "继续" : "暂停",
                _buttonStyle))
            {
                _controller.TogglePause();
            }

            GUI.enabled = true;
            if (GUI.Button(
                new Rect(x + 90f, 11f, 50f, 30f),
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

            if (state.IntermissionActive)
            {
                DrawIntermissionPanel(state);
                return;
            }

            if (state.Mode == GameMode.Playing && !state.Paused)
            {
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
            if (state.Mode == GameMode.Ready)
            {
                DrawDifficultyButtons(panel);
                actionY = panel.y + 150f;
            }

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

        private void DrawDifficultyButtons(Rect panel)
        {
            string[] labels = { "轻松", "标准", "困难", "地狱" };
            float width = (panel.width - 52f) / 4f;
            for (int i = 0; i < labels.Length; i++)
            {
                Color previous = GUI.backgroundColor;
                GUI.backgroundColor = i == _selectedDifficulty
                    ? new Color(0.25f, 0.75f, 1f)
                    : new Color(0.25f, 0.32f, 0.43f);
                if (GUI.Button(
                    new Rect(
                        panel.x + 20f + i * (width + 4f),
                        panel.y + 88f,
                        width,
                        30f),
                    labels[i],
                    _buttonStyle))
                {
                    _selectedDifficulty = i;
                }

                GUI.backgroundColor = previous;
            }
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
                new Rect(panel.x + padding, panel.y + 3f, contentWidth, 20f),
                "装备  ·  放入 3★ 以上卡牌",
                _leftStyle);
            float equipmentY = panel.y + 24f;
            for (int i = 0; i < state.Equipment.Length && i < 3; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Equipment,
                    i,
                    new Rect(
                        panel.x + padding + i * (equipmentWidth + gap),
                        equipmentY,
                        equipmentWidth,
                        55f),
                    i == 0 ? "Q" : i == 1 ? "W" : "E");
            }

            float handLabelY = equipmentY + 59f;
            GUI.Label(
                new Rect(panel.x + padding, handLabelY, contentWidth, 20f),
                $"手牌  ·  点击两张卡可移动或交换  ·  {_controller.LastCardAction}",
                _leftStyle);

            float firstRowY = handLabelY + 21f;
            for (int i = 0; i < state.Hand.Length && i < 4; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Hand,
                    i,
                    new Rect(
                        panel.x + padding + i * (handWidth + gap),
                        firstRowY,
                        handWidth,
                        48f),
                    (i + 1).ToString());
            }

            float secondRowY = firstRowY + 54f;
            for (int i = 4; i < state.Hand.Length && i < 7; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Hand,
                    i,
                    new Rect(
                        panel.x + padding + (i - 4) * (handWidth + gap),
                        secondRowY,
                        handWidth,
                        48f),
                    (i + 1).ToString());
            }

            DrawWildcardSlot(
                new Rect(
                    panel.x + padding + 3f * (handWidth + gap),
                    secondRowY,
                    handWidth,
                    48f));
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
                    + CardDisplayName(card.Type);
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

            Event current = Event.current;
            if (card != null
                && current.type == EventType.MouseDown
                && current.button == 0
                && rect.Contains(current.mousePosition))
            {
                _controller.BeginCardDrag(kind, index);
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
                new Rect(rect.x + 4f, rect.y + 1f, rect.width - 8f, 18f),
                "万能",
                _hudStyle);
            GUI.Label(
                new Rect(rect.x + 4f, rect.y + 17f, rect.width - 8f, 30f),
                WildcardText(_controller.State),
                _hudStyle);
            GUI.backgroundColor = previous;
        }

        private void HandleCardDrag()
        {
            if (!_controller.HasCardDrag)
            {
                return;
            }

            Event current = Event.current;
            if (current.type == EventType.Repaint)
            {
                Vector2 mouse = current.mousePosition;
                GUI.Label(
                    new Rect(mouse.x + 18f, mouse.y - 16f, 180f, 32f),
                    "松开到战场施放",
                    _hudStyle);
                return;
            }

            if (current.type != EventType.MouseUp || current.button != 0)
            {
                return;
            }

            if (!ArenaRect().Contains(current.mousePosition))
            {
                _controller.CancelCardDrag();
                return;
            }

            _controller.ReleaseCardDrag(current.mousePosition);
            current.Use();
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
                    $"{(char)('A' + i)}\n{RouteLabel(choice.Options[i])}",
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
                recipe == null ? "固定配方：材料不足" : $"可合成固定配方：{recipe}",
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

        private static Rect ArenaRect()
        {
            float bottomHeight = Mathf.Clamp(Screen.height * 0.28f, 215f, 260f);
            return new Rect(
                8f,
                52f,
                Screen.width - 16f,
                Mathf.Max(180f, Screen.height - bottomHeight - 58f));
        }

        private static Rect LoadoutRect()
        {
            Rect arena = ArenaRect();
            float y = arena.yMax + 5f;
            return new Rect(8f, y, Screen.width - 16f, Screen.height - y - 6f);
        }

        private static Rect CenterPanelRect(float width, float height)
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
                + $"3★×{state.Wildcards[3]}  4★×{state.Wildcards[4]}  "
                + $"5★×{state.Wildcards[5]}";
        }

        private static string CardDisplayName(string type)
        {
            switch (type)
            {
                case "pierce":
                    return "穿透";
                case "chainLightning":
                    return "连锁闪电";
                case "frost":
                    return "冰霜";
                case "scorch":
                    return "灼烧";
                case "splitBlast":
                    return "分裂爆破";
                case "impact":
                    return "冲击";
                case "sanctum":
                    return "圣域";
                case "aegis":
                    return "神盾";
                case "thorns":
                    return "荆棘";
                case "decoy":
                    return "诱饵";
                case "harvest":
                    return "收获";
                case "frozenThunder":
                    return "冰封雷霆";
                case "solarLance":
                    return "日耀长枪";
                case "avalanche":
                    return "雪崩";
                case "pyrestorm":
                    return "烈焰风暴";
                case "crownOfThorns":
                    return "荆棘王冠";
                case "goldenIdol":
                    return "黄金神像";
                default:
                    return type;
            }
        }

        private static string RouteLabel(string option)
        {
            if (string.IsNullOrEmpty(option))
            {
                return "未知";
            }

            if (option.EndsWith("A") || option.EndsWith("A2"))
            {
                return "力量";
            }

            if (option.EndsWith("B") || option.EndsWith("B2"))
            {
                return "专注";
            }

            return "功能";
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
                normal = { textColor = Color.white }
            };
        }
    }
}
