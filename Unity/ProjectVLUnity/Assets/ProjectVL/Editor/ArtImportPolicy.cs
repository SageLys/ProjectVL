using System;
using System.IO;
using UnityEditor;
using UnityEditor.U2D;
using UnityEngine;
using UnityEngine.U2D;

namespace ProjectVL.Editor
{
    public sealed class ArtImportPolicy : AssetPostprocessor
    {
        public const int PixelsPerUnit = 100;
        public const int DesktopMaxSize = 2048;
        public const int AndroidMaxSize = 1024;
        public const string ArtRoot = "Assets/ProjectVL/Art/";

        private void OnPreprocessTexture()
        {
            if (!IsProjectArtPath(assetPath)
                || !(assetImporter is TextureImporter importer))
                return;

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            var textureSettings = new TextureImporterSettings();
            importer.ReadTextureSettings(textureSettings);
            textureSettings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(textureSettings);
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.filterMode = FilterMode.Bilinear;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.maxTextureSize = DesktopMaxSize;

            TextureImporterPlatformSettings android =
                importer.GetPlatformTextureSettings("Android");
            android.name = "Android";
            android.overridden = true;
            android.maxTextureSize = AndroidMaxSize;
            android.format = IsFineUiPath(assetPath)
                ? TextureImporterFormat.ASTC_4x4
                : TextureImporterFormat.ASTC_6x6;
            android.compressionQuality = 50;
            importer.SetPlatformTextureSettings(android);
        }

        private void OnPreprocessAudio()
        {
            if (!IsProjectAudioPath(assetPath)
                || !(assetImporter is AudioImporter importer))
                return;

            bool music = assetPath.IndexOf(
                "/Music/",
                StringComparison.OrdinalIgnoreCase) >= 0;
            AudioImporterSampleSettings settings =
                importer.defaultSampleSettings;
            settings.loadType = music
                ? AudioClipLoadType.Streaming
                : AudioClipLoadType.DecompressOnLoad;
            settings.compressionFormat = AudioCompressionFormat.Vorbis;
            settings.quality = music ? 0.75f : 0.7f;
            settings.preloadAudioData = !music;
            importer.defaultSampleSettings = settings;
            importer.loadInBackground = music;
        }

        public static bool IsProjectArtPath(string path)
        {
            return !string.IsNullOrEmpty(path)
                && path.Replace('\\', '/').StartsWith(
                    ArtRoot,
                    StringComparison.Ordinal);
        }

        public static bool IsProjectAudioPath(string path)
        {
            string normalized = path?.Replace('\\', '/');
            return IsProjectArtPath(normalized)
                && normalized.IndexOf(
                    "/Audio/",
                    StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static bool IsFineUiPath(string path)
        {
            string normalized = path?.Replace('\\', '/');
            return IsProjectArtPath(normalized)
                && (normalized.IndexOf(
                        "/UI/",
                        StringComparison.OrdinalIgnoreCase) >= 0
                    || normalized.IndexOf(
                        "/Fonts/",
                        StringComparison.OrdinalIgnoreCase) >= 0);
        }
    }

    public static class SpriteAtlasBuilder
    {
        private const string AtlasRoot =
            "Assets/ProjectVL/Art/Atlases";

        [MenuItem("ProjectVL/Art/Create or Refresh Sprite Atlases")]
        public static void CreateOrRefresh()
        {
            CreateAtlas(
                "Gameplay",
                new[]
                {
                    "Assets/ProjectVL/Art/Sprites/Arena",
                    "Assets/ProjectVL/Art/Sprites/Turret",
                    "Assets/ProjectVL/Art/Sprites/Enemies",
                    "Assets/ProjectVL/Art/Sprites/Bosses",
                    "Assets/ProjectVL/Art/Sprites/Projectiles",
                    "Assets/ProjectVL/Art/Sprites/Drops"
                });
            CreateAtlas(
                "Cards",
                new[] { "Assets/ProjectVL/Art/Sprites/Cards" });
            CreateAtlas(
                "UI",
                new[] { "Assets/ProjectVL/Art/UI" },
                fineUi: true);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("ProjectVL SpriteAtlas assets are ready.");
        }

        public static void CreateOrRefreshFromCommandLine()
        {
            CreateOrRefresh();
            EditorApplication.Exit(0);
        }

        private static void CreateAtlas(
            string name,
            string[] packablePaths,
            bool fineUi = false)
        {
            string path = $"{AtlasRoot}/{name}.spriteatlas";
            SpriteAtlas atlas =
                AssetDatabase.LoadAssetAtPath<SpriteAtlas>(path);
            if (atlas == null)
            {
                atlas = new SpriteAtlas();
                AssetDatabase.CreateAsset(atlas, path);
            }

            SpriteAtlasPackingSettings packing =
                SpriteAtlasExtensions.GetPackingSettings(atlas);
            packing.enableRotation = false;
            packing.enableTightPacking = false;
            packing.padding = 4;
            SpriteAtlasExtensions.SetPackingSettings(atlas, packing);

            SpriteAtlasTextureSettings texture =
                SpriteAtlasExtensions.GetTextureSettings(atlas);
            texture.readable = false;
            texture.generateMipMaps = false;
            texture.sRGB = true;
            texture.filterMode = FilterMode.Bilinear;
            SpriteAtlasExtensions.SetTextureSettings(atlas, texture);

            TextureImporterPlatformSettings defaults =
                SpriteAtlasExtensions.GetPlatformSettings(
                    atlas,
                    "DefaultTexturePlatform");
            defaults.name = "DefaultTexturePlatform";
            defaults.overridden = false;
            defaults.maxTextureSize = ArtImportPolicy.DesktopMaxSize;
            SpriteAtlasExtensions.SetPlatformSettings(atlas, defaults);

            TextureImporterPlatformSettings android =
                SpriteAtlasExtensions.GetPlatformSettings(atlas, "Android");
            android.name = "Android";
            android.overridden = true;
            android.maxTextureSize = ArtImportPolicy.AndroidMaxSize;
            android.format = fineUi
                ? TextureImporterFormat.ASTC_4x4
                : TextureImporterFormat.ASTC_6x6;
            android.compressionQuality = 50;
            SpriteAtlasExtensions.SetPlatformSettings(atlas, android);

            UnityEngine.Object[] existing =
                SpriteAtlasExtensions.GetPackables(atlas);
            if (existing.Length > 0)
                SpriteAtlasExtensions.Remove(atlas, existing);
            var packables = new UnityEngine.Object[packablePaths.Length];
            for (int index = 0; index < packablePaths.Length; index++)
            {
                packables[index] = AssetDatabase.LoadAssetAtPath<
                    DefaultAsset>(packablePaths[index]);
                if (packables[index] == null)
                {
                    throw new DirectoryNotFoundException(
                        $"Missing SpriteAtlas source: {packablePaths[index]}");
                }
            }

            SpriteAtlasExtensions.Add(atlas, packables);
            EditorUtility.SetDirty(atlas);
        }
    }
}
