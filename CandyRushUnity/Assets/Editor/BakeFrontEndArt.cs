using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class BakeFrontEndArt
{
    [MenuItem("CandyRush/Bake Spinning Lollipop Frames")]
    public static void Bake()
    {
        const int w = 128, h = 180, count = 24;
        var atlas = new Texture2D(w * 6, h * 4, TextureFormat.RGBA32, false);
        var pixels = new Color[w * h];
        for (int frame = 0; frame < count; frame++)
        {
            float phase = frame * Mathf.PI * 2 / count;
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
            {
                Color c = Color.clear;
                float dx = x - 64, dy = y - 119;
                float r = Mathf.Sqrt(dx * dx + dy * dy);
                if (x >= 59 && x <= 69 && y >= 8 && y < 112)
                    c = Color.Lerp(new Color(.77f, .61f, .75f), Color.white, 1 - Mathf.Abs(x - 63) / 8f);
                if (r < 53)
                {
                    float spiral = Mathf.Sin(Mathf.Atan2(dy, dx) * 3 + r * .12f - phase);
                    float stripe = Mathf.SmoothStep(0, 1, Mathf.Clamp01(spiral * 4 + .5f));
                    c = Color.Lerp(new Color(1, .18f, .55f), new Color(1, .94f, .98f), stripe);
                    float shade = .72f + .28f * Mathf.Sqrt(Mathf.Max(0, 1 - r * r / (53 * 53)));
                    c *= shade; c.a = Mathf.Clamp01(53 - r);
                    float highlight = Mathf.Exp(-((dx + 19) * (dx + 19) / 140f + (dy - 23) * (dy - 23) / 65f)) * .7f;
                    c = Color.Lerp(c, Color.white, highlight);
                }
                pixels[y * w + x] = c;
            }
            atlas.SetPixels(frame % 6 * w, frame / 6 * h, w, h, pixels);
        }
        atlas.Apply();
        const string path = "Assets/Resources/Candy/Menu/Lollipop.png";
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        File.WriteAllBytes(path, atlas.EncodeToPNG());
        Object.DestroyImmediate(atlas);
        AssetDatabase.Refresh();
        foreach (var asset in new[] { "Backdrop", "Logo", "Rabbits", "Lollipop" })
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath("Assets/Resources/Candy/Menu/" + asset + ".png");
            if (importer == null) continue;
            importer.alphaIsTransparency = asset != "Backdrop";
            importer.mipmapEnabled = false;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.maxTextureSize = 2048;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            if (asset == "Lollipop")
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Multiple;
                var frames = new SpriteMetaData[count];
                for (int i = 0; i < count; i++) frames[i] = new SpriteMetaData {
                    name = "Lollipop_" + i.ToString("D2"), rect = new Rect(i % 6 * w, i / 6 * h, w, h),
                    alignment = (int)SpriteAlignment.Center, pivot = new Vector2(.5f, .5f) };
#pragma warning disable 0618
                importer.spritesheet = frames;
#pragma warning restore 0618
            }
            importer.SaveAndReimport();
        }
        var sprites = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>().OrderBy(s => s.name).ToArray();
        var clip = new AnimationClip { frameRate = 12, name = "LollipopSpin" };
        var keys = new ObjectReferenceKeyframe[count + 1];
        for (int i = 0; i <= count; i++) keys[i] = new ObjectReferenceKeyframe { time = i / 12f, value = sprites[i % count] };
        AnimationUtility.SetObjectReferenceCurve(clip, new EditorCurveBinding { path = "", type = typeof(SpriteRenderer), propertyName = "m_Sprite" }, keys);
        var settings = AnimationUtility.GetAnimationClipSettings(clip);
        settings.loopTime = true;
        AnimationUtility.SetAnimationClipSettings(clip, settings);
        Directory.CreateDirectory("Assets/CandyRush/Animations");
        const string clipPath = "Assets/CandyRush/Animations/LollipopSpin.anim";
        var existing = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
        if (existing != null) { EditorUtility.CopySerialized(clip, existing); Object.DestroyImmediate(clip); }
        else AssetDatabase.CreateAsset(clip, clipPath);
        AssetDatabase.SaveAssets();
        Debug.Log("LOLLIPOP_BAKE_OK: 24 frames, 12 fps, 2 second loop");
    }
}
