using UnityEngine;
using UnityEngine.Rendering;

namespace CandyRush
{
    /// <summary>
    /// Um material e o que o three.js guardava junto dele e que no Unity mora
    /// em outro lugar: se ele é de dupla face (aqui isso vira geometria, ver
    /// <see cref="MeshData.MakeDoubleSided"/>).
    /// </summary>
    public sealed class Mat
    {
        public Material Material;
        public bool DoubleSided;

        /// <summary>Muda a intensidade da emissão mantendo a cor (usado nas animações).</summary>
        public void SetEmission(Color srgb, float intensity)
        {
            Material.SetVector("_EmissionColor", Mats.EmissionVector(srgb, intensity));
        }
    }

    /// <summary>Opções de um material padrão, espelhando o `MeshStandardMaterial`.</summary>
    public struct StdOptions
    {
        public float Roughness;
        public float Metalness;
        public int? Emissive;
        public float EmissiveIntensity;
        public Texture Map;
        public Vector2 Repeat;
        public Texture NormalMap;
        public float NormalScale;
        public bool DoubleSided;
        public float OffsetFactor;
        public float OffsetUnits;
        /// <summary>A textura também é o mapa de emissão (letreiros).</summary>
        public bool EmissiveUsesMap;
        public bool VertexColors;
    }

    /// <summary>Fábrica de materiais. Tudo que o jogo pinta passa por aqui.</summary>
    public static class Mats
    {
        static Shader lit, litTransparent, unlit, sky, cotton;

        public static Shader LitShader => lit ??= Find("CandyRush/Lit");
        public static Shader LitTransparentShader => litTransparent ??= Find("CandyRush/LitTransparent");
        public static Shader UnlitShader => unlit ??= Find("CandyRush/Unlit");
        public static Shader SkyShader => sky ??= Find("CandyRush/Sky");
        public static Shader CottonShader => cotton ??= Find("CandyRush/CottonCandy");

        static Shader Find(string name)
        {
            Shader shader = Shader.Find(name);
            if (shader == null)
            {
                Debug.LogError($"[CandyRush] Shader '{name}' não encontrado. Ele precisa estar em Assets/CandyRush/Resources/Shaders.");
                shader = Shader.Find("Standard");
            }
            return shader;
        }

        /// <summary>
        /// Emissão no espaço linear, já multiplicada pela intensidade. Vai como
        /// vetor para o Unity não converter de novo (ele converteria `cor *
        /// intensidade` inteira, e não só a cor).
        /// </summary>
        public static Vector4 EmissionVector(Color srgb, float intensity)
        {
            Color linear = srgb.linear * (intensity * LightingConfig.EmissionScale);
            return new Vector4(linear.r, linear.g, linear.b, 1);
        }

        public static StdOptions Opt(float roughness = 1f) => new StdOptions
        {
            Roughness = roughness,
            Repeat = Vector2.one,
        };

        /// <summary>O `MeshStandardMaterial({ color, roughness, ... })`.</summary>
        public static Mat Standard(int color, StdOptions o)
        {
            var m = new Material(LitShader) { name = $"std-{color:x6}" };
            m.SetColor("_Color", Hex.C(color));
            m.SetFloat("_Glossiness", Mathf.Clamp01(1f - o.Roughness));
            m.SetFloat("_Metallic", o.Metalness);
            if (o.Map != null)
            {
                m.SetTexture("_MainTex", o.Map);
                m.SetTextureScale("_MainTex", o.Repeat == Vector2.zero ? Vector2.one : o.Repeat);
            }
            if (o.NormalMap != null)
            {
                m.SetTexture("_BumpMap", o.NormalMap);
                m.SetFloat("_BumpScale", o.NormalScale);
            }
            if (o.Emissive.HasValue && o.EmissiveIntensity > 0)
            {
                m.SetVector("_EmissionColor", EmissionVector(Hex.C(o.Emissive.Value), o.EmissiveIntensity));
                m.SetFloat("_EmissionMapAmount", o.EmissiveUsesMap ? 1f : 0f);
            }
            if (o.OffsetFactor != 0 || o.OffsetUnits != 0)
            {
                m.SetFloat("_OffsetFactor", o.OffsetFactor);
                m.SetFloat("_OffsetUnits", o.OffsetUnits);
            }
            return new Mat { Material = m, DoubleSided = o.DoubleSided };
        }

