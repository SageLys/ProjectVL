using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Presentation;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class HudPresentationTests
    {
        [TestCase(1080f, 2400f, 0f, 80f, 1080f, 2240f)]
        [TestCase(1920f, 1080f, 80f, 0f, 1760f, 1080f)]
        [TestCase(720f, 1280f, 0f, 0f, 720f, 1280f)]
        public void ReferenceViewportFitsInsidePhysicalSafeArea(
            float screenWidth,
            float screenHeight,
            float safeX,
            float safeY,
            float safeWidth,
            float safeHeight)
        {
            Rect gameViewport =
                new Rect(0f, 0f, screenWidth, screenHeight);
            Rect screenSafe =
                new Rect(safeX, safeY, safeWidth, safeHeight);

            Rect resolved = HudViewportMapper.Resolve(
                gameViewport,
                screenSafe,
                screenHeight);
            Rect guiSafe = new Rect(
                safeX,
                screenHeight - safeY - safeHeight,
                safeWidth,
                safeHeight);

            Assert.That(resolved.xMin, Is.GreaterThanOrEqualTo(guiSafe.xMin));
            Assert.That(resolved.yMin, Is.GreaterThanOrEqualTo(guiSafe.yMin));
            Assert.That(resolved.xMax, Is.LessThanOrEqualTo(guiSafe.xMax));
            Assert.That(resolved.yMax, Is.LessThanOrEqualTo(guiSafe.yMax));
            Assert.That(
                resolved.width / resolved.height,
                Is.EqualTo(402f / 874f).Within(0.0001f));
        }

        [Test]
        public void LoadoutLeavesRequestedGapBelowArena()
        {
            var viewport = new Rect(
                0f,
                0f,
                MobileHudLayout.ReferenceWidth,
                MobileHudLayout.ReferenceHeight);

            Rect arena = MobileHudLayout.ArenaRect(viewport);
            Rect loadout = MobileHudLayout.LoadoutRect(viewport);
            Rect safe = MobileHudLayout.SafeRect(viewport);

            Assert.That(
                loadout.y - arena.yMax,
                Is.EqualTo(MobileHudLayout.LoadoutGap).Within(0.001f));
            Assert.That(loadout.yMax, Is.LessThanOrEqualTo(safe.yMax));
        }

        [Test]
        public void TopBarStacksRewardProgressBelowHealth()
        {
            var viewport = new Rect(
                0f,
                0f,
                MobileHudLayout.ReferenceWidth,
                MobileHudLayout.ReferenceHeight);
            HudTopBarLayout layout = MobileHudLayout.TopBarLayout(viewport);
            float controlsX = MobileHudLayout.ControlStartX(viewport);

            Assert.That(layout.HpLabel.xMax, Is.LessThan(layout.HpBar.xMin));
            Assert.That(layout.RewardBar.yMin, Is.GreaterThan(layout.HpBar.yMax));
            Assert.That(layout.RewardBar.xMax, Is.LessThanOrEqualTo(controlsX));
            Assert.That(layout.WaveLabel.xMax, Is.LessThanOrEqualTo(controlsX));
            Assert.That(layout.Bar.Contains(layout.HpBar.min), Is.True);
            Assert.That(layout.Bar.Contains(layout.RewardBar.max), Is.True);
        }

        [Test]
        public void ConfiguredLowerSpawnBoundaryMatchesArenaBottom()
        {
            var viewport = new Rect(
                0f,
                0f,
                MobileHudLayout.ReferenceWidth,
                MobileHudLayout.ReferenceHeight);
            Rect arena = MobileHudLayout.ArenaRect(viewport);
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            WavesConfig waves = GameConfigLoader.LoadWaves();

            Assert.That(
                combat.canvas.height - waves.bottomSpawnInset,
                Is.EqualTo(arena.yMax).Within(0.001f));
        }

        [Test]
        public void ConfiguredUpperSpawnBoundaryMatchesArenaTop()
        {
            var viewport = new Rect(
                0f,
                0f,
                MobileHudLayout.ReferenceWidth,
                MobileHudLayout.ReferenceHeight);
            Rect arena = MobileHudLayout.ArenaRect(viewport);
            WavesConfig waves = GameConfigLoader.LoadWaves();

            Assert.That(
                waves.topSpawnInset,
                Is.EqualTo(arena.yMin).Within(0.001f));
        }

        [Test]
        public void CardDetailIncludesIdentityEvolutionAffixesAndCastability()
        {
            var card = new CardState(1, "pierce", 5);
            card.EvolutionPath.Add("pierceA");
            card.Affixes.Add(new CardAffixRoll(
                "damageMul",
                0.08f,
                0f));

            string detail = CardDetailFormatter.Format(card);

            StringAssert.Contains("5★", detail);
            StringAssert.Contains("打包处理", detail);
            StringAssert.Contains("迅霆", detail);
            StringAssert.Contains("可拖到战场施放", detail);
            StringAssert.Contains("进化：", detail);
            StringAssert.Contains("词缀：伤害倍率 +8%", detail);
        }

        [Test]
        public void RecipeDetailShowsBothIngredientsAndOutput()
        {
            EvolutionRecipeConfig recipe =
                GameConfigLoader.LoadEvolutionRecipes().recipes[0];

            string detail = CardDetailFormatter.FormatRecipe(recipe);

            StringAssert.Contains("5★ 雨露均沾", detail);
            StringAssert.Contains("5★ 打包处理", detail);
            StringAssert.Contains("→ 6★ 一矛拉出电网", detail);
        }
    }
}
