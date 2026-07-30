using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Presentation;
using UnityEngine;

namespace ProjectVL.Tests
{
    public sealed class VisualCatalogTests
    {
        [Test]
        public void SpriteResolutionUsesSpecificThenDefaultThenNull()
        {
            Sprite fallback = CreateSprite();
            Sprite specific = CreateSprite();
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            catalog.projectiles = new[]
            {
                new VisualResourceEntry { id = "default", sprite = fallback },
                new VisualResourceEntry { id = "pierce", sprite = specific },
                new VisualResourceEntry { id = "empty" }
            };

            try
            {
                Assert.That(
                    catalog.ResolveProjectileSprite("pierce"),
                    Is.SameAs(specific));
                Assert.That(
                    catalog.ResolveProjectileSprite("empty"),
                    Is.SameAs(fallback));
                Assert.That(
                    catalog.ResolveProjectileSprite("missing"),
                    Is.SameAs(fallback));
                catalog.projectiles = new VisualResourceEntry[0];
                Assert.That(
                    catalog.ResolveProjectileSprite("missing"),
                    Is.Null);
            }
            finally
            {
                Object.DestroyImmediate(catalog);
                DestroySprite(specific);
                DestroySprite(fallback);
            }
        }

        [Test]
        public void EnemyResolutionHonorsBossEliteBountyAndKindPrecedence()
        {
            Sprite fallback = CreateSprite();
            Sprite bossContact = CreateSprite();
            Sprite eliteTank = CreateSprite();
            Sprite bounty = CreateSprite();
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            catalog.enemies = new[]
            {
                new VisualResourceEntry { id = "default", sprite = fallback },
                new VisualResourceEntry
                {
                    id = "boss.contact",
                    sprite = bossContact
                },
                new VisualResourceEntry
                {
                    id = "elite.tank",
                    sprite = eliteTank
                },
                new VisualResourceEntry { id = "bounty", sprite = bounty }
            };

            try
            {
                var boss = Enemy(
                    EnemyKind.Boss,
                    EnemySpawnKind.Regular);
                boss.BossPhase = BossPhase.Contact;
                var elite = Enemy(
                    EnemyKind.Tank,
                    EnemySpawnKind.ValidationElite);
                var bountyEnemy = Enemy(
                    EnemyKind.Fast,
                    EnemySpawnKind.Bounty);
                var normal = Enemy(
                    EnemyKind.Normal,
                    EnemySpawnKind.Regular);

                Assert.That(
                    catalog.ResolveEnemySprite(boss),
                    Is.SameAs(bossContact));
                Assert.That(
                    catalog.ResolveEnemySprite(elite),
                    Is.SameAs(eliteTank));
                Assert.That(
                    catalog.ResolveEnemySprite(bountyEnemy),
                    Is.SameAs(bounty));
                Assert.That(
                    catalog.ResolveEnemySprite(normal),
                    Is.SameAs(fallback));
            }
            finally
            {
                Object.DestroyImmediate(catalog);
                DestroySprite(bounty);
                DestroySprite(eliteTank);
                DestroySprite(bossContact);
                DestroySprite(fallback);
            }
        }

        [Test]
        public void DefaultCatalogHasEveryConfiguredCardAndGodSlot()
        {
            VisualCatalog catalog =
                Resources.Load<VisualCatalog>("VisualCatalog");
            CardsConfig cards = GameConfigLoader.LoadCards();
            GodsConfig gods = GameConfigLoader.LoadGods();

            Assert.That(catalog, Is.Not.Null);
            Assert.That(cards.cards.Length, Is.EqualTo(41));
            Assert.That(gods.gods.Length, Is.EqualTo(5));
            foreach (CardDefinitionConfig card in cards.cards)
            {
                Assert.That(
                    catalog.HasCardSlot(card.id),
                    Is.True,
                    $"Missing card visual slot: {card.id}");
            }

            foreach (GodConfig god in gods.gods)
            {
                Assert.That(
                    catalog.HasGodSlot(god.id),
                    Is.True,
                    $"Missing god visual slot: {god.id}");
                Assert.That(
                    catalog.FindGod(god.id).accent,
                    Is.Not.EqualTo(Color.clear));
            }
        }

        [Test]
        public void ArenaPresenterInstantiatesEnemyPrefabAndStatusOverlay()
        {
            Sprite bodySprite = CreateSprite();
            Sprite overlaySprite = CreateSprite();
            var prefab = new GameObject("Enemy Prefab Template");
            var authoredMarker = new GameObject("Authored Marker");
            authoredMarker.transform.SetParent(prefab.transform, false);
            authoredMarker.AddComponent<SpriteRenderer>().sprite = bodySprite;
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            catalog.enemies = new[]
            {
                new VisualResourceEntry
                {
                    id = "normal",
                    sprite = bodySprite,
                    prefab = prefab,
                    statusOverlay = overlaySprite
                }
            };
            var root = new GameObject("Visual Catalog Presenter Test");
            GameObject createdCamera = null;
            if (Camera.main == null)
            {
                createdCamera = new GameObject("Visual Catalog Test Camera");
                createdCamera.tag = "MainCamera";
                createdCamera.AddComponent<Camera>();
            }

            try
            {
                CombatConfig combat = CombatConfigLoader.LoadDefault();
                GameState state = GameStateFactory.Create(
                    combat,
                    GameConfigLoader.LoadEconomy());
                var presenter = root.AddComponent<ArenaPresenter>();
                presenter.Initialize(combat, state, catalog);
                state.Enemies.Add(new EnemyState(
                    7,
                    EnemyKind.Normal,
                    new Float2(0f, 0f),
                    100f,
                    0f,
                    12f,
                    1f));

                presenter.Sync();

                Transform enemyRoot = root.transform.Find("Normal 7");
                Assert.That(enemyRoot, Is.Not.Null);
                Transform marker = enemyRoot.Find(
                    "Authored Visual/Authored Marker");
                Assert.That(marker, Is.Not.Null);
                Assert.That(
                    marker.GetComponent<SpriteRenderer>().sprite,
                    Is.SameAs(bodySprite));
                Assert.That(
                    enemyRoot.Find("Status Outline")
                        .GetComponent<SpriteRenderer>()
                        .sprite,
                    Is.SameAs(overlaySprite));

                state.Enemies.Clear();
                presenter.Sync();
                Assert.That(root.transform.Find("Normal 7"), Is.Null);
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(prefab);
                Object.DestroyImmediate(catalog);
                if (createdCamera != null)
                    Object.DestroyImmediate(createdCamera);
                DestroySprite(overlaySprite);
                DestroySprite(bodySprite);
            }
        }

        private static EnemyState Enemy(
            EnemyKind kind,
            EnemySpawnKind spawnKind)
        {
            return new EnemyState(
                1,
                kind,
                new Float2(0f, 0f),
                100f,
                0f,
                12f,
                1f,
                spawnKind);
        }

        private static Sprite CreateSprite()
        {
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.SetPixel(0, 0, Color.white);
            texture.Apply();
            return Sprite.Create(
                texture,
                new Rect(0f, 0f, 1f, 1f),
                new Vector2(0.5f, 0.5f),
                1f);
        }

        private static void DestroySprite(Sprite sprite)
        {
            Texture texture = sprite.texture;
            Object.DestroyImmediate(sprite);
            Object.DestroyImmediate(texture);
        }
    }
}
