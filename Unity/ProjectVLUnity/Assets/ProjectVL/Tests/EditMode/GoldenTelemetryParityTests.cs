using System;
using System.IO;
using NUnit.Framework;
using ProjectVL.Systems;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class GoldenTelemetryParityTests
    {
        [Test]
        public void Seed42FixtureRecomputesToSharedGoldenMetrics()
        {
            string path = FindFixture();
            TelemetrySession session = JsonUtility.FromJson<TelemetrySession>(
                File.ReadAllText(path));
            TelemetryExperienceMetrics metrics =
                DeveloperTelemetryMetrics.Compute(session);
            TelemetryWaveMetrics wave = metrics.waves[0];

            Assert.That(session.meta.seed, Is.EqualTo(42));
            Assert.That(
                session.meta.presetName,
                Is.EqualTo("seed42_acceptance"));
            Assert.That(session.meta.rulesVersion, Is.EqualTo("0.6.0"));
            Assert.That(session.meta.scenarioVersion, Is.EqualTo("2.0.0"));
            Assert.That(metrics.waves, Has.Count.EqualTo(3));
            Assert.That(wave.e1.p50, Is.EqualTo(4f));
            Assert.That(wave.e1.p95, Is.EqualTo(7.4f).Within(0.001f));
            Assert.That(wave.e2, Is.EqualTo(13f));
            Assert.That(wave.e3.max, Is.EqualTo(3));
            Assert.That(wave.e4.count, Is.EqualTo(1));
            Assert.That(wave.e4.visibleSecondsP50, Is.EqualTo(2f));
            Assert.That(wave.e5, Is.EqualTo(0.5f));
            Assert.That(wave.e6, Is.EqualTo(6));
            Assert.That(wave.e7, Is.EqualTo(3f).Within(0.001f));
            Assert.That(metrics.first90.e1.p50, Is.EqualTo(4f));
            Assert.That(metrics.waves[1].wave, Is.EqualTo(4));
            Assert.That(metrics.waves[1].e1.p50, Is.EqualTo(3f));
            Assert.That(metrics.waves[1].e2, Is.EqualTo(8f));
            Assert.That(
                metrics.waves[1].e5,
                Is.EqualTo(0.6f).Within(0.001f));
            Assert.That(metrics.waves[2].wave, Is.EqualTo(10));
            Assert.That(
                metrics.waves[2].e1.p95,
                Is.EqualTo(9.4f).Within(0.001f));
            Assert.That(
                metrics.waves[2].e4.visibleSecondsP50,
                Is.EqualTo(12f));
            Assert.That(metrics.first90.e6, Is.EqualTo(6));
        }

        private static string FindFixture()
        {
            string explicitRoot =
                Environment.GetEnvironmentVariable("PROJECTVL_REPO_ROOT");
            if (!string.IsNullOrWhiteSpace(explicitRoot))
            {
                string explicitPath = Path.Combine(
                    explicitRoot,
                    "tests",
                    "fixtures",
                    "telemetry_session_seed42.json");
                if (File.Exists(explicitPath))
                    return explicitPath;
            }

            DirectoryInfo current = new DirectoryInfo(Application.dataPath);
            while (current != null)
            {
                string candidate = Path.Combine(
                    current.FullName,
                    "tests",
                    "fixtures",
                    "telemetry_session_seed42.json");
                if (File.Exists(candidate))
                    return candidate;
                current = current.Parent;
            }

            throw new FileNotFoundException(
                "Could not locate tests/fixtures/telemetry_session_seed42.json.");
        }
    }
}
