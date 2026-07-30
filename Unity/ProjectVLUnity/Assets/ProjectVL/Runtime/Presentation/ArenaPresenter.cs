using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class ArenaPresenter : MonoBehaviour
    {
        private readonly Dictionary<int, EnemyView> _enemyViews =
            new Dictionary<int, EnemyView>();
        private readonly Dictionary<int, Sprite> _enemySprites =
            new Dictionary<int, Sprite>();
        private readonly Dictionary<int, SpriteRenderer> _bulletViews =
            new Dictionary<int, SpriteRenderer>();
        private readonly Dictionary<int, DropView> _dropViews =
            new Dictionary<int, DropView>();
        private readonly Dictionary<int, DropView> _bountyOfferViews =
            new Dictionary<int, DropView>();
        private readonly List<SpriteRenderer> _groundZoneViews =
            new List<SpriteRenderer>();

        private CombatConfig _combat;
        private GameState _state;
        private VisualCatalog _visualCatalog;
        private Sprite _circleSprite;
        private Sprite _squareSprite;
        private Transform _turret;
        private LineRenderer _attackRange;
        private SpriteRenderer _decoyView;
        private SpriteRenderer _secondaryDecoyView;
        private SpriteRenderer _beamView;

        public int EnemyViewCount => _enemyViews.Count;
        public int BulletViewCount => _bulletViews.Count;
        public int DropViewCount => _dropViews.Count;
        public int BountyOfferViewCount => _bountyOfferViews.Count;
        public int GroundZoneViewCount => _groundZoneViews.Count;
        public int TransientViewCount =>
            EnemyViewCount
            + BulletViewCount
            + DropViewCount
            + BountyOfferViewCount
            + GroundZoneViewCount
            + (_decoyView == null ? 0 : 1)
            + (_secondaryDecoyView == null ? 0 : 1)
            + (_beamView == null ? 0 : 1);
        public VisualCatalog VisualCatalog => _visualCatalog;

        public void Initialize(
            CombatConfig combat,
            GameState state,
            VisualCatalog visualCatalog = null)
        {
            _combat = combat;
            _state = state;
            _visualCatalog = visualCatalog
                ?? Resources.Load<VisualCatalog>("VisualCatalog");
            _circleSprite = CreateCircleSprite();
            _squareSprite = CreateSquareSprite();

            CreateCamera();
            CreateArenaBorder();
            CreateAttackRange();
            CreateTurret();
        }

        public void Sync()
        {
            if (_state == null)
            {
                return;
            }

            _turret.rotation = Quaternion.Euler(
                0f,
                0f,
                -_state.TurretAngleRadians * Mathf.Rad2Deg);
            UpdateAttackRange();
            SyncEnemies();
            SyncBullets();
            SyncDrops();
            SyncBountyOffers();
            SyncGroundZones();
            SyncDecoy();
            SyncBeam();
        }

        public bool TryScreenToArenaPoint(
            Vector3 screenPoint,
            out Float2 arenaPoint)
        {
            Camera camera = Camera.main;
            if (camera == null || !GetArenaScreenRect().Contains(screenPoint))
            {
                arenaPoint = new Float2();
                return false;
            }

            Vector3 world = camera.ScreenToWorldPoint(screenPoint);
            arenaPoint = new Float2(
                world.x + _combat.canvas.width / 2f,
                _combat.canvas.height / 2f - world.y);
            return true;
        }

        public Rect GetArenaGuiRect()
        {
            Rect screenRect = GetArenaScreenRect();
            return new Rect(
                screenRect.x,
                Screen.height - screenRect.yMax,
                screenRect.width,
                screenRect.height);
        }

        private Rect GetArenaScreenRect()
        {
            Camera camera = Camera.main;
            if (camera == null || _combat == null)
            {
                return new Rect(0f, 0f, Screen.width, Screen.height);
            }

            Vector3 bottomLeft = camera.WorldToScreenPoint(
                new Vector3(
                    -_combat.canvas.width / 2f,
                    -_combat.canvas.height / 2f,
                    0f));
            Vector3 topRight = camera.WorldToScreenPoint(
                new Vector3(
                    _combat.canvas.width / 2f,
                    _combat.canvas.height / 2f,
                    0f));
            return Rect.MinMaxRect(
                bottomLeft.x,
                bottomLeft.y,
                topRight.x,
                topRight.y);
        }

        private void CreateCamera()
        {
            Camera camera = Camera.main;
            if (camera == null)
            {
                var cameraObject = new GameObject("Main Camera");
                cameraObject.tag = "MainCamera";
                camera = cameraObject.AddComponent<Camera>();
            }

            camera.transform.position = new Vector3(0f, 0f, -10f);
            camera.orthographic = true;
            camera.orthographicSize = _combat.canvas.height / 2f + 1f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.02f, 0.055f, 0.10f);
        }

        private void CreateArenaBorder()
        {
            var borderObject = new GameObject("Arena Border");
            borderObject.transform.SetParent(transform, false);
            var line = borderObject.AddComponent<LineRenderer>();
            line.loop = true;
            line.useWorldSpace = true;
            line.positionCount = 4;
            line.startWidth = 2f;
            line.endWidth = 2f;
            line.material = new Material(Shader.Find("Sprites/Default"));
            line.startColor = new Color(0.18f, 0.55f, 0.72f, 0.8f);
            line.endColor = line.startColor;
            line.SetPositions(new[]
            {
                PixelToWorld(new Float2(0f, 0f)),
                PixelToWorld(new Float2(_combat.canvas.width, 0f)),
                PixelToWorld(new Float2(_combat.canvas.width, _combat.canvas.height)),
                PixelToWorld(new Float2(0f, _combat.canvas.height))
            });
        }

        private void CreateAttackRange()
        {
            const int segments = 96;
            var rangeObject = new GameObject("Attack Range");
            rangeObject.transform.SetParent(transform, false);
            var line = rangeObject.AddComponent<LineRenderer>();
            _attackRange = line;
            line.loop = true;
            line.useWorldSpace = true;
            line.positionCount = segments;
            line.startWidth = 1.5f;
            line.endWidth = 1.5f;
            line.material = new Material(Shader.Find("Sprites/Default"));
            line.startColor = new Color(0.25f, 0.8f, 1f, 0.28f);
            line.endColor = line.startColor;

            for (int index = 0; index < segments; index++)
            {
                float angle = index * Mathf.PI * 2f / segments;
                var point = new Float2(
                    _combat.turret.x + Mathf.Cos(angle) * AttackRange(),
                    _combat.turret.y + Mathf.Sin(angle) * AttackRange());
                line.SetPosition(index, PixelToWorld(point));
            }
        }

        private void UpdateAttackRange()
        {
            if (_attackRange == null)
            {
                return;
            }

            int segments = _attackRange.positionCount;
            for (int index = 0; index < segments; index++)
            {
                float angle = index * Mathf.PI * 2f / segments;
                var point = new Float2(
                    _combat.turret.x + Mathf.Cos(angle) * AttackRange(),
                    _combat.turret.y + Mathf.Sin(angle) * AttackRange());
                _attackRange.SetPosition(index, PixelToWorld(point));
            }
        }

        private float AttackRange()
        {
            return _combat.defaults.range + (_state?.RunRangeAdd ?? 0f);
        }

        private void CreateTurret()
        {
            var turretObject = new GameObject("Turret");
            turretObject.transform.SetParent(transform, false);
            turretObject.transform.position = PixelToWorld(
                new Float2(_combat.turret.x, _combat.turret.y));
            _turret = turretObject.transform;

            SpriteRenderer body = CreateSpriteView(
                "Turret Body",
                CatalogSprite(
                    _visualCatalog?.ResolveTurretSprite("main"),
                    _circleSprite),
                new Color(0.25f, 0.88f, 1f));
            body.transform.SetParent(_turret, false);
            SetWorldSize(body, 30f, 30f);
            body.sortingOrder = 20;

            SpriteRenderer barrel = CreateSpriteView(
                "Turret Barrel",
                _squareSprite,
                new Color(0.65f, 0.95f, 1f));
            barrel.transform.SetParent(_turret, false);
            barrel.transform.localPosition = new Vector3(19f, 0f, 0f);
            barrel.transform.localScale = new Vector3(38f, 7f, 1f);
            barrel.sortingOrder = 19;
        }

        private void SyncEnemies()
        {
            var activeIds = new HashSet<int>();
            foreach (EnemyState enemy in _state.Enemies)
            {
                activeIds.Add(enemy.Id);
                if (!_enemyViews.TryGetValue(enemy.Id, out EnemyView view))
                {
                    view = CreateEnemyView(enemy);
                    _enemyViews.Add(enemy.Id, view);
                }

                view.Root.position = PixelToWorld(enemy.Position);
                float pulse = enemy.Kind == EnemyKind.Boss
                    && enemy.BossPhase == BossPhase.Contact
                    ? 1f + Mathf.Sin(_state.Time * 12f) * 0.08f
                    : 1f;
                view.Root.localScale = new Vector3(pulse, pulse, 1f);
                float healthRatio = Mathf.Clamp01(enemy.Hp / enemy.MaxHp);
                Sprite catalogSprite =
                    _visualCatalog?.ResolveEnemySprite(enemy);
                if (catalogSprite != null
                    && view.Body.sprite != catalogSprite)
                {
                    view.Body.sprite = catalogSprite;
                    view.Outline.sprite = catalogSprite;
                    SetWorldSize(
                        view.Body,
                        enemy.Radius * 2f,
                        enemy.Radius * 2f);
                    float outlineSize =
                        enemy.Radius * 2f
                        + (enemy.Kind == EnemyKind.Boss ? 10f : 7f);
                    SetWorldSize(
                        view.Outline,
                        outlineSize,
                        outlineSize);
                }
                view.Body.color = Color.Lerp(
                    new Color(0.35f, 0.1f, 0.15f),
                    catalogSprite == null
                        ? EnemyColor(enemy)
                        : Color.white,
                    healthRatio);
                Color outline = EnemyOutlineColor(enemy);
                view.Outline.color = outline;
                view.Outline.gameObject.SetActive(outline.a > 0f);
                float healthWidth = enemy.Radius * 2f * healthRatio;
                view.HealthFill.transform.localScale = new Vector3(
                    healthWidth,
                    4f,
                    1f);
                view.HealthFill.transform.localPosition = new Vector3(
                    -enemy.Radius + healthWidth / 2f,
                    enemy.Radius + 9f,
                    -0.2f);
            }

            RemoveMissingEnemyViews(activeIds);
        }

        private EnemyView CreateEnemyView(EnemyState enemy)
        {
            var rootObject = new GameObject(
                $"{enemy.Label} {enemy.Id}");
            rootObject.transform.SetParent(transform, false);

            Sprite catalogSprite =
                _visualCatalog?.ResolveEnemySprite(enemy);
            Sprite sprite = catalogSprite ?? EnemySprite(enemy.Sides);
            SpriteRenderer outline = CreateSpriteView(
                "Status Outline",
                sprite,
                EnemyOutlineColor(enemy));
            outline.transform.SetParent(rootObject.transform, false);
            float outlineSize =
                enemy.Radius * 2f
                + (enemy.Kind == EnemyKind.Boss ? 10f : 7f);
            SetWorldSize(outline, outlineSize, outlineSize);
            outline.sortingOrder = 9;

            SpriteRenderer body = CreateSpriteView(
                "Body",
                sprite,
                catalogSprite == null ? EnemyColor(enemy) : Color.white);
            body.transform.SetParent(rootObject.transform, false);
            SetWorldSize(body, enemy.Radius * 2f, enemy.Radius * 2f);
            body.sortingOrder = 10;

            SpriteRenderer core = CreateSpriteView(
                "Core",
                _circleSprite,
                new Color(0.02f, 0.06f, 0.11f, 0.9f));
            core.transform.SetParent(rootObject.transform, false);
            core.transform.localScale = new Vector3(
                enemy.Radius * 0.76f,
                enemy.Radius * 0.76f,
                1f);
            core.sortingOrder = 11;

            SpriteRenderer healthBackground = CreateSpriteView(
                "Health Background",
                _squareSprite,
                new Color(1f, 1f, 1f, 0.14f));
            healthBackground.transform.SetParent(rootObject.transform, false);
            healthBackground.transform.localPosition = new Vector3(
                0f,
                enemy.Radius + 9f,
                -0.2f);
            healthBackground.transform.localScale = new Vector3(
                enemy.Radius * 2f,
                4f,
                1f);
            healthBackground.sortingOrder = 12;

            SpriteRenderer healthFill = CreateSpriteView(
                "Health Fill",
                _squareSprite,
                enemy.Kind == EnemyKind.Boss
                    ? new Color(0.94f, 0.86f, 0.64f)
                    : new Color(0.72f, 0.78f, 0.84f));
            healthFill.transform.SetParent(rootObject.transform, false);
            healthFill.sortingOrder = 13;

            return new EnemyView(
                rootObject.transform,
                outline,
                body,
                healthFill);
        }

        private void SyncBullets()
        {
            var activeIds = new HashSet<int>();
            foreach (BulletState bullet in _state.Bullets)
            {
                activeIds.Add(bullet.Id);
                if (!_bulletViews.TryGetValue(bullet.Id, out SpriteRenderer view))
                {
                    view = CreateSpriteView(
                        $"Bullet {bullet.Id}",
                        CatalogSprite(
                            _visualCatalog?.ResolveProjectileSprite("default"),
                            _circleSprite),
                        new Color(0.55f, 0.95f, 1f));
                    view.transform.SetParent(transform, false);
                    SetWorldSize(
                        view,
                        bullet.Radius * 2f,
                        bullet.Radius * 2f);
                    view.sortingOrder = 15;
                    _bulletViews.Add(bullet.Id, view);
                }

                view.transform.position = PixelToWorld(bullet.Position);
            }

            RemoveMissingViews(_bulletViews, activeIds);
        }

        private void SyncDrops()
        {
            var activeIds = new HashSet<int>();
            foreach (GroundDropState drop in _state.GroundDrops)
            {
                activeIds.Add(drop.Id);
                if (!_dropViews.TryGetValue(drop.Id, out DropView view))
                {
                    SpriteRenderer renderer = CreateSpriteView(
                        $"Card Drop {drop.Id}",
                        CatalogSprite(
                            _visualCatalog?.ResolveDropSprite(drop.CardType),
                            _squareSprite),
                        new Color(0.25f, 0.9f, 0.72f));
                    renderer.transform.SetParent(transform, false);
                    SetWorldSize(renderer, 30f, 38f);
                    renderer.sortingOrder = 16;

                    var labelObject = new GameObject("Drop Label");
                    labelObject.transform.SetParent(renderer.transform, false);
                    labelObject.transform.localPosition =
                        new Vector3(0f, 0f, -0.1f);
                    labelObject.transform.localScale =
                        new Vector3(0.035f, 0.035f, 1f);
                    TextMesh label = labelObject.AddComponent<TextMesh>();
                    label.anchor = TextAnchor.MiddleCenter;
                    label.alignment = TextAlignment.Center;
                    label.fontSize = 32;
                    label.color = new Color(0.03f, 0.12f, 0.16f);
                    label.GetComponent<MeshRenderer>().sortingOrder = 17;

                    view = new DropView(renderer, label);
                    _dropViews.Add(drop.Id, view);
                }

                view.Renderer.transform.position = PixelToWorld(drop.Position);
                float lifeRatio = Mathf.Clamp01(
                    drop.LifeRemaining / drop.MaxLife);
                view.Renderer.color = Color.Lerp(
                    new Color(1f, 0.28f, 0.18f),
                    new Color(0.25f, 0.9f, 0.72f),
                    lifeRatio);
                view.Label.text =
                    $"{drop.Star} STAR\n{drop.LifeRemaining:0.0}s";
            }

            var removedIds = new List<int>();
            foreach (KeyValuePair<int, DropView> pair in _dropViews)
            {
                if (!activeIds.Contains(pair.Key))
                {
                    DestroyRuntimeObject(pair.Value.Renderer.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                _dropViews.Remove(id);
            }
        }

        private void SyncBountyOffers()
        {
            var activeIds = new HashSet<int>();
            foreach (BountyOfferState offer in _state.BountyOffers)
            {
                activeIds.Add(offer.Id);
                if (!_bountyOfferViews.TryGetValue(
                    offer.Id,
                    out DropView view))
                {
                    SpriteRenderer renderer = CreateSpriteView(
                        $"Bounty Offer {offer.Id}",
                        CatalogSprite(
                            _visualCatalog?.ResolveDropSprite("bounty"),
                            _circleSprite),
                        new Color(1f, 0.68f, 0.12f, 0.82f));
                    renderer.transform.SetParent(transform, false);
                    SetWorldSize(renderer, 60f, 60f);
                    renderer.sortingOrder = 18;

                    var labelObject = new GameObject("Bounty Label");
                    labelObject.transform.SetParent(
                        renderer.transform,
                        false);
                    labelObject.transform.localPosition =
                        new Vector3(0f, 0f, -0.1f);
                    labelObject.transform.localScale =
                        new Vector3(0.028f, 0.028f, 1f);
                    TextMesh label = labelObject.AddComponent<TextMesh>();
                    label.anchor = TextAnchor.MiddleCenter;
                    label.alignment = TextAlignment.Center;
                    label.fontSize = 30;
                    label.color = new Color(0.15f, 0.07f, 0.01f);
                    label.GetComponent<MeshRenderer>().sortingOrder = 19;

                    view = new DropView(renderer, label);
                    _bountyOfferViews.Add(offer.Id, view);
                }

                view.Renderer.transform.position =
                    PixelToWorld(offer.Position);
                float lifeRatio = Mathf.Clamp01(
                    offer.Remaining / offer.MaxRemaining);
                float pulse = 1f
                    + Mathf.Sin(_state.Time * 6f) * 0.08f;
                SetWorldSize(
                    view.Renderer,
                    60f * pulse,
                    60f * pulse);
                view.Renderer.color = Color.Lerp(
                    new Color(1f, 0.2f, 0.12f, 0.72f),
                    offer.Guaranteed
                        ? new Color(1f, 0.9f, 0.2f, 0.95f)
                        : new Color(1f, 0.68f, 0.12f, 0.85f),
                    lifeRatio);
                view.Label.text =
                    $"BOUNTY\n{offer.RewardCardStar} STAR\n"
                    + $"{offer.Remaining:0.0}s";
            }

            var removedIds = new List<int>();
            foreach (KeyValuePair<int, DropView> pair in _bountyOfferViews)
            {
                if (!activeIds.Contains(pair.Key))
                {
                    DestroyRuntimeObject(pair.Value.Renderer.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                _bountyOfferViews.Remove(id);
            }
        }

        private void SyncDecoy()
        {
            SyncDecoyView(
                ref _decoyView,
                "Decoy",
                _state.DecoyActive,
                _state.DecoyPosition,
                _state.DecoyHp,
                _state.DecoyIsMirrorTurret);
            SyncDecoyView(
                ref _secondaryDecoyView,
                "DecoySecondary",
                _state.SecondaryDecoyActive,
                _state.SecondaryDecoyPosition,
                _state.SecondaryDecoyHp,
                false);
        }

        private void SyncGroundZones()
        {
            while (_groundZoneViews.Count < _state.GroundZones.Count)
            {
                SpriteRenderer view = CreateSpriteView(
                    "Burning Ground",
                    _circleSprite,
                    new Color(1f, 0.25f, 0.05f, 0.24f));
                view.transform.SetParent(transform, false);
                view.sortingOrder = 4;
                _groundZoneViews.Add(view);
            }

            while (_groundZoneViews.Count > _state.GroundZones.Count)
            {
                int last = _groundZoneViews.Count - 1;
                DestroyRuntimeObject(_groundZoneViews[last].gameObject);
                _groundZoneViews.RemoveAt(last);
            }

            for (int index = 0;
                index < _state.GroundZones.Count;
                index++)
            {
                GroundZoneState zone = _state.GroundZones[index];
                SpriteRenderer view = _groundZoneViews[index];
                view.transform.position = PixelToWorld(zone.Position);
                view.transform.localScale = new Vector3(
                    zone.Radius * 2f,
                    zone.Radius * 2f,
                    1f);
            }
        }

        private void SyncDecoyView(
            ref SpriteRenderer view,
            string viewName,
            bool active,
            Float2 position,
            float hp,
            bool mirrorTurret)
        {
            if (!active)
            {
                if (view != null)
                {
                    DestroyRuntimeObject(view.gameObject);
                    view = null;
                }

                return;
            }

            if (view == null)
            {
                view = CreateSpriteView(
                    viewName,
                    _squareSprite,
                    mirrorTurret
                        ? new Color(0.78f, 0.54f, 1f)
                        : new Color(1f, 0.65f, 0.2f));
                view.transform.SetParent(transform, false);
                view.transform.localScale =
                    new Vector3(24f, 24f, 1f);
                view.sortingOrder = 14;
            }

            view.transform.position = PixelToWorld(position);
            view.color = Color.Lerp(
                mirrorTurret
                    ? new Color(0.16f, 0.08f, 0.28f)
                    : new Color(0.4f, 0.15f, 0.05f),
                mirrorTurret
                    ? new Color(0.78f, 0.54f, 1f)
                    : new Color(1f, 0.65f, 0.2f),
                Mathf.Clamp01(hp / _state.DecoyMaxHp));
        }

        private void SyncBeam()
        {
            if (_state.BeamVisualRemaining <= 0f)
            {
                if (_beamView != null)
                {
                    DestroyRuntimeObject(_beamView.gameObject);
                    _beamView = null;
                }

                return;
            }

            if (_beamView == null)
            {
                _beamView = CreateSpriteView(
                    "PierceBeam",
                    _squareSprite,
                    new Color(0.45f, 0.95f, 1f, 0.75f));
                _beamView.transform.SetParent(transform, false);
                _beamView.sortingOrder = 13;
            }

            Vector3 start = PixelToWorld(_state.BeamVisualStart);
            Vector3 end = PixelToWorld(_state.BeamVisualEnd);
            Vector3 delta = end - start;
            _beamView.transform.position = (start + end) * 0.5f;
            _beamView.transform.rotation =
                Quaternion.FromToRotation(Vector3.right, delta);
            _beamView.transform.localScale = new Vector3(
                delta.magnitude,
                _state.BeamVisualWidth,
                1f);
        }

        private static void RemoveMissingViews(
            Dictionary<int, SpriteRenderer> views,
            HashSet<int> activeIds)
        {
            var removedIds = new List<int>();
            foreach (KeyValuePair<int, SpriteRenderer> pair in views)
            {
                if (!activeIds.Contains(pair.Key))
                {
                    DestroyRuntimeObject(pair.Value.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                views.Remove(id);
            }
        }

        private void RemoveMissingEnemyViews(HashSet<int> activeIds)
        {
            var removedIds = new List<int>();
            foreach (KeyValuePair<int, EnemyView> pair in _enemyViews)
            {
                if (!activeIds.Contains(pair.Key))
                {
                    DestroyRuntimeObject(pair.Value.Root.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                _enemyViews.Remove(id);
            }
        }

        private Vector3 PixelToWorld(Float2 point)
        {
            return new Vector3(
                point.X - _combat.canvas.width / 2f,
                _combat.canvas.height / 2f - point.Y,
                0f);
        }

        private static void DestroyRuntimeObject(Object target)
        {
            if (target == null)
                return;

            if (Application.isPlaying)
                Destroy(target);
            else
                DestroyImmediate(target);
        }

        private static Sprite CatalogSprite(
            Sprite sprite,
            Sprite fallback)
        {
            return sprite != null ? sprite : fallback;
        }

        private static void SetWorldSize(
            SpriteRenderer renderer,
            float width,
            float height)
        {
            Vector2 spriteSize = renderer.sprite == null
                ? Vector2.one
                : renderer.sprite.bounds.size;
            renderer.transform.localScale = new Vector3(
                width / Mathf.Max(0.0001f, spriteSize.x),
                height / Mathf.Max(0.0001f, spriteSize.y),
                1f);
        }

        private static Color EnemyColor(EnemyState enemy)
        {
            if (enemy.FrozenRemaining > 0f)
            {
                return new Color(0.45f, 0.95f, 1f);
            }

            if (enemy.DotRemaining > 0f
                || enemy.SecondaryDotRemaining > 0f)
            {
                return new Color(1f, 0.35f, 0.15f);
            }

            if (enemy.SlowRemaining > 0f)
            {
                return new Color(0.35f, 0.65f, 1f);
            }

            if (enemy.SpawnKind == EnemySpawnKind.ValidationElite)
            {
                return new Color(1f, 0.78f, 0.22f);
            }

            if (enemy.SpawnKind == EnemySpawnKind.Bounty)
            {
                return new Color(1f, 0.45f, 0.08f);
            }

            switch (enemy.Kind)
            {
                case EnemyKind.Fast:
                    return new Color(1f, 0.72f, 0.25f);
                case EnemyKind.Tank:
                    return new Color(0.65f, 0.45f, 0.9f);
                case EnemyKind.Boss:
                    return new Color(1f, 0.25f, 0.35f);
                default:
                    return new Color(0.55f, 0.65f, 0.75f);
            }
        }

        private static Color EnemyOutlineColor(EnemyState enemy)
        {
            if (enemy.FrozenRemaining > 0f)
            {
                return new Color(0.55f, 0.93f, 1f, 0.95f);
            }

            if (enemy.SlowRemaining > 0f)
            {
                return new Color(0.45f, 0.78f, 1f, 0.65f);
            }

            if (enemy.Kind == EnemyKind.Boss)
            {
                return enemy.BossPhase == BossPhase.Contact
                    ? new Color(1f, 0.35f, 0.22f, 0.95f)
                    : new Color(0.94f, 0.86f, 0.64f, 0.9f);
            }

            if (enemy.SpawnKind == EnemySpawnKind.ValidationElite)
            {
                return new Color(1f, 0.78f, 0.22f, 0.9f);
            }

            if (enemy.SpawnKind == EnemySpawnKind.Bounty)
            {
                return new Color(1f, 0.45f, 0.08f, 0.8f);
            }

            return Color.clear;
        }

        private Sprite EnemySprite(int sides)
        {
            int clampedSides = Mathf.Max(3, sides);
            if (!_enemySprites.TryGetValue(clampedSides, out Sprite sprite))
            {
                sprite = CreatePolygonSprite(clampedSides);
                _enemySprites[clampedSides] = sprite;
            }

            return sprite;
        }

        private static SpriteRenderer CreateSpriteView(
            string objectName,
            Sprite sprite,
            Color color)
        {
            var viewObject = new GameObject(objectName);
            var renderer = viewObject.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;
            renderer.color = color;
            return renderer;
        }

        private static Sprite CreateSquareSprite()
        {
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.name = "Runtime Square";
            texture.SetPixel(0, 0, Color.white);
            texture.Apply();
            return Sprite.Create(
                texture,
                new Rect(0f, 0f, 1f, 1f),
                new Vector2(0.5f, 0.5f),
                1f);
        }

        private static Sprite CreateCircleSprite()
        {
            const int size = 64;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.name = "Runtime Circle";
            var pixels = new Color[size * size];
            var center = new Vector2((size - 1) / 2f, (size - 1) / 2f);
            float radius = size / 2f - 1f;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float distance = Vector2.Distance(new Vector2(x, y), center);
                    pixels[y * size + x] = distance <= radius
                        ? Color.white
                        : Color.clear;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply();
            return Sprite.Create(
                texture,
                new Rect(0f, 0f, size, size),
                new Vector2(0.5f, 0.5f),
                size);
        }

        private static Sprite CreatePolygonSprite(int sides)
        {
            const int size = 64;
            var texture = new Texture2D(
                size,
                size,
                TextureFormat.RGBA32,
                false);
            texture.name = $"Runtime Polygon {sides}";
            var pixels = new Color[size * size];
            float half = (size - 1) / 2f;
            float sectorSize = Mathf.PI * 2f / sides;
            float apothem = Mathf.Cos(Mathf.PI / sides);

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float px = (x - half) / half;
                    float py = (y - half) / half;
                    float radius = Mathf.Sqrt(px * px + py * py);
                    float angle = Mathf.Atan2(py, px) + Mathf.PI / 2f;
                    float localAngle = Mathf.Repeat(
                        angle + sectorSize / 2f,
                        sectorSize) - sectorSize / 2f;
                    float boundary = apothem / Mathf.Cos(localAngle);
                    pixels[y * size + x] = radius <= boundary
                        ? Color.white
                        : Color.clear;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply();
            return Sprite.Create(
                texture,
                new Rect(0f, 0f, size, size),
                new Vector2(0.5f, 0.5f),
                size);
        }

        private sealed class EnemyView
        {
            public Transform Root { get; }
            public SpriteRenderer Outline { get; }
            public SpriteRenderer Body { get; }
            public SpriteRenderer HealthFill { get; }

            public EnemyView(
                Transform root,
                SpriteRenderer outline,
                SpriteRenderer body,
                SpriteRenderer healthFill)
            {
                Root = root;
                Outline = outline;
                Body = body;
                HealthFill = healthFill;
            }
        }

        private sealed class DropView
        {
            public SpriteRenderer Renderer { get; }
            public TextMesh Label { get; }

            public DropView(SpriteRenderer renderer, TextMesh label)
            {
                Renderer = renderer;
                Label = label;
            }
        }
    }
}
