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
        public void CardDetailIncludesIdentityEvolutionAffixesAndCastability()
        {
            var card = new CardState(1, "pierce", 5);
            card.EvolutionPath.Add("pierceA");
            card.Affixes.Add(new CardAffixRoll(
                "damageAdd",
                2.5f,
                0f));

            string detail = CardDetailFormatter.Format(card);

            StringAssert.Contains("5★", detail);
            StringAssert.Contains("雷霆贯枪", detail);
            StringAssert.Contains("迅霆", detail);
            StringAssert.Contains("可拖到战场施放", detail);
            StringAssert.Contains("进化：", detail);
            StringAssert.Contains("词缀：伤害 +2.5", detail);
        }

        [Test]
        public void RecipeDetailShowsBothIngredientsAndOutput()
        {
            EvolutionRecipeConfig recipe =
                GameConfigLoader.LoadEvolutionRecipes().recipes[0];

            string detail = CardDetailFormatter.FormatRecipe(recipe);

            StringAssert.Contains("5★ 连环闪电", detail);
            StringAssert.Contains("5★ 霜寒", detail);
            StringAssert.Contains("→ 6★ 霜雷", detail);
        }
    }
}
