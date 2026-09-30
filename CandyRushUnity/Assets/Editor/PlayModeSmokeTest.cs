using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// Roda a cena principal em modo de jogo por alguns quadros dentro do próprio
/// editor, em lote, só para pegar exceções de runtime (referência nula,
/// index fora da faixa) que a compilação não detecta. Sem GPU de verdade em
/// -nographics a única coisa que pode falhar são os shaders — o resto (a
/// montagem da cena inteira em Awake) já é sinal suficiente de que o
/// bootstrap não está quebrado.
/// </summary>
public static class PlayModeSmokeTest
{
    static int framesLeft;

    [MenuItem("CandyRush/Smoke Test Play Mode")]
    public static void Run()
    {
        EditorSceneManager.OpenScene("Assets/Scenes/Main.unity");
        framesLeft = 30;
        EditorApplication.update += Tick;
        EditorApplication.isPlaying = true;
    }

    static void Tick()
    {
        if (!EditorApplication.isPlaying) return;
        framesLeft--;
        if (framesLeft <= 0)
        {
            EditorApplication.update -= Tick;
            Debug.Log("SMOKE_TEST_OK");
            EditorApplication.isPlaying = false;
            EditorApplication.Exit(0);
        }
    }
}
