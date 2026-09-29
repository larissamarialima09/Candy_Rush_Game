using System.IO;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Separa "Assets/Resources/Candy/Menu/Logo.png" (1536x1024, o mesmo
/// tamanho já usado pelo logo atual) em duas camadas para o
/// <see cref="LogoCandyRush"/> animar: a base (sem a cabeça do pirulito) e
/// a cabeça sozinha (o círculo do doce, para girar por cima do buraco).
///
/// O corte usa uma elipse fixa (mesmo centro/raio das constantes do script)
/// e não borra a borda de propósito: como a cabeça é um círculo, girá-la no
/// próprio lugar sempre cobre exatamente o mesmo buraco, então uma borda
/// dura encaixa perfeitamente em qualquer ângulo.
/// </summary>
public static class BakeCandyRushLogo
{
    const string SourcePath = "Assets/Resources/Candy/Menu/Logo.png";
    const string BasePath = "Assets/Resources/Candy/Menu/CandyRush_LogoBase.png";
    const string HeadPath = "Assets/Resources/Candy/Menu/CandyRush_Pirulito.png";

    // Mesmas medidas de LogoCandyRush.cs (imagem 1536x1024, Y a partir do topo).
    const float W = 1536f, H = 1024f;
    const float CX = 776f, CY = 203f, RX = 142f, RY = 108f;
    const float HeadPadding = 14f;

    [MenuItem("CandyRush/Bake Logo Sprites")]
    public static void Bake()
    {
        var bytes = File.ReadAllBytes(SourcePath);
        var source = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        source.LoadImage(bytes);
        if (source.width != (int)W || source.height != (int)H)
            Debug.LogWarning($"[CandyRush] Logo.png é {source.width}x{source.height}, mas as constantes de LogoCandyRush.cs esperam {W}x{H}. Os recortes podem não bater.");

        var srcPixels = source.GetPixels();
        int w = source.width, h = source.height;

        // Centro em coordenadas de Texture2D (Y=0 embaixo); CY vem do topo.
        float centerXBottomUp = CX;
        float centerYBottomUp = h - CY;

        // ---- Base: cópia com a elipse da cabeça zerada (alfa 0). ----
        var basePixels = (Color[])srcPixels.Clone();
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float dx = (x + 0.5f - centerXBottomUp) / RX;
                float dy = (y + 0.5f - centerYBottomUp) / RY;
                if (dx * dx + dy * dy <= 1f) basePixels[y * w + x] = Color.clear;
            }
        }
        var baseTex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        baseTex.SetPixels(basePixels);
        baseTex.Apply();
        SavePng(baseTex, BasePath);
        Object.DestroyImmediate(baseTex);

        // ---- Cabeça: recorte apertado em volta da mesma elipse. ----
        int cropW = Mathf.CeilToInt(RX * 2 + HeadPadding * 2);
        int cropH = Mathf.CeilToInt(RY * 2 + HeadPadding * 2);
        int originX = Mathf.RoundToInt(centerXBottomUp - cropW / 2f);
        int originY = Mathf.RoundToInt(centerYBottomUp - cropH / 2f);
        var headPixels = new Color[cropW * cropH];
        for (int y = 0; y < cropH; y++)
        {
            for (int x = 0; x < cropW; x++)
            {
                int sx = originX + x, sy = originY + y;
                Color c = Color.clear;
                if (sx >= 0 && sy >= 0 && sx < w && sy < h)
                {
                    float dx = (sx + 0.5f - centerXBottomUp) / RX;
                    float dy = (sy + 0.5f - centerYBottomUp) / RY;
                    if (dx * dx + dy * dy <= 1f) c = srcPixels[sy * w + sx];
                }
                headPixels[y * cropW + x] = c;
            }
        }
        var headTex = new Texture2D(cropW, cropH, TextureFormat.RGBA32, false);
        headTex.SetPixels(headPixels);
        headTex.Apply();
        SavePng(headTex, HeadPath);
        Object.DestroyImmediate(headTex);

        Object.DestroyImmediate(source);
        AssetDatabase.Refresh();

        foreach (var path in new[] { BasePath, HeadPath })
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            if (importer == null) continue;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
        }

        Debug.Log("LOGO_BAKE_OK: CandyRush_LogoBase.png e CandyRush_Pirulito.png gerados.");
    }

    static void SavePng(Texture2D tex, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        File.WriteAllBytes(path, tex.EncodeToPNG());
    }
}
