using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Presentation;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class AudioPresentationTests
    {
        private static readonly string[] RequiredEffects =
        {
            "sfx.fire",
            "sfx.hit",
            "sfx.kill",
            "sfx.pickup",
            "sfx.level",
            "sfx.boss.spawn",
            "sfx.boss.phase",
            "sfx.boss.kill",
            "ui.button"
        };

        [Test]
        public void DefaultCatalogHasRequiredEffectAndMusicSlots()
        {
            AudioCatalog catalog =
                Resources.Load<AudioCatalog>("AudioCatalog");

            Assert.That(catalog, Is.Not.Null);
            foreach (string id in RequiredEffects)
            {
                Assert.That(
                    catalog.HasEffectSlot(id),
                    Is.True,
                    $"Missing audio slot: {id}");
            }

            Assert.That(catalog.HasMusicSlot("music.menu"), Is.True);
            Assert.That(catalog.HasMusicSlot("music.run"), Is.True);
            Assert.That(catalog.HasMusicSlot("music.boss"), Is.True);
            Assert.That(catalog.HasMusicSlot("music.result"), Is.True);
        }

        [Test]
        public void CueAndMusicPoliciesCoverCombatLifecycle()
        {
            Assert.That(
                AudioDirector.SoundIdForCue("fire"),
                Is.EqualTo("sfx.fire"));
            Assert.That(
                AudioDirector.SoundIdForCue("hit"),
                Is.EqualTo("sfx.hit"));
            Assert.That(
                AudioDirector.SoundIdForCue("death"),
                Is.EqualTo("sfx.kill"));
            Assert.That(
                AudioDirector.SoundIdForCue("drop.pickup"),
                Is.EqualTo("sfx.pickup"));
            Assert.That(
                AudioDirector.SoundIdForCue("boss.phase"),
                Is.EqualTo("sfx.boss.phase"));
            Assert.That(
                AudioDirector.MusicIdFor(
                    GameMode.Ready,
                    WavePhase.Regular,
                    false),
                Is.EqualTo("music.menu"));
            Assert.That(
                AudioDirector.MusicIdFor(
                    GameMode.Playing,
                    WavePhase.Regular,
                    false),
                Is.EqualTo("music.run"));
            Assert.That(
                AudioDirector.MusicIdFor(
                    GameMode.Playing,
                    WavePhase.Boss,
                    true),
                Is.EqualTo("music.boss"));
            Assert.That(
                AudioDirector.MusicIdFor(
                    GameMode.Ended,
                    WavePhase.Regular,
                    false),
                Is.EqualTo("music.result"));
        }

        [Test]
        public void MissingClipsStaySilentAndVolumeGroupsClamp()
        {
            CombatConfig combat = CombatConfigLoader.LoadDefault();
            GameState state = GameStateFactory.Create(
                combat,
                GameConfigLoader.LoadEconomy());
            var catalog = ScriptableObject.CreateInstance<AudioCatalog>();
            catalog.effects = new[]
            {
                new AudioCatalogEntry { id = "sfx.fire" }
            };
            catalog.music = new[]
            {
                new AudioCatalogEntry
                {
                    id = "music.menu",
                    loop = true
                }
            };
            var root = new GameObject("Audio Director Test");

            try
            {
                var director = root.AddComponent<AudioDirector>();
                director.Initialize(state, null, catalog);

                Assert.That(director.CurrentMusicId, Is.EqualTo("music.menu"));
                Assert.That(director.Play("sfx.fire"), Is.False);
                Assert.That(director.Play("missing"), Is.False);
                director.SetMasterVolume(2f);
                director.SetBusVolume(AudioBus.Music, -1f);
                director.SetBusVolume(AudioBus.Sfx, 0.4f);
                director.SetBusVolume(AudioBus.Ui, 0.7f);

                Assert.That(director.MasterVolume, Is.EqualTo(1f));
                Assert.That(
                    director.GetBusVolume(AudioBus.Music),
                    Is.Zero);
                Assert.That(
                    director.GetBusVolume(AudioBus.Sfx),
                    Is.EqualTo(0.4f));
                Assert.That(
                    director.GetBusVolume(AudioBus.Ui),
                    Is.EqualTo(0.7f));
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(catalog);
            }
        }
    }
}
