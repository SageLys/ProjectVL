using System;
using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Presentation
{
    [Serializable]
    public sealed class VisualResourceEntry
    {
        public string id;
        public Sprite sprite;
        public GameObject prefab;
        public RuntimeAnimatorController animator;
        public Material material;
        public Sprite statusOverlay;
    }

    [Serializable]
    public sealed class GodVisualEntry
    {
        public string id;
        public Sprite icon;
        public Sprite cardFrame;
        public Color accent = Color.white;
    }

    [CreateAssetMenu(
        fileName = "VisualCatalog",
        menuName = "ProjectVL/Visual Catalog")]
    public sealed class VisualCatalog : ScriptableObject
    {
        public VisualResourceEntry[] arenas =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] turrets =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] enemies =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] projectiles =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] drops =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] cards =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] vfx =
            Array.Empty<VisualResourceEntry>();
        public VisualResourceEntry[] ui =
            Array.Empty<VisualResourceEntry>();
        public GodVisualEntry[] gods = Array.Empty<GodVisualEntry>();

        public VisualResourceEntry FindArena(string id)
        {
            return Find(arenas, id, "default");
        }

        public Sprite ResolveArenaSprite(string id)
        {
            return ResolveSprite(arenas, id, "default");
        }

        public VisualResourceEntry FindTurret(string id)
        {
            return Find(turrets, id, "default");
        }

        public Sprite ResolveTurretSprite(string id)
        {
            return ResolveSprite(turrets, id, "default");
        }

        public VisualResourceEntry FindEnemy(EnemyState enemy)
        {
            if (enemy == null)
                return Find(enemies, "default");

            string kind = EnemyKindId(enemy.Kind);
            if (enemy.Kind == EnemyKind.Boss)
            {
                string phase = enemy.BossPhase == BossPhase.Contact
                    ? "boss.contact"
                    : "boss.approach";
                return Find(enemies, phase, "boss", kind, "default");
            }

            if (enemy.SpawnKind == EnemySpawnKind.ValidationElite)
            {
                return Find(
                    enemies,
                    "elite." + kind,
                    "elite",
                    kind,
                    "default");
            }

            if (enemy.SpawnKind == EnemySpawnKind.Bounty)
            {
                return Find(
                    enemies,
                    "bounty." + kind,
                    "bounty",
                    kind,
                    "default");
            }

            return Find(enemies, kind, "default");
        }

        public Sprite ResolveEnemySprite(EnemyState enemy)
        {
            return ResolveSprite(enemies, EnemyIds(enemy));
        }

        public Sprite ResolveEnemyStatusOverlay(EnemyState enemy)
        {
            return ResolveStatusOverlay(enemies, EnemyIds(enemy));
        }

        public GameObject ResolveEnemyPrefab(EnemyState enemy)
        {
            return ResolvePrefab(enemies, EnemyIds(enemy));
        }

        public RuntimeAnimatorController ResolveEnemyAnimator(
            EnemyState enemy)
        {
            return ResolveAnimator(enemies, EnemyIds(enemy));
        }

        public Material ResolveEnemyMaterial(EnemyState enemy)
        {
            return ResolveMaterial(enemies, EnemyIds(enemy));
        }

        public VisualResourceEntry FindProjectile(string id)
        {
            return Find(projectiles, id, "default");
        }

        public Sprite ResolveProjectileSprite(string id)
        {
            return ResolveSprite(projectiles, id, "default");
        }

        public GameObject ResolveProjectilePrefab(string id)
        {
            return ResolvePrefab(projectiles, id, "default");
        }

        public VisualResourceEntry FindDrop(string id)
        {
            return Find(drops, id, "default");
        }

        public Sprite ResolveDropSprite(string id)
        {
            return ResolveSprite(drops, id, "default");
        }

        public GameObject ResolveDropPrefab(string id)
        {
            return ResolvePrefab(drops, id, "default");
        }

        public VisualResourceEntry FindCard(string id)
        {
            return Find(cards, id, "default");
        }

        public Sprite ResolveCardSprite(string id)
        {
            return ResolveSprite(cards, id, "default");
        }

        public GameObject ResolveCardPrefab(string id)
        {
            return ResolvePrefab(cards, id, "default");
        }

        public VisualResourceEntry FindVfx(string id)
        {
            return Find(vfx, id, "default");
        }

        public Sprite ResolveVfxSprite(string id)
        {
            return ResolveSprite(vfx, id, "default");
        }

        public GameObject ResolveVfxPrefab(string id)
        {
            return ResolvePrefab(vfx, id, "default");
        }

        public RuntimeAnimatorController ResolveVfxAnimator(string id)
        {
            return ResolveAnimator(vfx, id, "default");
        }

        public Material ResolveVfxMaterial(string id)
        {
            return ResolveMaterial(vfx, id, "default");
        }

        public VisualResourceEntry FindUi(string id)
        {
            return Find(ui, id, "default");
        }

        public GodVisualEntry FindGod(string id)
        {
            if (gods == null || string.IsNullOrEmpty(id))
                return null;

            foreach (GodVisualEntry entry in gods)
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

        public bool HasCardSlot(string id)
        {
            return FindExact(cards, id) != null;
        }

        public bool HasGodSlot(string id)
        {
            return FindGod(id) != null;
        }

        public static Color DefaultGodAccent(string id)
        {
            switch (id)
            {
                case "storm":
                    return new Color(0.42f, 0.82f, 1f);
                case "winter":
                    return new Color(0.68f, 0.92f, 1f);
                case "inferno":
                    return new Color(1f, 0.38f, 0.16f);
                case "bulwark":
                    return new Color(0.96f, 0.78f, 0.28f);
                case "plenty":
                    return new Color(0.40f, 0.86f, 0.48f);
                default:
                    return new Color(0.72f, 0.78f, 0.84f);
            }
        }

        private static VisualResourceEntry Find(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null)
                    return entry;
            }

            return null;
        }

        private static VisualResourceEntry FindExact(
            VisualResourceEntry[] entries,
            string id)
        {
            if (entries == null || string.IsNullOrEmpty(id))
                return null;

            foreach (VisualResourceEntry entry in entries)
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

        private static Sprite ResolveSprite(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null && entry.sprite != null)
                    return entry.sprite;
            }

            return null;
        }

        private static Sprite ResolveStatusOverlay(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null && entry.statusOverlay != null)
                    return entry.statusOverlay;
            }

            return null;
        }

        private static GameObject ResolvePrefab(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null && entry.prefab != null)
                    return entry.prefab;
            }

            return null;
        }

        private static RuntimeAnimatorController ResolveAnimator(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null && entry.animator != null)
                    return entry.animator;
            }

            return null;
        }

        private static Material ResolveMaterial(
            VisualResourceEntry[] entries,
            params string[] ids)
        {
            if (entries == null || ids == null)
                return null;

            foreach (string id in ids)
            {
                VisualResourceEntry entry = FindExact(entries, id);
                if (entry != null && entry.material != null)
                    return entry.material;
            }

            return null;
        }

        private static string[] EnemyIds(EnemyState enemy)
        {
            if (enemy == null)
                return new[] { "default" };

            string kind = EnemyKindId(enemy.Kind);
            if (enemy.Kind == EnemyKind.Boss)
            {
                return new[]
                {
                    enemy.BossPhase == BossPhase.Contact
                        ? "boss.contact"
                        : "boss.approach",
                    "boss",
                    kind,
                    "default"
                };
            }

            if (enemy.SpawnKind == EnemySpawnKind.ValidationElite)
            {
                return new[]
                {
                    "elite." + kind,
                    "elite",
                    kind,
                    "default"
                };
            }

            if (enemy.SpawnKind == EnemySpawnKind.Bounty)
            {
                return new[]
                {
                    "bounty." + kind,
                    "bounty",
                    kind,
                    "default"
                };
            }

            return new[] { kind, "default" };
        }

        private static string EnemyKindId(EnemyKind kind)
        {
            switch (kind)
            {
                case EnemyKind.Fast:
                    return "fast";
                case EnemyKind.Tank:
                    return "tank";
                case EnemyKind.Boss:
                    return "boss";
                default:
                    return "normal";
            }
        }
    }
}
