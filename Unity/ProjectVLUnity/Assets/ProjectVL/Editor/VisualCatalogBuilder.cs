using System;
using System.Collections.Generic;
using System.Linq;
using ProjectVL.Config;
using ProjectVL.Presentation;
using UnityEditor;
using UnityEngine;

namespace ProjectVL.Editor
{
    public static class VisualCatalogBuilder
    {
        private const string AssetPath =
            "Assets/ProjectVL/Resources/VisualCatalog.asset";

        private static readonly string[] EnemyIds =
        {
            "default",
            "normal",
            "fast",
            "tank",
            "boss",
            "boss.approach",
            "boss.contact",
            "elite",
            "elite.normal",
            "elite.fast",
            "elite.tank",
            "bounty",
            "bounty.normal",
            "bounty.fast",
            "bounty.tank"
        };

        private static readonly string[] DropIds =
        {
            "default",
            "bounty",
            "validation",
            "wildcard.1",
            "wildcard.2",
            "wildcard.3",
            "wildcard.4",
            "wildcard.5",
            "wildcard.6"
        };

        private static readonly string[] VfxIds =
        {
            "default",
            "hit",
            "death",
            "boss.phase",
            "drop.land",
            "drop.pickup",
            "card.cast"
        };

        [MenuItem("ProjectVL/Art/Create or Refresh Visual Catalog")]
        public static void CreateOrRefresh()
        {
            VisualCatalog catalog =
                AssetDatabase.LoadAssetAtPath<VisualCatalog>(AssetPath);
            if (catalog == null)
            {
                catalog = ScriptableObject.CreateInstance<VisualCatalog>();
                AssetDatabase.CreateAsset(catalog, AssetPath);
            }

            CardsConfig cards = GameConfigLoader.LoadCards();
            GodsConfig gods = GameConfigLoader.LoadGods();
            string[] cardIds = cards.cards
                .Where(card => card != null && !string.IsNullOrEmpty(card.id))
                .Select(card => card.id)
                .ToArray();
            string[] godIds = gods.gods
                .Where(god => god != null && !string.IsNullOrEmpty(god.id))
                .Select(god => god.id)
                .ToArray();

            catalog.arenas = Merge(
                catalog.arenas,
                new[] { "default", "main" });
            catalog.turrets = Merge(
                catalog.turrets,
                new[] { "default", "main", "decoy", "decoy.secondary" });
            catalog.enemies = Merge(catalog.enemies, EnemyIds);
            catalog.projectiles = Merge(
                catalog.projectiles,
                new[] { "default", "beam" }.Concat(cardIds));
            catalog.drops = Merge(
                catalog.drops,
                DropIds.Concat(cardIds));
            catalog.cards = Merge(catalog.cards, cardIds);
            catalog.vfx = Merge(catalog.vfx, VfxIds);
            catalog.ui = Merge(
                catalog.ui,
                new[]
                {
                    "default",
                    "hud.panel",
                    "hud.button",
                    "card.frame",
                    "card.slot"
                });
            catalog.gods = MergeGods(catalog.gods, godIds);

            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log(
                $"VisualCatalog ready: {catalog.cards.Length} cards, "
                + $"{catalog.gods.Length} gods at {AssetPath}");
        }

        public static void CreateOrRefreshFromCommandLine()
        {
            CreateOrRefresh();
            EditorApplication.Exit(0);
        }

        private static VisualResourceEntry[] Merge(
            VisualResourceEntry[] existing,
            IEnumerable<string> requiredIds)
        {
            var byId = new Dictionary<string, VisualResourceEntry>(
                StringComparer.Ordinal);
            if (existing != null)
            {
                foreach (VisualResourceEntry entry in existing)
                {
                    if (entry != null
                        && !string.IsNullOrEmpty(entry.id)
                        && !byId.ContainsKey(entry.id))
                        byId.Add(entry.id, entry);
                }
            }

            var result = new List<VisualResourceEntry>();
            foreach (string id in requiredIds
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct(StringComparer.Ordinal))
            {
                if (!byId.TryGetValue(id, out VisualResourceEntry entry))
                    entry = new VisualResourceEntry { id = id };
                result.Add(entry);
                byId.Remove(id);
            }

            result.AddRange(byId.Values.OrderBy(entry => entry.id));
            return result.ToArray();
        }

        private static GodVisualEntry[] MergeGods(
            GodVisualEntry[] existing,
            IEnumerable<string> requiredIds)
        {
            var byId = new Dictionary<string, GodVisualEntry>(
                StringComparer.Ordinal);
            if (existing != null)
            {
                foreach (GodVisualEntry entry in existing)
                {
                    if (entry != null
                        && !string.IsNullOrEmpty(entry.id)
                        && !byId.ContainsKey(entry.id))
                        byId.Add(entry.id, entry);
                }
            }

            var result = new List<GodVisualEntry>();
            foreach (string id in requiredIds
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct(StringComparer.Ordinal))
            {
                if (!byId.TryGetValue(id, out GodVisualEntry entry))
                {
                    entry = new GodVisualEntry
                    {
                        id = id,
                        accent = VisualCatalog.DefaultGodAccent(id)
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
