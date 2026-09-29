using CandyRush;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Monta a única cena do jogo: um GameObject vazio com o <see cref="GameManager"/>
/// (ele constrói tudo sozinho em Awake) e salva em Assets/Scenes/Main.unity,
/// registrada como a cena de build. Roda uma vez via linha de comando
/// (-executeMethod SceneBootstrap.Build) — não há nada para editar à mão aqui.
/// </summary>
public static class SceneBootstrap
{
    [MenuItem("CandyRush/Build Main Scene")]
    public static void Build()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        var go = new GameObject("GameManager");
        go.AddComponent<GameManager>();

        System.IO.Directory.CreateDirectory("Assets/Scenes");
        const string path = "Assets/Scenes/Main.unity";
        EditorSceneManager.SaveScene(scene, path);

        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(path, true) };

        Debug.Log($"Cena principal criada em {path} e registrada no build.");
    }
}