        /// <summary>Atalho: cor, rugosidade e brilho próprio da mesma cor.</summary>
        public static Mat Candy(int color, float roughness, float emissive = 0f, Texture map = null, bool doubleSided = false)
        {
            var o = Opt(roughness);
            if (emissive > 0)
            {
                o.Emissive = color;
                o.EmissiveIntensity = emissive;
            }
            o.Map = map;
            o.DoubleSided = doubleSided;
            return Standard(color, o);
        }

        /// <summary>`addCandyCoat`: degradê por altura e brilho de borda.</summary>
        public static Mat Coat(Mat mat, int top, int bottom, float rimPower)
        {
            mat.Material.SetVector("_CoatTop", Raw(top));
            mat.Material.SetVector("_CoatBottom", Raw(bottom));
            mat.Material.SetFloat("_CoatRim", rimPower);
            mat.Material.SetFloat("_CoatMix", 0.18f);
            return mat;
        }

        /// <summary>Vidro de bala: transparente, liso e sem escrever profundidade.</summary>
        public static Mat Glass(int color, float opacity, int coatTop, int coatBottom, float rim)
        {
            var m = new Material(LitTransparentShader) { name = "glass" };
            m.SetColor("_Color", Hex.C(color, opacity));
            m.SetFloat("_Glossiness", 0.97f);
            m.SetVector("_CoatTop", Raw(coatTop));
            m.SetVector("_CoatBottom", Raw(coatBottom));
            m.SetFloat("_CoatRim", rim);
            m.SetFloat("_CoatMix", 0.18f);
            return new Mat { Material = m };
        }

        /// <summary>O `MeshBasicMaterial`: cor lisa, sem luz.</summary>
        public static Mat Unlit(int color, bool fog = true)
        {
            var m = new Material(UnlitShader) { name = $"unlit-{color:x6}" };
            m.SetColor("_Color", Hex.C(color));
            m.SetFloat("_UseFog", fog ? 1 : 0);
            return new Mat { Material = m };
        }

        /// <summary>Transparente por alfa de vértice (marcas de pneu).</summary>
        public static Mat UnlitVertexAlpha()
        {
            var m = new Material(UnlitShader) { name = "vertex-alpha" };
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetFloat("_UseFog", 1);
            m.renderQueue = (int)RenderQueue.Transparent - 10;
            return new Mat { Material = m };
        }

        /// <summary>Aditivo, sem profundidade nem névoa (partículas).</summary>
        public static Mat UnlitAdditive()
        {
            var m = new Material(UnlitShader) { name = "additive" };
            m.SetFloat("_SrcBlend", (float)BlendMode.One);
            m.SetFloat("_DstBlend", (float)BlendMode.One);
            m.SetFloat("_ZWrite", 0);
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetFloat("_UseFog", 0);
            m.renderQueue = (int)RenderQueue.Transparent + 10;
            return new Mat { Material = m };
        }

        public struct CottonOptions
        {
            public int Base, Swirl, Rim;
            public float PuffMeters, FiberMeters, Relief, Fuzz, RimStrength;
        }

        /// <summary>`createCottonCandyMaterial`.</summary>
        public static Mat Cotton(CottonOptions o)
        {
            var m = new Material(CottonShader) { name = "cotton-candy" };
            m.SetVector("_Base", Raw(o.Base));
            m.SetVector("_Swirl", Raw(o.Swirl));
            m.SetVector("_Rim", Raw(o.Rim));
            m.SetFloat("_PuffFrequency", 1f / Mathf.Max(0.05f, o.PuffMeters <= 0 ? 7f : o.PuffMeters));
            m.SetFloat("_FiberFrequency", 1f / Mathf.Max(0.02f, o.FiberMeters <= 0 ? 0.85f : o.FiberMeters));
            m.SetFloat("_Relief", o.Relief);
            m.SetFloat("_Fuzz", o.Fuzz);
            m.SetFloat("_RimStrength", o.RimStrength);
            m.SetFloat("_EmissionStrength", 0.06f * LightingConfig.EmissionScale);
            return new Mat { Material = m };
        }

        /// <summary>Cor crua (hex/255), sem conversão — é o que o GLSL colado do original usava.</summary>
        public static Vector4 Raw(int hex) =>
            new Vector4(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, 1f);
    }
}
