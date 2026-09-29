using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class BakeCandyBalloon
{
    [MenuItem("CandyRush/Bake Balloon Sprite Frames")]
    public static void Bake()
    {
        var scene = EditorSceneManager.NewPreviewScene();
        var oldAmbient = RenderSettings.ambientLight;
        RenderTexture target = null;
        Texture2D atlas = null, frame = null;
        try
        {
            RenderSettings.ambientLight = new Color(.7f, .65f, .75f);
            var model = new GameObject("Balloon source").AddComponent<BalaoDoce>();
            SceneManager.MoveGameObjectToScene(model.gameObject, scene);
            model.Construir();
            model.enabled = false;
            foreach (var t in model.GetComponentsInChildren<Transform>()) t.gameObject.layer = 31;
            var light = new GameObject("Softbox").AddComponent<Light>();
            SceneManager.MoveGameObjectToScene(light.gameObject, scene);
            light.type = LightType.Directional;
            light.intensity = 1.25f;
            light.cullingMask = 1 << 31;
            light.transform.rotation = Quaternion.Euler(35, -35, 0);
            var camera = new GameObject("Sprite camera").AddComponent<Camera>();
            SceneManager.MoveGameObjectToScene(camera.gameObject, scene);
            camera.scene = scene;
            camera.orthographic = true;
            camera.orthographicSize = 4.5f;
            camera.transform.position = new Vector3(0, -1.55f, -18);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.clear;
            camera.cullingMask = 1 << 31;
            camera.allowHDR = false;
            target = new RenderTexture(256, 256, 24, RenderTextureFormat.ARGB32);
            camera.targetTexture = target;
            atlas = new Texture2D(2048, 1536, TextureFormat.RGBA32, false);
            frame = new Texture2D(256, 256, TextureFormat.RGBA32, false);
            var originalTarget = RenderTexture.active;
            try
            {
                for (int i = 0; i < 48; i++)
                {
                    float phase = i * Mathf.PI * 2 / 48;
                    model.transform.localPosition = new Vector3(0, Mathf.Sin(phase) * .25f, 0);
                    model.transform.localRotation = Quaternion.Euler(0, i * 7.5f, Mathf.Sin(phase) * 4);
                    camera.Render();
                    RenderTexture.active = target;
                    frame.ReadPixels(new Rect(0, 0, 256, 256), 0, 0);
                    frame.Apply();
                    atlas.SetPixels(i % 8 * 256, i / 8 * 256, 256, 256, frame.GetPixels());
                }
                atlas.Apply();
                Directory.CreateDirectory("Assets/Resources/Candy");
                File.WriteAllBytes("Assets/Resources/Candy/Balloon.png", atlas.EncodeToPNG());
            }
            finally { RenderTexture.active = originalTarget; }
            AssetDatabase.Refresh();
            var importer = (TextureImporter)AssetImporter.GetAtPath("Assets/Resources/Candy/Balloon.png");
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            importer.maxTextureSize = 2048;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            var slices = new SpriteMetaData[48];
            for (int i = 0; i < 48; i++) slices[i] = new SpriteMetaData {
                name = "Balloon_" + i.ToString("D2"), rect = new Rect(i % 8 * 256, i / 8 * 256, 256, 256),
                alignment = (int)SpriteAlignment.Center, pivot = new Vector2(.5f, .5f) };
#pragma warning disable 0618
            importer.spritesheet = slices;
#pragma warning restore 0618
            importer.SaveAndReimport();
            Debug.Log("BALLOON_BAKE_OK: 48 transparent sprite frames");
        }
        finally
        {
            if (target != null) { target.Release(); Object.DestroyImmediate(target); }
            if (atlas != null) Object.DestroyImmediate(atlas);
            if (frame != null) Object.DestroyImmediate(frame);
            RenderSettings.ambientLight = oldAmbient;
            EditorSceneManager.ClosePreviewScene(scene);
        }
    }
}
