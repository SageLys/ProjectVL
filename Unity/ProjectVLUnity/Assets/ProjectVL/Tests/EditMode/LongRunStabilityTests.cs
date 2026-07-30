using System.Linq;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Presentation;
using ProjectVL.Systems;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class LongRunStabilityTests
    {
        [Test]
        public void TenWaveTelemetryAndSimulationCollectionsRemainBounded()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            GameState state = GameStateFactory.Create(combat, economy);
            state.StartRun();
            var simulation = new GameSimulation(state, combat);
            var telemetry = new DeveloperTelemetrySystem(
                state,
                42,
                "long-run-test",
                combat,
                GameConfigLoader.LoadEnemies(),
                GameConfigLoader.LoadWaves(),
                economy,
                GameConfigLoader.LoadBounty());
            simulation.SimulationStep += telemetry.Step;

            int nextEnemyId = 1;
            int nextBulletId = 1;
            int maxEnemies = 0;
            int maxBullets = 0;
            int maxZones = 0;

            for (int wave = 1; wave <= 10; wave++)
            {
                state.BeginWave(wave);
                for (int cycle = 0; cycle < 100; cycle++)
                {
                    for (int index = 0; index < 2; index++)
                    {
                        state.Enemies.Add(new EnemyState(
                            nextEnemyId++,
                            EnemyKind.Normal,
                            new Float2(0f, 0f),
                            100f,
                            0f,
                            12f,
                            1f));
                        state.Bullets.Add(new BulletState(
                            nextBulletId++,
                            new Float2(10f, 10f),
                            new Float2(1f, 0f),
                            2f,
                            1f,
                            5f));
                    }

                    state.GroundZones.Add(new GroundZoneState(
                        new Float2(20f, 20f),
                        12f,
                        1f,
                        0.25f,
                        1f,
                        0f,
                        0f));
                    maxEnemies = System.Math.Max(
                        maxEnemies,
                        state.Enemies.Count);
                    maxBullets = System.Math.Max(
                        maxBullets,
                        state.Bullets.Count);
                    maxZones = System.Math.Max(
                        maxZones,
                        state.GroundZones.Count);

                    telemetry.Step(state, 0f);
                    state.Enemies.Clear();
                    state.Bullets.Clear();
                    state.GroundZones.Clear();
                    simulation.AdvanceFrame(0.25f);
                }
            }

            Assert.That(maxEnemies, Is.EqualTo(2));
            Assert.That(maxBullets, Is.EqualTo(2));
            Assert.That(maxZones, Is.EqualTo(1));
            Assert.That(state.Enemies, Is.Empty);
            Assert.That(state.Bullets, Is.Empty);
            Assert.That(state.GroundZones, Is.Empty);
            Assert.That(
                telemetry.Session.events.Count(item => item.type == "spawn"),
                Is.EqualTo(2000));
            Assert.That(
                telemetry.Session.events.Count(
                    item => item.type == "waveStart"),
                Is.EqualTo(10));
            Assert.That(
                telemetry.Session.events.Count,
                Is.EqualTo(2010));
            Assert.That(
                telemetry.Session.samples.Count,
                Is.InRange(1000, 1001));

            int eventCount = telemetry.Session.events.Count;
            int sampleCount = telemetry.Session.samples.Count;
            telemetry.Dispose();
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource());
            drops.SpawnTestDrop(state, new Float2(30f, 30f));
            simulation.AdvanceFrame(0.25f);

            Assert.That(telemetry.Session.events.Count, Is.EqualTo(eventCount));
            Assert.That(telemetry.Session.samples.Count, Is.EqualTo(sampleCount));
            simulation.SimulationStep -= telemetry.Step;
        }

        [Test]
        public void RepeatedPresentationChurnReleasesAllTransientViews()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            EconomyConfig economy = GameConfigLoader.LoadEconomy();
            GameState state = GameStateFactory.Create(combat, economy);
            var root = new GameObject("Long Run Presenter Test");
            GameObject createdCamera = null;
            if (Camera.main == null)
            {
                createdCamera = new GameObject("Long Run Test Camera");
                createdCamera.tag = "MainCamera";
                createdCamera.AddComponent<Camera>();
            }

            try
            {
                var presenter = root.AddComponent<ArenaPresenter>();
                presenter.Initialize(combat, state);
                int baselineChildren = root.transform.childCount;

                for (int cycle = 1; cycle <= 250; cycle++)
                {
                    state.Enemies.Add(new EnemyState(
                        cycle,
                        EnemyKind.Normal,
                        new Float2(0f, 0f),
                        100f,
                        0f,
                        12f,
                        1f));
                    state.Bullets.Add(new BulletState(
                        cycle,
                        new Float2(10f, 10f),
                        new Float2(1f, 0f),
                        2f,
                        1f,
                        5f));
                    state.GroundDrops.Add(new GroundDropState(
                        cycle,
                        new Float2(20f, 20f),
                        "pierce",
                        1,
                        5f));
                    state.BountyOffers.Add(new BountyOfferState(
                        cycle,
                        "scorch",
                        1,
                        1,
                        1,
                        0,
                        BountySide.Top,
                        new Float2(30f, 30f),
                        5f,
                        false,
                        0f));
                    state.GroundZones.Add(new GroundZoneState(
                        new Float2(40f, 40f),
                        12f,
                        1f,
                        0.25f,
                        1f,
                        0f,
                        0f));

                    presenter.Sync();
                    Assert.That(presenter.EnemyViewCount, Is.EqualTo(1));
                    Assert.That(presenter.BulletViewCount, Is.EqualTo(1));
                    Assert.That(presenter.DropViewCount, Is.EqualTo(1));
                    Assert.That(
                        presenter.BountyOfferViewCount,
                        Is.EqualTo(1));
                    Assert.That(presenter.GroundZoneViewCount, Is.EqualTo(1));

                    state.Enemies.Clear();
                    state.Bullets.Clear();
                    state.GroundDrops.Clear();
                    state.BountyOffers.Clear();
                    state.GroundZones.Clear();
                    presenter.Sync();

                    Assert.That(presenter.TransientViewCount, Is.Zero);
                    Assert.That(
                        root.transform.childCount,
                        Is.EqualTo(baselineChildren));
                }
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
