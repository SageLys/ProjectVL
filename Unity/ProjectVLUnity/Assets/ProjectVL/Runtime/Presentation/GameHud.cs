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
            DrawCenterPanel();
        }

        private void DrawTopBar()
        {
            GameState state = _controller.State;
            GUI.Box(new Rect(12f, 12f, 310f, 72f), GUIContent.none);
            GUI.Label(new Rect(24f, 19f, 280f, 28f), "PROJECT VL · TUANJIE", _titleStyle);
            GUI.Label(
                new Rect(24f, 49f, 285f, 26f),
                $"HP {state.Hp:0}/{state.MaxHp:0}   WAVE {state.Wave} "
                + $"{state.WavePhase.ToString().ToUpperInvariant()}   KILLS {state.Kills}",
                _hudStyle);
        }

        private void DrawControls()
        {
            float panelX = Screen.width - 258f;
            GUI.Box(new Rect(panelX, 12f, 246f, 72f), GUIContent.none);

            GameState state = _controller.State;
            string pauseLabel = state.Paused ? "RESUME [P]" : "PAUSE [P]";
            GUI.enabled = state.Mode == GameMode.Playing;
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
