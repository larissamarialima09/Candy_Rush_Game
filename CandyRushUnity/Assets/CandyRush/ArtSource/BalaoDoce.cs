using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Balão de ar quente de doce, 100% procedural (sem modelo importado).
/// Envelope listrado em tons pastel, aro laranja, cordas e cesto de cupcake
/// com cobertura, granulado e cereja. Flutua, balança e gira devagar.
///
/// Uso: crie um GameObject vazio e adicione este componente. Pronto.
/// Funciona no Built-in (Standard) e no URP (Lit).
/// </summary>
public class BalaoDoce : MonoBehaviour
{
    [Header("Forma")]
    [SerializeField] float raio = 2f;
    [SerializeField] int listras = 12;
    [SerializeField] int segmentosPorListra = 6;
    [SerializeField] int aneis = 32;

    [Header("Cores (repetem em ciclo)")]
    [SerializeField] Color[] cores =
    {
        new Color(0.93f, 0.47f, 0.78f), // rosa
        new Color(0.71f, 0.55f, 0.92f), // lilás
        new Color(1.00f, 0.93f, 0.75f), // creme
        new Color(0.47f, 0.78f, 0.96f), // azul
        new Color(1.00f, 0.60f, 0.75f), // rosa claro
        new Color(0.78f, 0.47f, 0.90f), // roxo
    };

    [Header("Animação")]
    [SerializeField] float alturaFlutuar = 0.35f;
    [SerializeField] float velocidadeFlutuar = 1.2f;
    [SerializeField] float anguloBalanco = 4f;
    [SerializeField] float velocidadeGiro = 8f; // graus por segundo
    [SerializeField] bool faseAleatoria = true;

    Transform corpo;
    Vector3 posicaoInicial;
    float fase;

    void Start()
    {
        posicaoInicial = transform.localPosition;
        fase = faseAleatoria ? Random.value * 10f : 0f;
        Construir();
    }

    void Update()
    {
        float t = Time.time * velocidadeFlutuar + fase;
        transform.localPosition = posicaoInicial + Vector3.up * Mathf.Sin(t) * alturaFlutuar;

        // O balanço acontece no "corpo" para não brigar com o giro do objeto raiz.
        corpo.localRotation = Quaternion.Euler(
            Mathf.Sin(t * 0.8f) * anguloBalanco * 0.6f,
            0f,
            Mathf.Sin(t) * anguloBalanco);
        transform.Rotate(0f, velocidadeGiro * Time.deltaTime, 0f, Space.Self);
    }

