using System;
using System.Collections.Generic;
using System.Linq;
using ProjectVL.Presentation;
using UnityEditor;
using UnityEngine;

namespace ProjectVL.Editor
{
    public static class AudioCatalogBuilder
    {
        private const string AssetPath =
            "Assets/ProjectVL/Resources/AudioCatalog.asset";

        private static readonly string[] EffectIds =
        {
            "sfx.fire",
            "sfx.hit",
            "sfx.kill",
            "sfx.pickup",
            "sfx.drop",
            "sfx.hook",
            "sfx.level",
            "sfx.reward",
            "sfx.card.cast",
            "sfx.boss.spawn",
            "sfx.boss.phase",
            "sfx.boss.kill",
            "ui.button"
        };

        private static readonly string[] MusicIds =
        {
            "music.menu",
            "music.run",
            "music.boss",
            "music.result"
        };

        [MenuItem("ProjectVL/Art/Create or Refresh Audio Catalog")]
        public static void CreateOrRefresh()
        {
            AudioCatalog catalog =
                AssetDatabase.LoadAssetAtPath<AudioCatalog>(AssetPath);
            if (catalog == null)
            {
                catalog = ScriptableObject.CreateInstance<AudioCatalog>();
                AssetDatabase.CreateAsset(catalog, AssetPath);
            }

            catalog.effects = Merge(catalog.effects, EffectIds, false);
            catalog.music = Merge(catalog.music, MusicIds, true);
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log(
                $"AudioCatalog ready: {catalog.effects.Length} effects, "
                + $"{catalog.music.Length} music slots at {AssetPath}");
        }

        public static void CreateOrRefreshFromCommandLine()
        {
            CreateOrRefresh();
            EditorApplication.Exit(0);
        }

        private static AudioCatalogEntry[] Merge(
            AudioCatalogEntry[] existing,
            IEnumerable<string> requiredIds,
            bool loop)
        {
            var byId = new Dictionary<string, AudioCatalogEntry>(
                StringComparer.Ordinal);
            if (existing != null)
            {
                foreach (AudioCatalogEntry entry in existing)
                {
                    if (entry != null
                        && !string.IsNullOrEmpty(entry.id)
                        && !byId.ContainsKey(entry.id))
                        byId.Add(entry.id, entry);
                }
            }

            var result = new List<AudioCatalogEntry>();
            foreach (string id in requiredIds.Distinct(StringComparer.Ordinal))
            {
                if (!byId.TryGetValue(id, out AudioCatalogEntry entry))
                {
                    entry = new AudioCatalogEntry
                    {
                        id = id,
                        volume = 1f,
                        pitch = 1f,
                        loop = loop
                    };
                }

                result.Add(entry);
                byId.Remove(id);
            }

            result.AddRange(byId.Values.OrderBy(entry => entry.id));
            return result.ToArray();
        }
    }
}
