using System;
using System.IO;
using ProjectVL.Presentation;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ProjectVL.Editor
{
    public static class ProjectSetup
    {
        private const string MainScenePath = "Assets/ProjectVL/Scenes/Main.unity";

        [InitializeOnLoadMethod]
        private static void RegisterDefaultScene()
        {
            EditorApplication.delayCall += OpenMainSceneWhenUntitled;
        }

        private static void OpenMainSceneWhenUntitled()
        {
            if (Application.isBatchMode
                || EditorApplication.isPlayingOrWillChangePlaymode
                || !string.IsNullOrEmpty(SceneManager.GetActiveScene().path)
                || AssetDatabase.LoadAssetAtPath<SceneAsset>(MainScenePath) == null)
            {
                return;
            }

            EditorSceneManager.OpenScene(MainScenePath, OpenSceneMode.Single);
        }

        [MenuItem("ProjectVL/Rebuild Main Scene")]
        public static void CreateMainScene()
        {
            if (!AssetDatabase.IsValidFolder("Assets/ProjectVL/Scenes"))
            {
                AssetDatabase.CreateFolder("Assets/ProjectVL", "Scenes");
            }

            Scene scene = EditorSceneManager.NewScene(
                NewSceneSetup.EmptyScene,
                NewSceneMode.Single);

            var root = new GameObject("ProjectVL Game");
            root.AddComponent<ProjectVLGameController>();

            EditorSceneManager.SaveScene(scene, MainScenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(MainScenePath, true)
            };
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"Created ProjectVL main scene at {MainScenePath}");
        }

        [MenuItem("ProjectVL/Build Windows")]
        public static void BuildWindows()
        {
            string outputPath = Path.GetFullPath(
                Path.Combine(Application.dataPath, "../Builds/Windows/ProjectVL.exe"));
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));

            var options = new BuildPlayerOptions
            {
                scenes = new[] { MainScenePath },
                locationPathName = outputPath,
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Windows build failed: {report.summary.result}");
            }

            Debug.Log(
                $"Built ProjectVL for Windows: {outputPath} "
                + $"({report.summary.totalSize} bytes)");
        }
    }
}