    [ContextMenu("Reconstruir")]
    public void Construir()
    {
        if (corpo != null)
        {
            if (Application.isPlaying) Destroy(corpo.gameObject);
            else DestroyImmediate(corpo.gameObject);
        }
        corpo = new GameObject("Corpo").transform;
        corpo.SetParent(transform, false);

        float R = raio;

        // ---------- Envelope listrado ----------
        var perfil = new List<Vector2>();
        const float phiMax = Mathf.PI * 0.78f;
        int passosEsfera = aneis - 6;
        for (int i = 0; i <= passosEsfera; i++)
        {
            float phi = phiMax * i / passosEsfera;
            perfil.Add(new Vector2(R * Mathf.Sin(phi), R * 1.1f * Mathf.Cos(phi)));
        }
        Vector2 ultimo = perfil[perfil.Count - 1];
        Vector2 gargalo = new Vector2(R * 0.33f, -R * 1.45f);
        for (int i = 1; i <= 6; i++)
            perfil.Add(Vector2.Lerp(ultimo, gargalo, i / 6f));

        var materiaisListras = new Material[listras];
        for (int s = 0; s < listras; s++)
            materiaisListras[s] = Material(cores[s % cores.Length], 0.55f);

        Parte("Envelope", Torno(perfil, listras * segmentosPorListra, listras, 0f, 0), materiaisListras);

        // ---------- Aro ----------
        float yAro = gargalo.y - 0.08f * R;
        var aro = Parte("Aro", Toro(gargalo.x + 0.04f * R, 0.05f * R, 32, 10),
                        new[] { Material(new Color(0.95f, 0.55f, 0.20f), 0.6f) });
        aro.localPosition = new Vector3(0f, yAro, 0f);

        // ---------- Cesto de cupcake (forminha com pregas) ----------
        float yCestoTopo = yAro - 0.85f * R;
        float rTopo = 0.36f * R, rBase = 0.27f * R, hCesto = 0.3f * R;
        var perfilCesto = new List<Vector2>
        {
            new Vector2(0f, yCestoTopo),
            new Vector2(rTopo, yCestoTopo),
            new Vector2(rBase, yCestoTopo - hCesto),
            new Vector2(0f, yCestoTopo - hCesto),
        };
        Parte("Cesto", Torno(perfilCesto, 48, 1, 0.05f, 16),
              new[] { Material(new Color(0.80f, 0.48f, 0.24f), 0.25f) });

        // ---------- Cobertura ----------
        var perfilCobertura = new List<Vector2>();
        for (int i = 0; i <= 10; i++)
        {
            float a = Mathf.PI * 0.5f * i / 10f;
            perfilCobertura.Add(new Vector2(
                (rTopo + 0.04f * R) * Mathf.Cos(a),
                yCestoTopo - 0.03f * R + 0.22f * R * Mathf.Sin(a)));
        }
        Parte("Cobertura", Torno(perfilCobertura, 48, 1, 0.07f, 10),
              new[] { Material(new Color(1f, 0.98f, 0.96f), 0.4f) });

        // ---------- Granulado ----------
        Color[] coresGranulado =
        {
            new Color(1f, 0.35f, 0.47f), new Color(0.35f, 0.78f, 1f),
            new Color(1f, 0.82f, 0.27f), new Color(0.55f, 0.90f, 0.55f),
            new Color(0.78f, 0.47f, 0.94f),
        };
        var matsGranulado = new Material[coresGranulado.Length];
        for (int i = 0; i < coresGranulado.Length; i++) matsGranulado[i] = Material(coresGranulado[i], 0.7f);

        var rng = new System.Random(7);
        for (int i = 0; i < 22; i++)
        {
            float ang = (float)rng.NextDouble() * Mathf.PI * 2f;
            float d = Mathf.Sqrt((float)rng.NextDouble()) * 0.9f;
            float px = Mathf.Cos(ang) * d * rTopo;
            float pz = Mathf.Sin(ang) * d * rTopo;
            float py = yCestoTopo - 0.03f * R + 0.22f * R * Mathf.Sqrt(Mathf.Max(0f, 1f - d * d)) + 0.01f * R;

            var g = Primitiva(PrimitiveType.Capsule, "Granulado", matsGranulado[i % matsGranulado.Length]);
            g.localPosition = new Vector3(px, py, pz);
            g.localRotation = Quaternion.Euler(90f, (float)rng.NextDouble() * 360f, 0f);
            g.localScale = new Vector3(0.025f, 0.04f, 0.025f) * R;
        }

        // ---------- Cereja ----------
        var cereja = Primitiva(PrimitiveType.Sphere, "Cereja", Material(new Color(0.90f, 0.12f, 0.25f), 0.85f));
        cereja.localPosition = new Vector3(0f, yCestoTopo + 0.24f * R, 0f);
        cereja.localScale = Vector3.one * 0.12f * R;

        // ---------- Cordas ----------
        var matCorda = Material(new Color(0.45f, 0.33f, 0.25f), 0.1f);
        const int nCordas = 6;
        for (int i = 0; i < nCordas; i++)
        {
            float a = Mathf.PI * 2f * i / nCordas;
            var de = new Vector3(Mathf.Cos(a) * gargalo.x, yAro, Mathf.Sin(a) * gargalo.x);
            var para = new Vector3(Mathf.Cos(a) * rTopo * 0.95f, yCestoTopo, Mathf.Sin(a) * rTopo * 0.95f);
            Cilindro("Corda", de, para, 0.012f * R, matCorda);
        }
    }

    // ================= Utilitários de malha =================

