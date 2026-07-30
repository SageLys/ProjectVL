using System;
using System.Collections.Generic;
using System.IO;
using ProjectVL.Config;
using UnityEngine;

namespace ProjectVL.Systems
{
    [Serializable]
    public sealed class TuningPresetValue
    {
        public string key;
        public float value;
    }

    [Serializable]
    public sealed class TuningPreset
    {
        public int version = 1;
        public string name;
        public string savedAt;
        public bool bountyEnabled;
        public List<TuningPresetValue> values =
            new List<TuningPresetValue>();
    }

    [Serializable]
    public sealed class TuningPresetCollection
    {
        public List<TuningPreset> presets = new List<TuningPreset>();
    }

    public sealed class TuningPresetStore
    {
        private readonly string _directory;
        private readonly string _collectionPath;
        private readonly List<TuningPreset> _presets =
            new List<TuningPreset>();

        public IReadOnlyList<TuningPreset> Presets => _presets;
        public string ImportPath =>
            Path.Combine(_directory, "tuning-import.json");

        public TuningPresetStore(string directory)
        {
            if (string.IsNullOrWhiteSpace(directory))
            {
                throw new ArgumentException(
                    "A preset directory is required.",
                    nameof(directory));
            }

            _directory = directory;
            _collectionPath = Path.Combine(
                _directory,
                "tuning-presets.json");
            LoadCollection();
        }

        public string Save(TuningPreset preset)
        {
            if (preset == null)
            {
                throw new ArgumentNullException(nameof(preset));
            }

            if (string.IsNullOrWhiteSpace(preset.name))
            {
                throw new ArgumentException(
                    "Preset name cannot be empty.",
                    nameof(preset));
            }

            int existing = _presets.FindIndex(
                item => string.Equals(
                    item.name,
                    preset.name,
                    StringComparison.OrdinalIgnoreCase));
            if (existing >= 0)
            {
                _presets[existing] = preset;
            }
            else
            {
                _presets.Add(preset);
            }

            WriteCollection();
            string exportPath = Path.Combine(
                _directory,
                SafeFileName(preset.name) + ".json");
            File.WriteAllText(
                exportPath,
                JsonUtility.ToJson(preset, true)
                    + Environment.NewLine);
            return exportPath;
        }

        public bool DeleteAt(int index)
        {
            if (index < 0 || index >= _presets.Count)
            {
                return false;
            }

            _presets.RemoveAt(index);
            WriteCollection();
            return true;
        }

        public TuningPreset Import()
        {
            if (!File.Exists(ImportPath))
            {
                return null;
            }

            TuningPreset preset = JsonUtility.FromJson<TuningPreset>(
                File.ReadAllText(ImportPath));
            if (preset == null || string.IsNullOrWhiteSpace(preset.name))
            {
                return null;
            }

            Save(preset);
            return preset;
        }

        private void LoadCollection()
        {
            if (!File.Exists(_collectionPath))
            {
                return;
            }

            TuningPresetCollection collection =
                JsonUtility.FromJson<TuningPresetCollection>(
                    File.ReadAllText(_collectionPath));
            if (collection?.presets != null)
            {
                _presets.AddRange(collection.presets);
            }
        }

        private void WriteCollection()
        {
            Directory.CreateDirectory(_directory);
            var collection = new TuningPresetCollection();
            collection.presets.AddRange(_presets);
            File.WriteAllText(
                _collectionPath,
                JsonUtility.ToJson(collection, true)
                    + Environment.NewLine);
        }

        private static string SafeFileName(string value)
        {
            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalid, '_');
            }

            return string.IsNullOrWhiteSpace(value)
                ? "preset"
                : value.Trim();
        }
    }
}
