using NUnit.Framework;
using ProjectVL.Core;
using ProjectVL.Presentation;

namespace ProjectVL.Tests
{
    public sealed class MainMenuStateTests
    {
        [Test]
        public void FreshMenuRequiresDifficultyBeforeStarting()
        {
            var menu = new MainMenuState();

            Assert.That(menu.SelectedDifficulty, Is.Null);
            Assert.That(menu.SelectedDifficultyName, Is.EqualTo("未选择"));
            Assert.That(menu.RequestStart(), Is.False);
            Assert.That(menu.DifficultyPromptVisible, Is.True);
        }

        [TestCase(0, DifficultyId.Relaxed, "轻松")]
        [TestCase(1, DifficultyId.Standard, "标准")]
        [TestCase(2, DifficultyId.Hard, "困难")]
        [TestCase(3, DifficultyId.Hell, "地狱")]
        public void SelectingDifficultyEnablesStart(
            int optionIndex,
            DifficultyId expected,
            string expectedName)
        {
            var menu = new MainMenuState();
            menu.ToggleDifficultyOptions();

            menu.SelectDifficulty(optionIndex);

            Assert.That(menu.SelectedDifficulty, Is.EqualTo(expected));
            Assert.That(menu.SelectedDifficultyName, Is.EqualTo(expectedName));
            Assert.That(menu.DifficultyOptionsVisible, Is.False);
            Assert.That(menu.RequestStart(), Is.True);
            Assert.That(menu.DifficultyPromptVisible, Is.False);
        }
    }
}
