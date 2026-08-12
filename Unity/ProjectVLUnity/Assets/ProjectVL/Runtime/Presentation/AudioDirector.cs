using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class AudioDirector : MonoBehaviour
    {
        private const int SfxVoiceCount = 6;
        private readonly AudioSource[] _sfxSources =
            new AudioSource[SfxVoiceCount];
        private AudioCatalog _catalog;
        private GameState _state;
        private ArenaPresenter _presenter;
        private AudioSource _musicSource;
        private AudioSource _uiSource;
        private int _nextSfxVoice;
        private float _masterVolume = 1f;
        private float _musicVolume = 1f;
        private float _sfxVolume = 1f;
        private float _uiVolume = 1f;

        public string CurrentMusicId { get; private set; }
        public AudioCatalog Catalog => _catalog;
        public float MasterVolume => _masterVolume;

        public void Initialize(
            GameState state,
            ArenaPresenter presenter,
            AudioCatalog catalog = null)
        {
            _state = state;
            _presenter = presenter;
            _catalog = catalog
                ?? Resources.Load<AudioCatalog>("AudioCatalog");
            _musicSource = CreateSource("Music", true);
            _uiSource = CreateSource("UI", false);
            for (int index = 0; index < _sfxSources.Length; index++)
                _sfxSources[index] = CreateSource($"SFX {index + 1}", false);
            if (_presenter != null)
                _presenter.AudioCue += HandlePresentationCue;
            SyncMusic();
        }

        private void Update()
        {
            SyncMusic();
        }

        public bool Play(string id, AudioBus bus = AudioBus.Sfx)
        {
            AudioCatalogEntry entry = _catalog?.FindEffect(id);
            if (entry?.clip == null)
                return false;

            AudioSource source = bus == AudioBus.Ui
                ? _uiSource
                : NextSfxSource();
            if (source == null)
                return false;
            Configure(source, entry, bus);
            source.PlayOneShot(
                entry.clip,
                Mathf.Clamp01(entry.volume * EffectiveVolume(bus)));
            return true;
        }

        public bool PlayMusic(string id)
        {
            if (CurrentMusicId == id
                && _musicSource != null
                && _musicSource.isPlaying)
                return true;

            CurrentMusicId = id;
            AudioCatalogEntry entry = _catalog?.FindMusic(id);
            if (_musicSource == null || entry?.clip == null)
            {
                _musicSource?.Stop();
                return false;
            }

            Configure(_musicSource, entry, AudioBus.Music);
            _musicSource.clip = entry.clip;
            _musicSource.loop = true;
            _musicSource.volume = Mathf.Clamp01(
                entry.volume * EffectiveVolume(AudioBus.Music));
            _musicSource.Play();
            return true;
        }

        public void SyncMusic()
        {
            if (_state == null)
                return;

            string target = MusicIdFor(
                _state.Mode,
                _state.WavePhase,
                _state.BossId.HasValue);

            if (CurrentMusicId != target)
                PlayMusic(target);
        }

        public static string MusicIdFor(
            GameMode mode,
            WavePhase phase,
            bool hasBoss)
        {
            if (mode == GameMode.Ready)
                return "music.menu";
            if (mode == GameMode.Ended)
                return "music.result";
            return phase == WavePhase.Boss || hasBoss
                ? "music.boss"
                : "music.run";
        }

        public void SetMasterVolume(float volume)
        {
            _masterVolume = Mathf.Clamp01(volume);
            RefreshMusicVolume();
        }

        public void SetBusVolume(AudioBus bus, float volume)
        {
            float clamped = Mathf.Clamp01(volume);
            switch (bus)
            {
                case AudioBus.Music:
                    _musicVolume = clamped;
                    RefreshMusicVolume();
                    break;
                case AudioBus.Ui:
                    _uiVolume = clamped;
                    break;
                default:
                    _sfxVolume = clamped;
                    break;
            }
        }

        public float GetBusVolume(AudioBus bus)
        {
            switch (bus)
            {
                case AudioBus.Music: return _musicVolume;
                case AudioBus.Ui: return _uiVolume;
                default: return _sfxVolume;
            }
        }

        public static string SoundIdForCue(string cue)
        {
            switch (cue)
            {
                case "fire": return "sfx.fire";
                case "hit": return "sfx.hit";
                case "death": return "sfx.kill";
                case "death.boss": return "sfx.boss.kill";
                case "boss.spawn": return "sfx.boss.spawn";
                case "boss.phase": return "sfx.boss.phase";
                case "drop.land": return "sfx.drop";
                case "drop.pickup": return "sfx.pickup";
                case "hook": return "sfx.hook";
                case "card.cast": return "sfx.card.cast";
                default: return null;
            }
        }

        private void HandlePresentationCue(string cue)
        {
            string soundId = SoundIdForCue(cue);
            if (!string.IsNullOrEmpty(soundId))
                Play(soundId);
        }

        private AudioSource CreateSource(string label, bool loop)
        {
            var source = gameObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;
            return source;
        }

        private AudioSource NextSfxSource()
        {
            AudioSource source = _sfxSources[_nextSfxVoice];
            _nextSfxVoice = (_nextSfxVoice + 1) % _sfxSources.Length;
            return source;
        }

        private void Configure(
            AudioSource source,
            AudioCatalogEntry entry,
            AudioBus bus)
        {
            source.outputAudioMixerGroup = entry.output;
            source.pitch = Mathf.Clamp(entry.pitch, 0.5f, 2f);
            source.volume = EffectiveVolume(bus);
        }

        private float EffectiveVolume(AudioBus bus)
        {
            float busVolume = bus == AudioBus.Music
                ? _musicVolume
                : bus == AudioBus.Ui
                    ? _uiVolume
                    : _sfxVolume;
            return Mathf.Clamp01(_masterVolume * busVolume);
        }

        private void RefreshMusicVolume()
        {
            if (_musicSource == null)
                return;
            AudioCatalogEntry entry =
                _catalog?.FindMusic(CurrentMusicId);
            _musicSource.volume = Mathf.Clamp01(
                (entry?.volume ?? 1f)
                * EffectiveVolume(AudioBus.Music));
        }

        private void OnDestroy()
        {
            if (_presenter != null)
                _presenter.AudioCue -= HandlePresentationCue;
        }
    }
}
