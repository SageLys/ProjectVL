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
            Assert.That(wave.e1.p50, Is.EqualTo(4f));
            Assert.That(wave.e1.p95, Is.EqualTo(7.4f).Within(0.001f));
            Assert.That(wave.e2, Is.EqualTo(13f));
            Assert.That(wave.e3.max, Is.EqualTo(3));
            Assert.That(wave.e4.count, Is.EqualTo(1));
            Assert.That(wave.e4.visibleSecondsP50, Is.EqualTo(2f));
            Assert.That(wave.e5, Is.EqualTo(0.5f));
            Assert.That(wave.e6, Is.EqualTo(3));
            Assert.That(wave.e7, Is.EqualTo(3f).Within(0.001f));
            Assert.That(metrics.first90.e1.p50, Is.EqualTo(4f));
            Assert.That(metrics.first90.e6, Is.EqualTo(3));
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
