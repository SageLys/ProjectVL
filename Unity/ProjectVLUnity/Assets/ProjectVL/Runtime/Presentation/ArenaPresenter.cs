using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;
using UnityEngine;

namespace ProjectVL.Presentation
{
    public sealed class ArenaPresenter : MonoBehaviour
    {
        private readonly Dictionary<int, SpriteRenderer> _enemyViews =
            new Dictionary<int, SpriteRenderer>();
        private readonly Dictionary<int, SpriteRenderer> _bulletViews =
            new Dictionary<int, SpriteRenderer>();
        private readonly Dictionary<int, DropView> _dropViews =
            new Dictionary<int, DropView>();

        private CombatConfig _combat;
        private GameState _state;
        private Sprite _circleSprite;
        private Sprite _squareSprite;
        private Transform _turret;
        private SpriteRenderer _decoyView;
        private SpriteRenderer _secondaryDecoyView;
        private SpriteRenderer _beamView;

        public void Initialize(CombatConfig combat, GameState state)
        {
            _combat = combat;
            _state = state;
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
            SyncEnemies();
            SyncBullets();
            SyncDrops();
            SyncDecoy();
            SyncBeam();
        }

        public bool TryScreenToArenaPoint(
            Vector3 screenPoint,
            out Float2 arenaPoint)
        {
            Camera camera = Camera.main;
            if (camera == null)
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
            camera.orthographicSize = _combat.canvas.height / 2f + 20f;
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
                    _combat.turret.x + Mathf.Cos(angle) * _combat.defaults.range,
                    _combat.turret.y + Mathf.Sin(angle) * _combat.defaults.range);
                line.SetPosition(index, PixelToWorld(point));
            }
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
                _circleSprite,
                new Color(0.25f, 0.88f, 1f));
            body.transform.SetParent(_turret, false);
            body.transform.localScale = new Vector3(30f, 30f, 1f);
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
                if (!_enemyViews.TryGetValue(enemy.Id, out SpriteRenderer view))
                {
                    view = CreateSpriteView(
                        $"Enemy {enemy.Id}",
                        _circleSprite,
                        EnemyColor(enemy));
                    view.transform.SetParent(transform, false);
                    view.transform.localScale = new Vector3(
                        enemy.Radius * 2f,
                        enemy.Radius * 2f,
                        1f);
                    view.sortingOrder = 10;
                    _enemyViews.Add(enemy.Id, view);
                }

                view.transform.position = PixelToWorld(enemy.Position);
                float healthRatio = Mathf.Clamp01(enemy.Hp / enemy.MaxHp);
                view.color = Color.Lerp(
                    new Color(0.35f, 0.1f, 0.15f),
                    EnemyColor(enemy),
                    healthRatio);
            }

            RemoveMissingViews(_enemyViews, activeIds);
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
                        _circleSprite,
                        new Color(0.55f, 0.95f, 1f));
                    view.transform.SetParent(transform, false);
                    view.transform.localScale = new Vector3(
                        bullet.Radius * 2f,
                        bullet.Radius * 2f,
                        1f);
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
                        _squareSprite,
                        new Color(0.25f, 0.9f, 0.72f));
                    renderer.transform.SetParent(transform, false);
                    renderer.transform.localScale =
                        new Vector3(30f, 38f, 1f);
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
                    Destroy(pair.Value.Renderer.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                _dropViews.Remove(id);
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
                    Destroy(view.gameObject);
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
                    Destroy(_beamView.gameObject);
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
                    Destroy(pair.Value.gameObject);
                    removedIds.Add(pair.Key);
                }
            }

            foreach (int id in removedIds)
            {
                views.Remove(id);
            }
        }

        private Vector3 PixelToWorld(Float2 point)
        {
            return new Vector3(
                point.X - _combat.canvas.width / 2f,
                _combat.canvas.height / 2f - point.Y,
                0f);
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