    /// Gira um perfil (r, y) em volta do eixo Y. As fatias são divididas em
    /// "grupos" (submeshes) para as listras. ripple cria pregas de forminha.
    static Mesh Torno(List<Vector2> perfil, int segmentos, int grupos, float ripple, int nPregas)
    {
        var verts = new List<Vector3>();
        var uvs = new List<Vector2>();
        int linhas = perfil.Count;

        for (int j = 0; j < linhas; j++)
        {
            for (int k = 0; k <= segmentos; k++)
            {
                float th = Mathf.PI * 2f * k / segmentos;
                float r = perfil[j].x * (1f + ripple * Mathf.Cos(th * nPregas));
                verts.Add(new Vector3(Mathf.Cos(th) * r, perfil[j].y, Mathf.Sin(th) * r));
                uvs.Add(new Vector2((float)k / segmentos, (float)j / (linhas - 1)));
            }
        }

        var tris = new List<int>[grupos];
        for (int g = 0; g < grupos; g++) tris[g] = new List<int>();
        int porGrupo = Mathf.Max(1, segmentos / grupos);
        int w = segmentos + 1;

        for (int j = 0; j < linhas - 1; j++)
        {
            for (int k = 0; k < segmentos; k++)
            {
                int a = j * w + k, b = a + 1, c = a + w, d = c + 1;
                var lista = tris[Mathf.Min(grupos - 1, k / porGrupo)];
                lista.Add(a); lista.Add(b); lista.Add(c);
                lista.Add(b); lista.Add(d); lista.Add(c);
            }
        }

        var m = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
        m.SetVertices(verts);
        m.SetUVs(0, uvs);
        m.subMeshCount = grupos;
        for (int g = 0; g < grupos; g++) m.SetTriangles(tris[g], g);
        m.RecalculateNormals();
        m.RecalculateBounds();
        return m;
    }

    static Mesh Toro(float raioMaior, float raioMenor, int seg, int lados)
    {
        var verts = new List<Vector3>();
        var tris = new List<int>();
        for (int i = 0; i <= seg; i++)
        {
            float u = Mathf.PI * 2f * i / seg;
            for (int j = 0; j <= lados; j++)
            {
                float v = Mathf.PI * 2f * j / lados;
                float r = raioMaior + raioMenor * Mathf.Cos(v);
                verts.Add(new Vector3(Mathf.Cos(u) * r, raioMenor * Mathf.Sin(v), Mathf.Sin(u) * r));
            }
        }
        int w = lados + 1;
        for (int i = 0; i < seg; i++)
            for (int j = 0; j < lados; j++)
            {
                int a = i * w + j, b = a + 1, c = a + w, d = c + 1;
                tris.Add(a); tris.Add(c); tris.Add(b);
                tris.Add(b); tris.Add(c); tris.Add(d);
            }
        var m = new Mesh();
        m.SetVertices(verts);
        m.SetTriangles(tris, 0);
        m.RecalculateNormals();
        return m;
    }

    // ================= Utilitários de cena =================

    Transform Parte(string nome, Mesh malha, Material[] mats)
    {
        var go = new GameObject(nome);
        go.transform.SetParent(corpo, false);
        go.AddComponent<MeshFilter>().sharedMesh = malha;
        go.AddComponent<MeshRenderer>().sharedMaterials = mats;
        return go.transform;
    }

    Transform Primitiva(PrimitiveType tipo, string nome, Material mat)
    {
        var go = GameObject.CreatePrimitive(tipo);
        go.name = nome;
        if (Application.isPlaying) Destroy(go.GetComponent<Collider>());
        else DestroyImmediate(go.GetComponent<Collider>());
        go.GetComponent<MeshRenderer>().sharedMaterial = mat;
        go.transform.SetParent(corpo, false);
        return go.transform;
    }

    void Cilindro(string nome, Vector3 de, Vector3 para, float espessura, Material mat)
    {
        var t = Primitiva(PrimitiveType.Cylinder, nome, mat);
        Vector3 dir = para - de;
        t.localPosition = (de + para) * 0.5f;
        t.localRotation = Quaternion.FromToRotation(Vector3.up, dir);
        t.localScale = new Vector3(espessura, dir.magnitude * 0.5f, espessura);
    }

    static Material Material(Color cor, float brilho)
    {
        var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        var m = new Material(shader);
        m.SetColor("_BaseColor", cor); // URP
        m.SetColor("_Color", cor);     // Built-in
        m.SetFloat("_Smoothness", brilho);
        m.SetFloat("_Glossiness", brilho);
        return m;
    }
}
