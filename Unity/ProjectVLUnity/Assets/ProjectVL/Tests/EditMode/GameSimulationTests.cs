using System.Collections.Generic;
using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Tests
{
    public sealed class GameSimulationTests
    {
        private CombatConfig _config;
        private GameState _state;
        private GameSimulation _simulation;

        [SetUp]
        public void SetUp()
        {
            _config = CombatConfigLoader.LoadDefault();
            _state = GameStateFactory.Create(_config);
            _simulation = new GameSimulation(_state, _config);
        }

        [Test]
        public void InitialStateMatchesWebBaseline()
        {
            Assert.That(_state.Mode, Is.EqualTo(GameMode.Ready));
            Assert.That(_state.Hp, Is.EqualTo(100f));
            Assert.That(_state.MaxHp, Is.EqualTo(100f));
            Assert.That(_state.Wave, Is.Zero);
            Assert.That(_state.TurretAngleRadians, Is.EqualTo(-1.5707964f).Within(0.00001f));
        }

        [Test]
        public void SplitsLongFramesAtConfiguredDeltaTimeCap()
        {
            var observedSteps = new List<float>();
            _state.StartRun();
            _simulation.CombatStep += (_, deltaTime) => observedSteps.Add(deltaTime);

            int stepCount = _simulation.AdvanceFrame(0.1f);

            Assert.That(stepCount, Is.EqualTo(4));
            Assert.That(observedSteps, Has.Count.EqualTo(4));
            Assert.That(observedSteps, Has.All.LessThanOrEqualTo(_config.dtCap));
            Assert.That(_state.Time, Is.EqualTo(0.1f).Within(0.00001f));
        }

        [Test]
        public void PauseAndDecisionLocksStopSimulation()
        {
            _state.StartRun();
            _state.SetPaused(true);
            Assert.That(_simulation.AdvanceFrame(0.02f), Is.Zero);

            _state.SetPaused(false);
            _state.SetDecisionLocked(true);
            Assert.That(_simulation.AdvanceFrame(0.02f), Is.Zero);
            Assert.That(_state.Time, Is.Zero);
        }

        [Test]
        public void IntermissionAdvancesClockWithoutCombatStep()
        {
            int combatSteps = 0;
            _state.StartRun();
            _state.SetIntermission(true);
            _simulation.CombatStep += (_, __) => combatSteps++;

            _simulation.AdvanceFrame(0.02f);

            Assert.That(_state.Time, Is.EqualTo(0.02f).Within(0.00001f));
            Assert.That(combatSteps, Is.Zero);
        }

        [Test]
        public void TimeScaleUsesWebRange()
        {
            _simulation.SetTimeScale(99f);
            Assert.That(_simulation.TimeScale, Is.EqualTo(3f));

            _simulation.SetTimeScale(0f);
            Assert.That(_simulation.TimeScale, Is.EqualTo(0.25f));
        }

        [Test]
        public void EndRunRecordsOutcome()
        {
            _state.StartRun();

            _state.EndRun(true);

            Assert.That(_state.Mode, Is.EqualTo(GameMode.Ended));
            Assert.That(_state.Won, Is.True);
            Assert.That(_state.Paused, Is.False);
        }
    }
}
