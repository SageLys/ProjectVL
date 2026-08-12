using System;
using System.Collections.Generic;
using System.IO;
using ProjectVL.Config;
using ProjectVL.Presentation;
using UnityEditor;
using UnityEngine;

namespace ProjectVL.Editor
{
    public sealed class CardArtBindingRow
    {
        public CardDefinitionConfig Card { get; }
        public VisualResourceEntry CardVisual { get; }
        public VisualResourceEntry DropVisual { get; }

        public CardArtBindingRow(
            CardDefinitionConfig card,
            VisualResourceEntry cardVisual,
            VisualResourceEntry dropVisual)
        {
            Card = card;
            CardVisual = cardVisual;
            DropVisual = dropVisual;
        }
    }

    public static class CardArtBindingUtility
    {
        public const string CatalogPath =
            "Assets/ProjectVL/Resources/VisualCatalog.asset";
        public const string CardArtFolder =
            "Assets/ProjectVL/Art/Sprites/Cards";

        public static List<CardArtBindingRow> BuildRows(
            VisualCatalog catalog,
            CardsConfig cards)
        {
            var rows = new List<CardArtBindingRow>();
            if (catalog == null || cards?.cards == null)
                return rows;

            foreach (CardDefinitionConfig card in cards.cards)
            {
                if (card == null || string.IsNullOrEmpty(card.id))
                    continue;

                rows.Add(new CardArtBindingRow(
                    card,
                    FindExact(catalog.cards, card.id),
                    FindExact(catalog.drops, card.id)));
            }

            return rows;
        }

        public static void AssignSprite(
            CardArtBindingRow row,
            Sprite sprite)
        {
            if (row?.CardVisual != null)
                row.CardVisual.sprite = sprite;
            if (row?.DropVisual != null)
                row.DropVisual.sprite = sprite;
        }

        public static int AutoMatchEmpty(
            IList<CardArtBindingRow> rows)
        {
            if (rows == null)
                return 0;

            Dictionary<string, Sprite> sprites = LoadCardSprites();
            int matched = 0;
            foreach (CardArtBindingRow row in rows)
            {
                if (row?.Card == null
                    || row.CardVisual == null
                    || row.CardVisual.sprite != null
                    || !sprites.TryGetValue(row.Card.id, out Sprite sprite))
                {
                    continue;
                }

                AssignSprite(row, sprite);
                matched++;
            }

            return matched;
        }

        public static int AssignedCount(IList<CardArtBindingRow> rows)
        {
            int count = 0;
            if (rows == null)
                return count;

            foreach (CardArtBindingRow row in rows)
            {
                if (row?.CardVisual?.sprite != null)
                    count++;
            }

            return count;
        }

        private static Dictionary<string, Sprite> LoadCardSprites()
        {
            var result = new Dictionary<string, Sprite>(
                StringComparer.OrdinalIgnoreCase);
            string[] guids = AssetDatabase.FindAssets(
                "t:Texture2D",
                new[] { CardArtFolder });
            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                PrepareAsSprite(path);
                Sprite sprite = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                if (sprite == null)
                    continue;

                string id = Path.GetFileNameWithoutExtension(path);
                if (!string.IsNullOrEmpty(id) && !result.ContainsKey(id))
                    result.Add(id, sprite);
            }

            return result;
        }

        private static void PrepareAsSprite(string path)
        {
            TextureImporter importer =
                AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
                return;

            if (ConfigureCardTexture(importer))
                importer.SaveAndReimport();
        }

        public static bool ConfigureCardTexture(TextureImporter importer)
        {
            if (importer == null)
                return false;

            bool changed = false;
            if (importer.textureType != TextureImporterType.Sprite)
            {
                importer.textureType = TextureImporterType.Sprite;
                changed = true;
            }

            if (importer.spriteImportMode != SpriteImportMode.Single)
            {
                importer.spriteImportMode = SpriteImportMode.Single;
                changed = true;
            }

            if (importer.mipmapEnabled)
            {
                importer.mipmapEnabled = false;
                changed = true;
            }

            if (!importer.alphaIsTransparency)
            {
                importer.alphaIsTransparency = true;
                changed = true;
            }

            if (importer.spritePixelsPerUnit != 100f)
            {
                importer.spritePixelsPerUnit = 100f;
                changed = true;
            }

            if (importer.maxTextureSize != 2048)
            {
                importer.maxTextureSize = 2048;
                changed = true;
            }

            return changed;
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
                {
                    return entry;
                }
            }

