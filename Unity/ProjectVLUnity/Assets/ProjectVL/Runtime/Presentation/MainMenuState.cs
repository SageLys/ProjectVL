using System;
using ProjectVL.Core;

namespace ProjectVL.Presentation
{
    public sealed class MainMenuState
    {
        private static readonly string[] DifficultyNames =
            { "轻松", "标准", "困难", "地狱" };

        public int SelectedDifficultyIndex { get; private set; } = -1;
        public bool DifficultyOptionsVisible { get; private set; }
        public bool DifficultyPromptVisible { get; private set; }
        public string SelectedDifficultyName => SelectedDifficultyIndex < 0
            ? "未选择"
            : DifficultyNames[SelectedDifficultyIndex];
        public DifficultyId? SelectedDifficulty =>
            SelectedDifficultyIndex < 0
                ? (DifficultyId?)null
                : (DifficultyId)SelectedDifficultyIndex;

        public void ToggleDifficultyOptions()
        {
            DifficultyOptionsVisible = !DifficultyOptionsVisible;
            DifficultyPromptVisible = false;
        }

        public void SelectDifficulty(int optionIndex)
        {
            if (optionIndex < 0 || optionIndex >= DifficultyNames.Length)
            {
                throw new ArgumentOutOfRangeException(nameof(optionIndex));
            }

            SelectedDifficultyIndex = optionIndex;
            DifficultyOptionsVisible = false;
            DifficultyPromptVisible = false;
        }

        public bool RequestStart()
        {
            DifficultyOptionsVisible = false;
            DifficultyPromptVisible = SelectedDifficultyIndex < 0;
            return !DifficultyPromptVisible;
        }

        public void DismissDifficultyPrompt()
        {
            DifficultyPromptVisible = false;
        }
    }
}
