using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class RabbitKartPrefabBuilder
{
    [MenuItem("Tools/Rabbit Kart/Criar prefab")]
    public static void CriarPrefab()
    {
        const string modelos = "Assets/Models/RabbitKarts/";
        var personagens = (KartVisuals.Personagem[])Enum.GetValues(typeof(KartVisuals.Personagem));
        var aparencias = new KartVisuals.Aparencia[personagens.Length];
        for (int i = 0; i < personagens.Length; i++)
        {
            string caminho = modelos + "RabbitKart_" + personagens[i] + ".glb";
            GameObject modelo = AssetDatabase.LoadAssetAtPath<GameObject>(caminho);
            if (modelo == null)
                throw new InvalidOperationException("Aguarde a importacao pelo glTFast: " + caminho);
            aparencias[i] = new KartVisuals.Aparencia {
                personagem = personagens[i],
                materiais = modelo.GetComponentsInChildren<Renderer>(true)
                    .SelectMany(r => r.sharedMaterials).Where(m => m != null).Distinct().ToArray()
            };
        }

        GameObject origem = AssetDatabase.LoadAssetAtPath<GameObject>(modelos + "RabbitKart_Nuvem.glb");
        GameObject instancia = (GameObject)PrefabUtility.InstantiatePrefab(origem);
        try
        {
            PrefabUtility.UnpackPrefabInstance(instancia, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            // Mantem o componente no pivo real, mesmo se o importador criar um wrapper.
            Transform raiz = instancia.GetComponentsInChildren<Transform>(true)
                .First(t => t.Find("Kart_Body") != null);
            KartVisuals visuals = raiz.gameObject.AddComponent<KartVisuals>();
            visuals.aparencias = aparencias;
            if (!AssetDatabase.IsValidFolder("Assets/Prefabs"))
                AssetDatabase.CreateFolder("Assets", "Prefabs");
            string destino = AssetDatabase.GenerateUniqueAssetPath("Assets/Prefabs/RabbitKart.prefab");
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(instancia, destino);
            if (prefab == null) throw new InvalidOperationException("Falha ao criar " + destino);
            Selection.activeObject = prefab;
            EditorGUIUtility.PingObject(prefab);
            Debug.Log("Rabbit Kart configurado: " + destino);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(instancia);
        }
    }
}
