using NUnit.Framework;
using ProjectVL.Editor;
using UnityEditor;
using UnityEditor.U2D;
using UnityEngine;
using UnityEngine.U2D;

namespace ProjectVL.Tests
{
    public sealed class ArtPipelineTests
    {
        [Test]
        public void ImportPolicyScopesArtAudioAndFineUiPaths()
        {
            Assert.That(
                ArtImportPolicy.IsProjectArtPath(
                    "Assets/ProjectVL/Art/Sprites/Enemies/tank.png"),
                Is.True);
            Assert.That(
                ArtImportPolicy.IsProjectArtPath(
                    "Assets/Other/tank.png"),
                Is.False);
            Assert.That(
                ArtImportPolicy.IsProjectAudioPath(
                    "Assets/ProjectVL/Art/Audio/SFX/hit.wav"),
                Is.True);
            Assert.That(
                ArtImportPolicy.IsProjectAudioPath(
                    "Assets/ProjectVL/Art/Sprites/hit.png"),
                Is.False);
            Assert.That(
                ArtImportPolicy.IsFineUiPath(
                    "Assets/ProjectVL/Art/UI/panel.png"),
                Is.True);
            Assert.That(
                ArtImportPolicy.IsFineUiPath(
                    "Assets/ProjectVL/Art/Sprites/Enemies/tank.png"),
                Is.False);
        }

        [TestCase("Gameplay", 6, TextureImporterFormat.ASTC_6x6)]
        [TestCase("Cards", 1, TextureImporterFormat.ASTC_6x6)]
        [TestCase("UI", 1, TextureImporterFormat.ASTC_4x4)]
        public void SpriteAtlasUsesStablePackingAndAndroidLimits(
            string name,
            int packableCount,
            TextureImporterFormat androidFormat)
        {
            SpriteAtlas atlas = AssetDatabase.LoadAssetAtPath<SpriteAtlas>(
                $"Assets/ProjectVL/Art/Atlases/{name}.spriteatlas");

            Assert.That(atlas, Is.Not.Null);
            SpriteAtlasPackingSettings packing =
                SpriteAtlasExtensions.GetPackingSettings(atlas);
            SpriteAtlasTextureSettings texture =
                SpriteAtlasExtensions.GetTextureSettings(atlas);
            TextureImporterPlatformSettings android =
                SpriteAtlasExtensions.GetPlatformSettings(atlas, "Android");
            Assert.That(packing.enableRotation, Is.False);
            Assert.That(packing.enableTightPacking, Is.False);
            Assert.That(packing.padding, Is.EqualTo(4));
            Assert.That(texture.generateMipMaps, Is.False);
            Assert.That(
                SpriteAtlasExtensions.GetPackables(atlas).Length,
                Is.EqualTo(packableCount));
            Assert.That(android.overridden, Is.True);
            Assert.That(
                android.maxTextureSize,
                Is.EqualTo(ArtImportPolicy.AndroidMaxSize));
            Assert.That(android.format, Is.EqualTo(androidFormat));
        }
    }
}
