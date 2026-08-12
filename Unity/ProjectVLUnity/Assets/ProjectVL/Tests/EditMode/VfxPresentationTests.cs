using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Presentation;
using ProjectVL.Systems;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class VfxPresentationTests
    {
        [Test]
        public void CombatFeedbackUsesFallbackVfxAndReleasesEveryCue()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            GameState state = GameStateFactory.Create(combat, economy);
            state.StartRun();
            var simulation = new GameSimulation(state, combat);
            var root = new GameObject("VFX Presenter Test");
            GameObject createdCamera = null;
            if (Camera.main == null)
            {
                createdCamera = new GameObject("VFX Test Camera");
                createdCamera.tag = "MainCamera";
                createdCamera.AddComponent<Camera>();
            }

            try
            {
                var presenter = root.AddComponent<ArenaPresenter>();
                presenter.Initialize(combat, state);
                var normal = new EnemyState(
                    1,
                    EnemyKind.Normal,
                    new Float2(100f, 100f),
                    100f,
                    0f,
                    12f,
                    1f);
                var boss = new EnemyState(
                    2,
                    EnemyKind.Boss,
                    new Float2(200f, 200f),
                    500f,
                    0f,
                    30f,
                    1f);
                state.Enemies.Add(normal);
                state.Enemies.Add(boss);
                presenter.Sync();

                normal.Hp -= 10f;
                boss.BossPhase = BossPhase.Contact;
                presenter.Sync();
                Assert.That(presenter.VfxViewCount, Is.EqualTo(2));

                state.Enemies.Clear();
                presenter.Sync();
                Assert.That(presenter.VfxViewCount, Is.EqualTo(4));

                var drops = new DropSystem(
                    economy,
                    new ConstantRandomSource());
                GroundDropState drop = drops.SpawnTestDrop(
                    state,
                    new Float2(300f, 300f));
                Assert.That(presenter.VfxViewCount, Is.EqualTo(5));
                Assert.That(
                    drops.CollectNearest(state, drop.Position),
                    Is.EqualTo(DropCollectResult.Collected));
                Assert.That(presenter.VfxViewCount, Is.EqualTo(6));

                presenter.PlayVfx(
                    "hook",
                    drop.Position,
                    Color.yellow);
                presenter.PlayVfx(
                    "card.cast",
                    drop.Position,
                    Color.cyan);
                Assert.That(presenter.VfxViewCount, Is.EqualTo(8));

                simulation.AdvanceFrame(0.4f);
                simulation.AdvanceFrame(0.4f);
                simulation.AdvanceFrame(0.4f);
                simulation.AdvanceFrame(0.4f);
                presenter.Sync();
                Assert.That(presenter.VfxViewCount, Is.Zero);
            }
            finally
            {
                Object.DestroyImmediate(root);
                if (createdCamera != null)
                    Object.DestroyImmediate(createdCamera);
            }
        }

        private sealed class ConstantRandomSource : IRandomSource
        {
            public float NextFloat()
            {
                return 0.5f;
            }
        }
    }
}
