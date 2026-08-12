using System;
using UnityEngine;
using UnityEngine.Audio;

namespace ProjectVL.Presentation
{
    public enum AudioBus
    {
        Music,
        Sfx,
        Ui
    }

    [Serializable]
    public sealed class AudioCatalogEntry
    {
        public string id;
        public AudioClip clip;
        public AudioMixerGroup output;
        [Range(0f, 1f)]
        public float volume = 1f;
        [Range(0.5f, 2f)]
        public float pitch = 1f;
        public bool loop;
    }

    [CreateAssetMenu(
        fileName = "AudioCatalog",
        menuName = "ProjectVL/Audio Catalog")]
    public sealed class AudioCatalog : ScriptableObject
    {
        public AudioCatalogEntry[] effects =
            Array.Empty<AudioCatalogEntry>();
        public AudioCatalogEntry[] music =
            Array.Empty<AudioCatalogEntry>();

        public AudioCatalogEntry FindEffect(string id)
        {
            return Find(effects, id);
        }

        public AudioCatalogEntry FindMusic(string id)
        {
            return Find(music, id);
        }

        public bool HasEffectSlot(string id)
        {
            return FindEffect(id) != null;
        }

        public bool HasMusicSlot(string id)
        {
            return FindMusic(id) != null;
        }

        private static AudioCatalogEntry Find(
            AudioCatalogEntry[] entries,
            string id)
        {
            if (entries == null || string.IsNullOrEmpty(id))
                return null;

            foreach (AudioCatalogEntry entry in entries)
            {
                if (entry != null
                    && string.Equals(
                        entry.id,
                        id,
                        StringComparison.Ordinal))
                    return entry;
            }

            return null;
        }
    }
}
