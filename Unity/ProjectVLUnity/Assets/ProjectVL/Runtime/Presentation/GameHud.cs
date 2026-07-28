using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class GameHud : MonoBehaviour
    {
        private ProjectVLGameController _controller;
        private GUIStyle _titleStyle;
        private GUIStyle _hudStyle;
        private GUIStyle _centerStyle;
        private GUIStyle _buttonStyle;

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
            DrawTopBar();
            DrawControls();
            DrawCardLoadout();
            DrawCenterPanel();
        }

        private void DrawTopBar()
        {
            GameState state = _controller.State;
            GUI.Box(new Rect(12f, 12f, 440f, 72f), GUIContent.none);
            GUI.Label(new Rect(24f, 19f, 410f, 28f), "PROJECT VL · TUANJIE", _titleStyle);
            GUI.Label(
                new Rect(24f, 49f, 410f, 26f),
                $"HP {state.Hp:0}/{state.MaxHp:0}   WAVE {state.Wave} "
                + $"{state.WavePhase.ToString().ToUpperInvariant()}   "
                + $"KILLS {state.Kills}   MERGES {state.Merges}   "
                + $"DROPS {state.GroundDrops.Count}   SHIELD {state.ShieldHits}",
                _hudStyle);
        }

        private void DrawControls()
        {
            float panelX = Screen.width - 258f;
            GUI.Box(new Rect(panelX, 12f, 246f, 72f), GUIContent.none);

            GameState state = _controller.State;
            string pauseLabel = state.Paused ? "RESUME [P]" : "PAUSE [P]";
            GUI.enabled = state.Mode == GameMode.Playing
                && !state.DecisionLocked
                && !state.IntermissionActive;
            if (GUI.Button(new Rect(panelX + 10f, 24f, 106f, 42f), pauseLabel, _buttonStyle))
            {
                _controller.TogglePause();
            }

            GUI.enabled = true;
            if (GUI.Button(new Rect(panelX + 124f, 24f, 106f, 42f), "RESTART [R]", _buttonStyle))
            {
                _controller.RestartGame();
            }

            GUI.Box(new Rect(panelX, 94f, 246f, 48f), GUIContent.none);
            GUI.Label(new Rect(panelX + 10f, 107f, 72f, 24f), "SPEED", _hudStyle);
            DrawSpeedButton(panelX + 78f, 103f, 0.5f);
            DrawSpeedButton(panelX + 128f, 103f, 1f);
            DrawSpeedButton(panelX + 178f, 103f, 2f);
        }

        private void DrawSpeedButton(float x, float y, float speed)
        {
            bool selected = Mathf.Abs(_controller.TimeScale - speed) < 0.01f;
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = selected
                ? new Color(0.25f, 0.85f, 1f)
                : new Color(0.35f, 0.45f, 0.58f);
            if (GUI.Button(new Rect(x, y, 44f, 30f), $"{speed:0.#}x", _buttonStyle))
            {
                _controller.SetTimeScale(speed);
            }

            GUI.backgroundColor = previous;
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

            float width = 360f;
            float height = 180f;
            float x = (Screen.width - width) / 2f;
            float y = (Screen.height - height) / 2f;
            GUI.Box(new Rect(x, y, width, height), GUIContent.none);

            string title;
            string subtitle;
            string button;
            if (state.Mode == GameMode.Ready)
            {
                title = "PROJECT VL";
                subtitle = "Tuanjie playable migration slice";
                button = "START  [SPACE]";
            }
            else if (state.Mode == GameMode.Ended)
            {
                title = state.Won == true ? "VICTORY" : "RUN ENDED";
                subtitle = $"Wave {state.Wave} · {state.Kills} kills";
                button = "RESTART  [R]";
            }
            else
            {
                title = "PAUSED";
                subtitle = "Press P or Escape to continue";
                button = "RESUME  [P]";
            }

            GUI.Label(new Rect(x + 20f, y + 25f, width - 40f, 42f), title, _centerStyle);
            GUI.Label(new Rect(x + 20f, y + 70f, width - 40f, 28f), subtitle, _hudStyle);
            if (GUI.Button(new Rect(x + 75f, y + 112f, width - 150f, 44f), button, _buttonStyle))
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

        private void DrawEvolutionPanel(EvolutionChoice choice)
        {
            const float width = 560f;
            const float height = 238f;
            Rect panel = new Rect(
                (Screen.width - width) / 2f,
                (Screen.height - height) / 2f,
                width,
                height);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 18f, panel.width - 40f, 42f),
                $"{choice.CheckpointStar} STAR EVOLUTION",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 62f, panel.width - 40f, 30f),
                $"Choose a route for {CardDisplayName(choice.CardType)}",
                _hudStyle);

            float optionWidth = (panel.width - 64f) / 3f;
            for (int i = 0; i < choice.Options.Length && i < 3; i++)
            {
                string label = $"{(char)('A' + i)}\n{RouteLabel(choice.Options[i])}";
                if (GUI.Button(
                    new Rect(
                        panel.x + 20f + i * (optionWidth + 12f),
                        panel.y + 105f,
                        optionWidth,
                        92f),
                    label,
                    _buttonStyle))
                {
                    _controller.ChooseEvolution(i);
                }
            }

            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 204f, panel.width - 40f, 24f),
                "The selected route stays with this card instance.",
                _hudStyle);
        }

        private void DrawCardLoadout()
        {
            GameState state = _controller.State;
            const float slotWidth = 92f;
            const float slotHeight = 58f;
            const float gap = 6f;

            float equipmentX = 12f;
            float equipmentY = 102f;
            GUI.Box(
                new Rect(equipmentX, equipmentY, 132f, 250f),
                GUIContent.none);
            GUI.Label(
                new Rect(equipmentX + 8f, equipmentY + 8f, 116f, 24f),
                "EQUIPMENT",
                _hudStyle);
            for (int i = 0; i < state.Equipment.Length; i++)
            {
                string shortcut = i == 0 ? "Q" : i == 1 ? "W" : i == 2 ? "E" : "-";
                DrawCardSlot(
                    CardSlotKind.Equipment,
                    i,
                    new Rect(
                        equipmentX + 20f,
                        equipmentY + 38f + i * (slotHeight + gap),
                        slotWidth,
                        slotHeight),
                    shortcut);
            }

            float handWidth =
                state.Hand.Length * slotWidth
                + (state.Hand.Length - 1) * gap
                + 24f;
            float handX = (Screen.width - handWidth) / 2f;
            float handY = Screen.height - 112f;
            GUI.Box(
                new Rect(handX, handY, handWidth, 100f),
                GUIContent.none);
            GUI.Label(
                new Rect(handX + 8f, handY + 3f, handWidth - 16f, 22f),
                "HAND  -  select source, then destination",
                _hudStyle);
            for (int i = 0; i < state.Hand.Length; i++)
            {
                DrawCardSlot(
                    CardSlotKind.Hand,
                    i,
                    new Rect(
                        handX + 12f + i * (slotWidth + gap),
                        handY + 29f,
                        slotWidth,
                        slotHeight),
                    (i + 1).ToString());
            }

            float actionX = Screen.width - 258f;
            GUI.Box(new Rect(actionX, 152f, 246f, 232f), GUIContent.none);
            GUI.Label(
                new Rect(actionX + 10f, 159f, 226f, 46f),
                _controller.LastCardAction,
                _hudStyle);
            if (GUI.Button(
                new Rect(actionX + 10f, 211f, 108f, 36f),
                "CAST [C]",
                _buttonStyle))
            {
                _controller.ConsumeSelectedCard();
            }

            if (GUI.Button(
                new Rect(actionX + 128f, 211f, 108f, 36f),
                "TEST CARDS [G]",
                _buttonStyle))
            {
                _controller.GrantTestCards();
            }

            if (GUI.Button(
                new Rect(actionX + 10f, 253f, 108f, 36f),
                "WILDCARD [V]",
                _buttonStyle))
            {
                _controller.UseWildcardOnSelected();
            }

            if (GUI.Button(
                new Rect(actionX + 128f, 253f, 108f, 36f),
                "MERGE DEMO [M]",
                _buttonStyle))
            {
                _controller.GrantMergeDemo();
            }

            GUI.Label(
                new Rect(actionX + 10f, 298f, 226f, 38f),
                WildcardText(state),
                _hudStyle);
            GUI.Label(
                new Rect(actionX + 10f, 341f, 226f, 34f),
                "DROP [T] · ADVANCED [N]\nEFFECT [B] · RECIPE [H/F]",
                _hudStyle);
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
            string text = card == null
                ? $"{shortcut}\nEMPTY"
                : $"{shortcut}  {card.Star} STAR"
                    + $"{(card.Provisional ? " ?" : "")}\n"
                    + CardDisplayName(card.Type);

            Color previous = GUI.backgroundColor;
            if (_controller.IsCardSlotSelected(kind, index))
            {
                GUI.backgroundColor = new Color(0.25f, 0.85f, 1f);
            }
            else if (kind == CardSlotKind.Equipment)
            {
                GUI.backgroundColor = new Color(0.55f, 0.38f, 0.75f);
            }

            if (GUI.Button(rect, text, _buttonStyle))
            {
                _controller.SelectCardSlot(kind, index);
            }

            GUI.backgroundColor = previous;
        }

        private static string WildcardText(GameState state)
        {
            return "WILDCARDS  "
                + $"1:{state.Wildcards[1]}  "
                + $"2:{state.Wildcards[2]}  "
                + $"3:{state.Wildcards[3]}  "
                + $"4:{state.Wildcards[4]}  "
                + $"5:{state.Wildcards[5]}";
        }

        private static string CardDisplayName(string type)
        {
            switch (type)
            {
                case "chainLightning":
                    return "CHAIN";
                case "splitBlast":
                    return "SPLIT";
                default:
                    return type.ToUpperInvariant();
            }
        }

        private static string RouteLabel(string option)
        {
            if (string.IsNullOrEmpty(option))
            {
                return "UNKNOWN";
            }

            char branch = option.EndsWith("A")
                || option.EndsWith("A2")
                    ? 'A'
                    : option.EndsWith("B")
                        || option.EndsWith("B2")
                            ? 'B'
                            : 'C';
            switch (branch)
            {
                case 'A':
                    return "POWER";
                case 'B':
                    return "FOCUS";
                default:
                    return "UTILITY";
            }
        }

        private void DrawRewardPanel(RunReward reward)
        {
            Rect panel = CenterPanelRect();
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 24f, panel.width - 40f, 42f),
                "BOSS REWARD",
                _centerStyle);
            string kind = reward.Kind == RewardKind.Wildcard
                ? "WILDCARD"
                : "CARD";
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 70f, panel.width - 40f, 28f),
                $"{kind}  ·  {reward.Star} STAR  ·  x{reward.Count}",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 112f, panel.width - 150f, 44f),
                "CLAIM  [SPACE]",
                _buttonStyle))
            {
                _controller.ClaimBossReward();
            }
        }

        private void DrawIntermissionPanel(GameState state)
        {
            const float width = 430f;
            const float height = 258f;
            Rect panel = new Rect(
                (Screen.width - width) / 2f,
                (Screen.height - height) / 2f,
                width,
                height);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 24f, panel.width - 40f, 42f),
                "WAVE CLEAR",
                _centerStyle);
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 70f, panel.width - 40f, 28f),
                $"Next wave in {state.IntermissionRemaining:0.0}s  ·  "
                + $"Rewards {state.CollectedRewards.Count}",
                _hudStyle);
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 108f, panel.width - 150f, 42f),
                "NEXT WAVE  [SPACE]",
                _buttonStyle))
            {
                _controller.ConfirmNextWave();
            }

            string recipe = _controller.AvailableRecipeId;
            GUI.Label(
                new Rect(panel.x + 20f, panel.y + 160f, panel.width - 40f, 28f),
                recipe == null
                    ? "FIXED RECIPE: no matching materials"
                    : $"FIXED RECIPE READY: {recipe}",
                _hudStyle);
            GUI.enabled = recipe != null;
            if (GUI.Button(
                new Rect(panel.x + 75f, panel.y + 198f, panel.width - 150f, 42f),
                "CRAFT RECIPE  [F]",
                _buttonStyle))
            {
                _controller.CraftAvailableRecipe();
            }

            GUI.enabled = true;
        }

        private static Rect CenterPanelRect()
        {
            const float width = 360f;
            const float height = 180f;
            return new Rect(
                (Screen.width - width) / 2f,
                (Screen.height - height) / 2f,
                width,
                height);
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
                fontSize = 14,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.85f, 0.92f, 1f) }
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