            return null;
        }
    }

    public sealed class CardArtAssetPostprocessor : AssetPostprocessor
    {
        private void OnPreprocessTexture()
        {
            string prefix = CardArtBindingUtility.CardArtFolder + "/";
            if (!assetPath.StartsWith(
                prefix,
                StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            CardArtBindingUtility.ConfigureCardTexture(
                assetImporter as TextureImporter);
        }
    }

    public sealed class CardArtBindingWindow : EditorWindow
    {
        private enum CardFilter
        {
            All,
            Base,
            Recipe
        }

        private VisualCatalog _catalog;
        private List<CardArtBindingRow> _rows =
            new List<CardArtBindingRow>();
        private Vector2 _scroll;
        private string _search = string.Empty;
        private CardFilter _filter;
        private bool _missingOnly;

        [MenuItem("ProjectVL/美术/卡牌美术配表")]
        public static void Open()
        {
            CardArtBindingWindow window = GetWindow<CardArtBindingWindow>();
            window.titleContent = new GUIContent("卡牌美术配表");
            window.minSize = new Vector2(780f, 520f);
            window.Show();
        }

        private void OnEnable()
        {
            Reload();
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8f);
            EditorGUILayout.LabelField(
                "卡牌美术配表",
                EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "把卡牌图片拖到右侧图片槽即可自动保存。推荐把PNG放入 "
                + CardArtBindingUtility.CardArtFolder
                + "；文件名与卡牌ID一致时，可使用自动匹配。",
                MessageType.Info);

            DrawActions();
            DrawFilters();
            DrawSummary();
            DrawHeader();
            DrawRows();
        }

        private void DrawActions()
        {
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("刷新60张卡牌清单", GUILayout.Height(28f)))
                {
                    VisualCatalogBuilder.CreateOrRefresh();
                    Reload();
                }

                if (GUILayout.Button("按文件名自动匹配空槽", GUILayout.Height(28f)))
                    AutoMatch();
                if (GUILayout.Button("打开卡牌图片目录", GUILayout.Height(28f)))
                    PingCardFolder();
                if (GUILayout.Button("保存配表", GUILayout.Height(28f)))
                    Save();
            }
        }

        private void DrawFilters()
        {
            EditorGUILayout.Space(4f);
            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                GUILayout.Label("查找", GUILayout.Width(34f));
                _search = GUILayout.TextField(
                    _search,
                    EditorStyles.toolbarSearchField,
                    GUILayout.MinWidth(180f));
                _filter = (CardFilter)GUILayout.Toolbar(
                    (int)_filter,
                    new[] { "全部", "35张基础卡", "25张合成卡" },
                    EditorStyles.toolbarButton,
                    GUILayout.Width(300f));
                _missingOnly = GUILayout.Toggle(
                    _missingOnly,
                    "仅未配置",
                    EditorStyles.toolbarButton,
                    GUILayout.Width(82f));
            }
        }

        private void DrawSummary()
        {
            int assigned = CardArtBindingUtility.AssignedCount(_rows);
            EditorGUILayout.LabelField(
                $"配置进度：{assigned}/{_rows.Count}　未配置：{_rows.Count - assigned}",
                EditorStyles.miniBoldLabel);
        }

        private static void DrawHeader()
        {
            using (new EditorGUILayout.HorizontalScope(EditorStyles.helpBox))
            {
                GUILayout.Label("流派", EditorStyles.boldLabel, GUILayout.Width(72f));
                GUILayout.Label("类型", EditorStyles.boldLabel, GUILayout.Width(72f));
                GUILayout.Label("卡牌名称与ID", EditorStyles.boldLabel, GUILayout.Width(260f));
                GUILayout.FlexibleSpace();
                GUILayout.Label("卡牌图片", EditorStyles.boldLabel, GUILayout.Width(180f));
            }
        }

        private void DrawRows()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            foreach (CardArtBindingRow row in _rows)
            {
                if (!ShouldShow(row))
                    continue;

                DrawRow(row);
            }

            EditorGUILayout.EndScrollView();
        }

        private void DrawRow(CardArtBindingRow row)
        {
            CardDefinitionConfig card = row.Card;
            using (new EditorGUILayout.HorizontalScope(EditorStyles.helpBox))
            {
                GUILayout.Label(
                    GodName(card.god),
                    GUILayout.Width(72f),
                    GUILayout.Height(56f));
                GUILayout.Label(
                    card.recipeOnly ? "合成卡" : "基础卡",
                    GUILayout.Width(72f),
                    GUILayout.Height(56f));
                using (new EditorGUILayout.VerticalScope(GUILayout.Width(260f)))
                {
                    GUILayout.Space(7f);
                    GUILayout.Label(
                        string.IsNullOrEmpty(card.displayName)
                            ? card.id
                            : card.displayName,
                        EditorStyles.boldLabel);
                    EditorGUILayout.SelectableLabel(
                        card.id,
                        EditorStyles.miniLabel,
                        GUILayout.Height(18f));
                }

                GUILayout.FlexibleSpace();
                Sprite current = row.CardVisual?.sprite;
                EditorGUI.BeginChangeCheck();
                Sprite selected = (Sprite)EditorGUILayout.ObjectField(
                    current,
                    typeof(Sprite),
                    false,
                    GUILayout.Width(180f),
                    GUILayout.Height(56f));
                if (EditorGUI.EndChangeCheck())
                {
                    Undo.RecordObject(_catalog, "Bind card art");
                    CardArtBindingUtility.AssignSprite(row, selected);
                    Save();
                }
            }
        }

        private bool ShouldShow(CardArtBindingRow row)
        {
            if (row?.Card == null)
                return false;
            if (_filter == CardFilter.Base && row.Card.recipeOnly)
                return false;
            if (_filter == CardFilter.Recipe && !row.Card.recipeOnly)
                return false;
            if (_missingOnly && row.CardVisual?.sprite != null)
                return false;
            if (string.IsNullOrWhiteSpace(_search))
                return true;

            string search = _search.Trim();
            return Contains(row.Card.id, search)
                || Contains(row.Card.displayName, search)
                || Contains(row.Card.god, search)
                || Contains(GodName(row.Card.god), search);
        }

        private void Reload()
        {
            _catalog = AssetDatabase.LoadAssetAtPath<VisualCatalog>(
                CardArtBindingUtility.CatalogPath);
            CardsConfig cards = GameConfigLoader.LoadCards();
            _rows = CardArtBindingUtility.BuildRows(_catalog, cards);
            Repaint();
        }

        private void AutoMatch()
        {
            int matched = CardArtBindingUtility.AutoMatchEmpty(_rows);
            Save();
            int remaining = _rows.Count
                - CardArtBindingUtility.AssignedCount(_rows);
            EditorUtility.DisplayDialog(
                "卡牌美术自动匹配",
                $"本次成功匹配 {matched} 张，仍有 {remaining} 张未配置。\n\n"
                + "未匹配图片请确认文件名与卡牌ID完全一致。",
                "确定");
        }

        private void Save()
        {
            if (_catalog == null)
                return;

            EditorUtility.SetDirty(_catalog);
            AssetDatabase.SaveAssets();
            Repaint();
        }

        private static void PingCardFolder()
        {
            DefaultAsset folder = AssetDatabase.LoadAssetAtPath<DefaultAsset>(
                CardArtBindingUtility.CardArtFolder);
            Selection.activeObject = folder;
            EditorGUIUtility.PingObject(folder);
        }

        private static bool Contains(string value, string search)
        {
            return !string.IsNullOrEmpty(value)
                && value.IndexOf(
                    search,
                    StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string GodName(string god)
        {
            switch (god)
            {
                case "storm": return "迅霆";
                case "winter": return "凛冬";
                case "inferno": return "焚火";
                case "bulwark": return "壁垒";
                case "plenty": return "丰饶";
                default: return string.IsNullOrEmpty(god) ? "通用" : god;
            }
        }
    }
}
