using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Um pedacinho do `CanvasRenderingContext2D` do navegador, em software.
    ///
    /// As texturas do jogo (pista com confete, espiral de pirulito, listras,
    /// letreiros, céu da tela de menu) eram desenhadas em canvas na hora de
    /// carregar a página. Este rasterizador reproduz as chamadas usadas —
    /// retângulos, arcos, elipses, curvas de Bézier, traços com espessura,
    /// gradientes e texto — com antisserrilhado por supersampling, e entrega um
    /// `Texture2D` no fim.
    ///
    /// Coordenadas como no canvas: origem no canto de CIMA, y para baixo.
    /// </summary>
    public sealed class Canvas2D
    {
        public readonly int Width;
        public readonly int Height;
        /// <summary>Pixels RGBA em sRGB, linha 0 = topo.</summary>
        public readonly Color[] Pixels;

        public Color FillColor = Color.black;
        public Color StrokeColor = Color.black;
        public Gradient FillGradient;
        public float GlobalAlpha = 1f;
        public float LineWidth = 1f;
        public bool RoundCaps = true;

        readonly List<List<Vector2>> subpaths = new List<List<Vector2>>();
        List<Vector2> current;

        public Canvas2D(int width, int height)
        {
            Width = width;
            Height = height;
            Pixels = new Color[width * height];
        }

        // ---------------------------------------------------------- estilo ---

        public void Fill(string css) { FillColor = Hex.Css(css); FillGradient = null; }
        public void Fill(Color color) { FillColor = color; FillGradient = null; }
        public void Stroke(string css) { StrokeColor = Hex.Css(css); }

        /// <summary>Gradiente linear ou radial com paradas de cor.</summary>
        public sealed class Gradient
        {
            public bool Radial;
            public Vector2 A, B;
            public float R0, R1;
            readonly List<(float at, Color color)> stops = new List<(float, Color)>();

            public Gradient AddStop(float at, string css) => AddStop(at, Hex.Css(css));
            public Gradient AddStop(float at, Color color)
            {
                stops.Add((at, color));
                stops.Sort((x, y) => x.at.CompareTo(y.at));
                return this;
            }

            public Color At(float x, float y)
            {
                float t;
                if (Radial)
                {
                    float d = Vector2.Distance(new Vector2(x, y), B);
                    t = Mathf.Approximately(R1, R0) ? 1 : (d - R0) / (R1 - R0);
                }
                else
                {
                    Vector2 axis = B - A;
                    float len2 = axis.sqrMagnitude;
                    t = len2 < 1e-9f ? 0 : Vector2.Dot(new Vector2(x, y) - A, axis) / len2;
                }
                if (stops.Count == 0) return Color.clear;
                if (t <= stops[0].at) return stops[0].color;
                for (int i = 1; i < stops.Count; i++)
                {
                    if (t <= stops[i].at)
                    {
                        var (a, ca) = stops[i - 1];
                        var (b, cb) = stops[i];
                        float k = b - a < 1e-6f ? 1 : (t - a) / (b - a);
                        return Color.Lerp(ca, cb, k);
                    }
                }
                return stops[stops.Count - 1].color;
            }
        }

        public static Gradient Linear(float x0, float y0, float x1, float y1) =>
            new Gradient { A = new Vector2(x0, y0), B = new Vector2(x1, y1) };

        public static Gradient Radial(float x, float y, float r0, float r1) =>
            new Gradient { Radial = true, A = new Vector2(x, y), B = new Vector2(x, y), R0 = r0, R1 = r1 };

        // ---------------------------------------------------------- pixels ---

        /// <summary>Mistura "source-over" em sRGB, como o canvas.</summary>
        void Blend(int x, int y, Color c, float coverage)
        {
            if (x < 0 || y < 0 || x >= Width || y >= Height) return;
            float a = c.a * coverage * GlobalAlpha;
            if (a <= 0) return;
            int i = y * Width + x;
            Color dst = Pixels[i];
            float outA = a + dst.a * (1 - a);
            if (outA <= 1e-6f) { Pixels[i] = Color.clear; return; }
            Pixels[i] = new Color(
                (c.r * a + dst.r * dst.a * (1 - a)) / outA,
                (c.g * a + dst.g * dst.a * (1 - a)) / outA,
                (c.b * a + dst.b * dst.a * (1 - a)) / outA,
                outA);
        }

        Color PaintAt(int x, int y) => FillGradient != null ? FillGradient.At(x + 0.5f, y + 0.5f) : FillColor;

        public void FillRect(float x, float y, float w, float h)
        {
            int x0 = Mathf.Max(0, Mathf.FloorToInt(x)), x1 = Mathf.Min(Width, Mathf.CeilToInt(x + w));
            int y0 = Mathf.Max(0, Mathf.FloorToInt(y)), y1 = Mathf.Min(Height, Mathf.CeilToInt(y + h));
            for (int py = y0; py < y1; py++)
            {
                float cy = Mathf.Clamp01(Mathf.Min(py + 1, y + h) - Mathf.Max(py, y));
                for (int px = x0; px < x1; px++)
                {
                    float cx = Mathf.Clamp01(Mathf.Min(px + 1, x + w) - Mathf.Max(px, x));
                    Blend(px, py, PaintAt(px, py), cx * cy);
                }
            }
        }

        // ------------------------------------------------------- caminhos ---

        public void BeginPath()
        {
            subpaths.Clear();
            current = null;
        }

        public void MoveTo(float x, float y)
        {
            current = new List<Vector2> { new Vector2(x, y) };
            subpaths.Add(current);
        }

        public void LineTo(float x, float y)
        {
            if (current == null) { MoveTo(x, y); return; }
            current.Add(new Vector2(x, y));
        }

        public void ClosePath()
        {
            if (current != null && current.Count > 0) current.Add(current[0]);
        }

        Vector2 Last => current != null && current.Count > 0 ? current[current.Count - 1] : Vector2.zero;

        public void BezierCurveTo(float c1x, float c1y, float c2x, float c2y, float x, float y)
        {
            Vector2 p0 = Last, p1 = new Vector2(c1x, c1y), p2 = new Vector2(c2x, c2y), p3 = new Vector2(x, y);
            int steps = Mathf.Clamp(Mathf.CeilToInt((Vector2.Distance(p0, p1) + Vector2.Distance(p1, p2) + Vector2.Distance(p2, p3)) / 2f), 8, 96);
            for (int i = 1; i <= steps; i++)
            {
                float t = (float)i / steps, k = 1 - t;
                Vector2 p = k * k * k * p0 + 3 * k * k * t * p1 + 3 * k * t * t * p2 + t * t * t * p3;
                LineTo(p.x, p.y);
            }
        }

        public void QuadraticCurveTo(float cx, float cy, float x, float y)
        {
            Vector2 p0 = Last, p1 = new Vector2(cx, cy), p2 = new Vector2(x, y);
            int steps = Mathf.Clamp(Mathf.CeilToInt((Vector2.Distance(p0, p1) + Vector2.Distance(p1, p2)) / 2f), 8, 64);
            for (int i = 1; i <= steps; i++)
            {
                float t = (float)i / steps, k = 1 - t;
                Vector2 p = k * k * p0 + 2 * k * t * p1 + t * t * p2;
                LineTo(p.x, p.y);
            }
        }

        /// <summary>`arc` e `ellipse`: ângulos em radianos, sentido horário na tela.</summary>
        public void Ellipse(float cx, float cy, float rx, float ry, float rotation, float start, float end, bool anticlockwise = false)
        {
            float sweep = end - start;
            if (!anticlockwise && sweep < 0) sweep = sweep % (Mathf.PI * 2) + Mathf.PI * 2;
            if (anticlockwise && sweep > 0) sweep = sweep % (Mathf.PI * 2) - Mathf.PI * 2;
            if (Mathf.Abs(end - start) >= Mathf.PI * 2 - 1e-5f) sweep = anticlockwise ? -Mathf.PI * 2 : Mathf.PI * 2;
            int steps = Mathf.Clamp(Mathf.CeilToInt(Mathf.Abs(sweep) * Mathf.Max(rx, ry) / 1.5f), 12, 256);
            float cr = Mathf.Cos(rotation), sr = Mathf.Sin(rotation);
            for (int i = 0; i <= steps; i++)
            {
                float a = start + sweep * i / steps;
                float ex = Mathf.Cos(a) * rx, ey = Mathf.Sin(a) * ry;
                float x = cx + ex * cr - ey * sr;
                float y = cy + ex * sr + ey * cr;
                if (i == 0 && current == null) MoveTo(x, y);
                else LineTo(x, y);
            }
        }

        public void Arc(float cx, float cy, float r, float start, float end, bool anticlockwise = false) =>
            Ellipse(cx, cy, r, r, 0, start, end, anticlockwise);

        public void Circle(float cx, float cy, float r)
        {
            MoveTo(cx + r, cy);
            current.Clear();
            Arc(cx, cy, r, 0, Mathf.PI * 2);
        }

        public void RoundRect(float x, float y, float w, float h, float r)
        {
            r = Mathf.Min(r, Mathf.Min(w, h) / 2f);
            MoveTo(x + r, y);
            LineTo(x + w - r, y);
            Arc(x + w - r, y + r, r, -Mathf.PI / 2, 0);
            LineTo(x + w, y + h - r);
            Arc(x + w - r, y + h - r, r, 0, Mathf.PI / 2);
            LineTo(x + r, y + h);
            Arc(x + r, y + h - r, r, Mathf.PI / 2, Mathf.PI);
            LineTo(x, y + r);
            Arc(x + r, y + r, r, Mathf.PI, Mathf.PI * 1.5f);
            ClosePath();
        }

        const int SubSamples = 4;

        /// <summary>Preenchimento não-nulo (nonzero), com 4x4 amostras por pixel.</summary>
        public void FillPath()
        {
            var edges = new List<(Vector2 a, Vector2 b)>();
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var path in subpaths)
            {
                if (path.Count < 2) continue;
                for (int i = 0; i < path.Count; i++)
                {
                    Vector2 a = path[i], b = path[(i + 1) % path.Count];
                    if (a != b) edges.Add((a, b));
                    minX = Mathf.Min(minX, a.x); maxX = Mathf.Max(maxX, a.x);
                    minY = Mathf.Min(minY, a.y); maxY = Mathf.Max(maxY, a.y);
                }
            }
            if (edges.Count == 0) return;

            int y0 = Mathf.Max(0, Mathf.FloorToInt(minY)), y1 = Mathf.Min(Height - 1, Mathf.CeilToInt(maxY));
            int x0 = Mathf.Max(0, Mathf.FloorToInt(minX)), x1 = Mathf.Min(Width - 1, Mathf.CeilToInt(maxX));
            if (x1 < x0 || y1 < y0) return;
            int spanW = x1 - x0 + 1;
            var coverage = new float[spanW];
            var crossings = new List<(float x, int dir)>();

            for (int py = y0; py <= y1; py++)
            {
                Array.Clear(coverage, 0, spanW);
                for (int s = 0; s < SubSamples; s++)
                {
                    float sy = py + (s + 0.5f) / SubSamples;
                    crossings.Clear();
                    foreach (var (a, b) in edges)
                    {
                        if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy))
                        {
                            float t = (sy - a.y) / (b.y - a.y);
                            crossings.Add((a.x + t * (b.x - a.x), b.y > a.y ? 1 : -1));
                        }
                    }
                    if (crossings.Count < 2) continue;
                    crossings.Sort((p, q) => p.x.CompareTo(q.x));
                    int winding = 0;
                    for (int c = 0; c < crossings.Count - 1; c++)
                    {
                        winding += crossings[c].dir;
                        if (winding == 0) continue;
                        AddSpan(coverage, x0, crossings[c].x, crossings[c + 1].x, 1f / SubSamples);
                    }
                }
                for (int i = 0; i < spanW; i++)
                {
                    if (coverage[i] <= 0) continue;
                    Blend(x0 + i, py, PaintAt(x0 + i, py), Mathf.Min(1, coverage[i]));
                }
            }
        }

        static void AddSpan(float[] coverage, int x0, float from, float to, float weight)
        {
            if (to <= from) return;
            int a = Mathf.FloorToInt(from), b = Mathf.FloorToInt(to);
            for (int px = a; px <= b; px++)
            {
                int i = px - x0;
                if (i < 0 || i >= coverage.Length) continue;
                float left = Mathf.Max(from, px), right = Mathf.Min(to, px + 1);
                if (right > left) coverage[i] += (right - left) * weight;
            }
        }

        /// <summary>Traço com espessura, pontas e junções redondas.</summary>
        public void StrokePath()
        {
            float half = LineWidth / 2f;
            var segments = new List<(Vector2 a, Vector2 b)>();
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var path in subpaths)
            {
                for (int i = 0; i + 1 < path.Count; i++)
                {
                    segments.Add((path[i], path[i + 1]));
                    minX = Mathf.Min(minX, Mathf.Min(path[i].x, path[i + 1].x));
                    maxX = Mathf.Max(maxX, Mathf.Max(path[i].x, path[i + 1].x));
                    minY = Mathf.Min(minY, Mathf.Min(path[i].y, path[i + 1].y));
                    maxY = Mathf.Max(maxY, Mathf.Max(path[i].y, path[i + 1].y));
                }
            }
            if (segments.Count == 0) return;

            int x0 = Mathf.Max(0, Mathf.FloorToInt(minX - half - 1)), x1 = Mathf.Min(Width - 1, Mathf.CeilToInt(maxX + half + 1));
            int y0 = Mathf.Max(0, Mathf.FloorToInt(minY - half - 1)), y1 = Mathf.Min(Height - 1, Mathf.CeilToInt(maxY + half + 1));
            if (x1 < x0 || y1 < y0) return;
            int w = x1 - x0 + 1, h = y1 - y0 + 1;
            var distance = new float[w * h];
            for (int i = 0; i < distance.Length; i++) distance[i] = float.MaxValue;

            foreach (var (a, b) in segments)
            {
                int sx0 = Mathf.Max(x0, Mathf.FloorToInt(Mathf.Min(a.x, b.x) - half - 1));
                int sx1 = Mathf.Min(x1, Mathf.CeilToInt(Mathf.Max(a.x, b.x) + half + 1));
                int sy0 = Mathf.Max(y0, Mathf.FloorToInt(Mathf.Min(a.y, b.y) - half - 1));
                int sy1 = Mathf.Min(y1, Mathf.CeilToInt(Mathf.Max(a.y, b.y) + half + 1));
                Vector2 ab = b - a;
                float len2 = ab.sqrMagnitude;
                for (int py = sy0; py <= sy1; py++)
                {
                    for (int px = sx0; px <= sx1; px++)
                    {
                        var p = new Vector2(px + 0.5f, py + 0.5f);
                        float t = len2 < 1e-9f ? 0 : Mathf.Clamp01(Vector2.Dot(p - a, ab) / len2);
                        if (!RoundCaps && len2 > 1e-9f)
                        {
                            float raw = Vector2.Dot(p - a, ab) / len2;
                            if (raw < 0 || raw > 1) continue;
                        }
                        float d = Vector2.Distance(p, a + ab * t);
                        int i = (py - y0) * w + (px - x0);
                        if (d < distance[i]) distance[i] = d;
                    }
                }
            }

            for (int py = y0; py <= y1; py++)
            {
                for (int px = x0; px <= x1; px++)
                {
                    float d = distance[(py - y0) * w + (px - x0)];
                    float cov = Mathf.Clamp01(half - d + 0.5f);
                    if (cov > 0) Blend(px, py, StrokeColor, cov);
                }
            }
        }

        // ------------------------------------------------------ atalhos ---

        public void FillCircle(float cx, float cy, float r)
        {
            BeginPath();
            Circle(cx, cy, r);
            FillPath();
        }

        public void FillEllipse(float cx, float cy, float rx, float ry, float rotation)
        {
            BeginPath();
            Ellipse(cx, cy, rx, ry, rotation, 0, Mathf.PI * 2);
            FillPath();
        }

        public void FillRoundRect(float x, float y, float w, float h, float r)
        {
            BeginPath();
            RoundRect(x, y, w, h, r);
            FillPath();
        }

        // --------------------------------------------------------- texto ---

        /// <summary>
        /// Escreve texto centrado (textAlign center, textBaseline middle), com
        /// contorno opcional. As letras vêm de uma fonte do sistema rasterizada
        /// pelo próprio Unity; ver <see cref="GlyphAtlas"/>.
        /// </summary>
        public void Text(string text, float cx, float cy, float maxWidth, int startSize, Color ink,
            Color outline, float outlineWidth)
        {
            GlyphAtlas atlas = GlyphAtlas.Get();
            if (atlas == null) return;

            int size = startSize;
            while (atlas.Measure(text, size) > maxWidth && size > 40) size -= 4;

            var mask = new float[Width * Height];
            atlas.Render(text, size, cx, cy, Width, Height, mask);

            if (outlineWidth > 0)
            {
                float[] dist = DistanceField(mask, 0.5f);
                float radius = outlineWidth / 2f;
                for (int i = 0; i < mask.Length; i++)
                {
                    float cov = Mathf.Clamp01(radius - dist[i] + 0.5f);
                    cov = Mathf.Max(cov, mask[i]);
                    if (cov > 0) Blend(i % Width, i / Width, outline, cov);
                }
            }
            for (int i = 0; i < mask.Length; i++)
                if (mask[i] > 0) Blend(i % Width, i / Width, ink, mask[i]);
        }

        /// <summary>Distância (em pixels) até o pixel coberto mais próximo — chanfro 3-4.</summary>
        float[] DistanceField(float[] mask, float threshold)
        {
            const float Big = 1e6f;
            var d = new float[mask.Length];
            for (int i = 0; i < d.Length; i++) d[i] = mask[i] >= threshold ? 0 : Big;
            const float a = 1f, b = 1.4142f;
            for (int y = 0; y < Height; y++)
            {
                for (int x = 0; x < Width; x++)
                {
                    int i = y * Width + x;
                    float v = d[i];
                    if (x > 0) v = Mathf.Min(v, d[i - 1] + a);
                    if (y > 0) v = Mathf.Min(v, d[i - Width] + a);
                    if (x > 0 && y > 0) v = Mathf.Min(v, d[i - Width - 1] + b);
                    if (x < Width - 1 && y > 0) v = Mathf.Min(v, d[i - Width + 1] + b);
                    d[i] = v;
                }
            }
            for (int y = Height - 1; y >= 0; y--)
            {
                for (int x = Width - 1; x >= 0; x--)
                {
                    int i = y * Width + x;
                    float v = d[i];
                    if (x < Width - 1) v = Mathf.Min(v, d[i + 1] + a);
                    if (y < Height - 1) v = Mathf.Min(v, d[i + Width] + a);
                    if (x < Width - 1 && y < Height - 1) v = Mathf.Min(v, d[i + Width + 1] + b);
                    if (x > 0 && y < Height - 1) v = Mathf.Min(v, d[i + Width - 1] + b);
                    d[i] = v;
                }
            }
            return d;
        }

        // ------------------------------------------------------ textura ---

        /// <summary>Entrega a textura. As linhas são invertidas: no Unity a linha 0 é a de baixo.</summary>
        public Texture2D ToTexture(string name, bool repeat = true, bool linear = false, bool mipmaps = true)
        {
            var tex = new Texture2D(Width, Height, TextureFormat.RGBA32, mipmaps, linear)
            {
                name = name,
                wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
                filterMode = FilterMode.Trilinear,
                anisoLevel = 4,
            };
            var flipped = new Color32[Pixels.Length];
            for (int y = 0; y < Height; y++)
            {
                int src = y * Width;
                int dst = (Height - 1 - y) * Width;
                for (int x = 0; x < Width; x++) flipped[dst + x] = Pixels[src + x];
            }
            tex.SetPixels32(flipped);
            tex.Apply(mipmaps, false);
            return tex;
        }
    }

    /// <summary>
    /// Letras de uma fonte do sistema, prontas para o <see cref="Canvas2D"/>.
    ///
    /// O Unity rasteriza a fonte dinâmica numa textura que não é legível pela
    /// CPU; um `Blit` para uma RenderTexture e um `ReadPixels` resolvem isso uma
    /// vez, na inicialização.
    /// </summary>
    public sealed class GlyphAtlas
    {
        static readonly Dictionary<int, GlyphAtlas> cache = new Dictionary<int, GlyphAtlas>();
        static Font font;
        static bool failed;

        readonly Dictionary<char, CharacterInfo> glyphs = new Dictionary<char, CharacterInfo>();
        Color32[] pixels;
        int texWidth, texHeight;
        readonly int size;

        const string Charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,-";

        GlyphAtlas(int size) { this.size = size; }

        /// <summary>O atlas de referência, rasterizado grande (132 px, como o letreiro original).</summary>
        public static GlyphAtlas Get(int size = 132)
        {
            if (failed) return null;
            if (cache.TryGetValue(size, out var existing)) return existing;
            try
            {
                if (font == null)
                {
                    font = Font.CreateDynamicFontFromOSFont(
                        new[] { "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", "Arial" }, size);
                    if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                }
                var atlas = new GlyphAtlas(size);
                atlas.Build();
                cache[size] = atlas;
                return atlas;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[CandyRush] Não foi possível rasterizar a fonte dos letreiros: {e.Message}");
                failed = true;
                return null;
            }
        }

        void Build()
        {
            font.RequestCharactersInTexture(Charset, size, FontStyle.Bold);
            foreach (char c in Charset)
                if (font.GetCharacterInfo(c, out CharacterInfo info, size, FontStyle.Bold)) glyphs[c] = info;

            var source = font.material.mainTexture;
            texWidth = source.width;
            texHeight = source.height;
            var rt = RenderTexture.GetTemporary(texWidth, texHeight, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            var previous = RenderTexture.active;
            Graphics.Blit(source, rt);
            RenderTexture.active = rt;
            var readable = new Texture2D(texWidth, texHeight, TextureFormat.RGBA32, false, true);
            readable.ReadPixels(new Rect(0, 0, texWidth, texHeight), 0, 0);
            readable.Apply();
            RenderTexture.active = previous;
            RenderTexture.ReleaseTemporary(rt);
            pixels = readable.GetPixels32();
            UnityEngine.Object.Destroy(readable);
        }

        public float Measure(string text, int px)
        {
            float scale = (float)px / size;
            float width = 0;
            foreach (char c in text)
                if (glyphs.TryGetValue(char.ToUpperInvariant(c), out var info)) width += info.advance * scale;
            return width;
        }

        float SampleAlpha(Vector2 uv)
        {
            float fx = uv.x * texWidth - 0.5f, fy = uv.y * texHeight - 0.5f;
            int x0 = Mathf.FloorToInt(fx), y0 = Mathf.FloorToInt(fy);
            float tx = fx - x0, ty = fy - y0;
            float a = Alpha(x0, y0), b = Alpha(x0 + 1, y0), c = Alpha(x0, y0 + 1), d = Alpha(x0 + 1, y0 + 1);
            return Mathf.Lerp(Mathf.Lerp(a, b, tx), Mathf.Lerp(c, d, tx), ty);
        }

        float Alpha(int x, int y)
        {
            if (x < 0 || y < 0 || x >= texWidth || y >= texHeight) return 0;
            return pixels[y * texWidth + x].a / 255f;
        }

        /// <summary>Escreve a máscara de cobertura do texto, centrado em (cx, cy).</summary>
        public void Render(string text, int px, float cx, float cy, int width, int height, float[] mask)
        {
            float scale = (float)px / size;
            float total = Measure(text, px);

            // Centraliza pela caixa das letras: para texto em maiúsculas isso é
            // o mesmo que o `textBaseline = 'middle'` do canvas.
            float top = float.MinValue, bottom = float.MaxValue;
            foreach (char raw in text)
            {
                if (!glyphs.TryGetValue(char.ToUpperInvariant(raw), out var info) || raw == ' ') continue;
                top = Mathf.Max(top, info.maxY);
                bottom = Mathf.Min(bottom, info.minY);
            }
            if (top < bottom) return;
            float baseline = cy + (top + bottom) / 2f * scale;

            float penX = cx - total / 2f;
            foreach (char raw in text)
            {
                if (!glyphs.TryGetValue(char.ToUpperInvariant(raw), out var info)) continue;
                float gx0 = penX + info.minX * scale, gx1 = penX + info.maxX * scale;
                float gy0 = baseline - info.maxY * scale, gy1 = baseline - info.minY * scale;
                for (int y = Mathf.Max(0, Mathf.FloorToInt(gy0)); y < Mathf.Min(height, Mathf.CeilToInt(gy1)); y++)
                {
                    float v = ((y + 0.5f) - gy0) / Mathf.Max(1e-3f, gy1 - gy0);
                    for (int x = Mathf.Max(0, Mathf.FloorToInt(gx0)); x < Mathf.Min(width, Mathf.CeilToInt(gx1)); x++)
                    {
                        float u = ((x + 0.5f) - gx0) / Mathf.Max(1e-3f, gx1 - gx0);
                        Vector2 topUv = Vector2.Lerp(info.uvTopLeft, info.uvTopRight, u);
                        Vector2 bottomUv = Vector2.Lerp(info.uvBottomLeft, info.uvBottomRight, u);
                        float a = SampleAlpha(Vector2.Lerp(topUv, bottomUv, v));
                        int i = y * width + x;
                        mask[i] = Mathf.Max(mask[i], a);
                    }
                }
                penX += info.advance * scale;
            }
        }
    }
}
