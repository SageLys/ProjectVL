using ProjectVL.Presentation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ProjectVL.Editor
{
    public static class ProjectSetup
    {
        private const string MainScenePath = "Assets/ProjectVL/Scenes/Main.unity";

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
    }
}
