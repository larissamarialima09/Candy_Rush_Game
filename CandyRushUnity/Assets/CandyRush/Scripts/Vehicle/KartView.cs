using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace CandyRush
{
    /// <summary>Paleta de um kart: qual sprite usar e a cor das luzes.</summary>
    public sealed class KartPalette
    {
        public string Sprite;
        public int Taillight, Exhaust;

        /// <summary>O kart do jogador: coelho rosa.</summary>
        public static KartPalette Player => new KartPalette
        {
            Sprite = "pink", Taillight = 0xff4f7d, Exhaust = 0xffc9dd,
        };

        /// <summary>Paleta de um adversário a partir da cor do sprite dele.</summary>
        public static KartPalette Rival(string sprite) => new KartPalette
        {
            Sprite = sprite, Taillight = 0xff4f7d, Exhaust = 0xffc9dd,
        };
    }

    /// <summary>
    /// A aparência do kart (vehicle/kartView.ts): sprite 2D do coelho — a mesma
    /// arte já usada no atlas do menu (Resources/Candy/Menu/Rabbits) —, sempre
    /// virado pra câmera. Substitui o coelho+kart de primitivas 3D que existia
    /// aqui antes; mais simples, mas sem inclinação/drift/rodas girando.
    ///
    /// As luzes de freio e escapamento continuam existindo como um brilho
    /// colorido atrás do sprite: é a única leitura que o jogador tem do que o
    /// kart está fazendo, então sem elas o freio e o boost ficam mudos.
    /// </summary>
    public sealed class KartView
    {
        static readonly string[] SpriteOrder = { "blue", "pink", "yellow", "purple" };
        const float SpriteHeightMeters = 2.05f;
        const float GroundOffset = 0.38f;

        /// <summary>
        /// Câmera usada para o billboard. Como o Update aqui roda uma vez por
        /// kart (não uma vez por câmera), o coop vira pelo ponto de vista do
        /// jogador 1 — simplificação aceita para não duplicar o desenho por
        /// viewport.
        /// </summary>
        public static Camera ActiveCamera;

        static Texture2D atlasTexture;
        static Texture2D AtlasTexture => atlasTexture ??= Resources.Load<Texture2D>("Candy/Menu/Rabbits");

        static Texture2D glowTexture;
        static Texture2D GlowTexture => glowTexture ??= ProceduralTextures.Glow();

        public readonly Transform Root;
        readonly Kart kart;
        KartPalette palette;

        readonly Material spriteMaterial;
        readonly Transform taillightGlow;
        readonly Material taillightMaterial;
        readonly Transform exhaustGlow;
        readonly Material exhaustMaterial;

        public KartView(Kart kart, Transform world, KartPalette palette)
        {
            this.kart = kart;
            this.palette = palette;

            Texture2D atlas = AtlasTexture;
            float frameAspect = atlas != null ? (atlas.width / 4f) / atlas.height : 0.85f;
            float quadWidth = SpriteHeightMeters * frameAspect;

            Root = SceneKit.Node("kart", world);
            spriteMaterial = MakeBillboardMaterial(atlas);
            ApplySpriteFrame();
            Transform quad = SceneKit.Mesh(Root, Geo.Plane(quadWidth, SpriteHeightMeters),
                new Mat { Material = spriteMaterial }, false, false, "sprite");
            quad.localPosition = new Vector3(0, SpriteHeightMeters / 2f, 0);

            taillightMaterial = MakeGlowMaterial(palette.Taillight);
            taillightGlow = SceneKit.Mesh(world, Geo.Plane(0.55f, 0.55f),
                new Mat { Material = taillightMaterial }, false, false, "taillight-glow");

            exhaustMaterial = MakeGlowMaterial(palette.Exhaust);
            exhaustGlow = SceneKit.Mesh(world, Geo.Plane(0.4f, 0.4f),
                new Mat { Material = exhaustMaterial }, false, false, "exhaust-glow");
        }

        static Material MakeBillboardMaterial(Texture2D atlas)
        {
            var m = new Material(Mats.UnlitShader) { name = "kart-sprite" };
            m.SetTexture("_MainTex", atlas);
            m.SetColor("_Color", Color.white);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetFloat("_UseFog", 1);
            m.renderQueue = (int)RenderQueue.Transparent;
            return m;
        }

        static Material MakeGlowMaterial(int color)
        {
            var m = new Material(Mats.UnlitShader) { name = $"glow-{color:x6}" };
            m.SetTexture("_MainTex", GlowTexture);
            m.SetColor("_Color", Hex.C(color, 0.3f));
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.One);
            m.SetFloat("_ZWrite", 0);
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetFloat("_UseFog", 0);
            m.renderQueue = (int)RenderQueue.Transparent + 5;
            return m;
        }

        void ApplySpriteFrame()
        {
            int index = Array.IndexOf(SpriteOrder, palette.Sprite);
            if (index < 0) index = 1;
            spriteMaterial.SetTextureScale("_MainTex", new Vector2(0.25f, 1f));
            spriteMaterial.SetTextureOffset("_MainTex", new Vector2(index * 0.25f, 0f));
        }

        /// <summary>Troca a paleta em tempo real (seleção de coelho no menu).</summary>
        public void SetPalette(KartPalette next)
        {
            palette = next;
            ApplySpriteFrame();
        }

        static Quaternion BillboardRotation(Vector3 fromThree)
        {
            Camera cam = ActiveCamera != null ? ActiveCamera : Camera.main;
            if (cam == null) return Quaternion.identity;
            Vector3 camThree = ThreeSpace.FromUnity(cam.transform.position);
            Vector3 direction = camThree - fromThree;
            if (direction.sqrMagnitude < 1e-6f) return Quaternion.identity;
            return Quaternion.LookRotation(direction.normalized, Vector3.up);
        }

        /// <summary>`alpha` vem do acumulador do loop.</summary>
        public void Update(float alpha)
        {
            kart.GetRenderTransform(alpha, out Vector3 position, out Quaternion orientation);
            Vector3 basePos = new Vector3(position.x, position.y - GroundOffset, position.z);

            Root.localPosition = basePos;
            Root.localRotation = BillboardRotation(basePos);

            // As luzes ficam levemente atrás do kart, na direção real dele — não
            // da câmera —, senão elas "flutuam" na frente quando o carrinho vira.
            Vector3 backward = orientation * new Vector3(0, 0, -1);
            Vector3 tailPos = basePos + backward * 0.85f;
            tailPos.y = basePos.y + 0.25f;
            taillightGlow.localPosition = tailPos;
            taillightGlow.localRotation = BillboardRotation(tailPos);

            Vector3 exhaustPos = basePos + backward * 0.95f;
            exhaustPos.y = basePos.y + 0.12f;
            exhaustGlow.localPosition = exhaustPos;
            exhaustGlow.localRotation = BillboardRotation(exhaustPos);

            UpdateLights();
        }

        /// <summary>Lanternas no freio, escapamento no turbo.</summary>
        void UpdateLights()
        {
            KartTelemetry t = kart.Telemetry;
            bool braking = t.ForwardSpeed > 1 && t.DriveForce <= 0;
            taillightMaterial.SetColor("_Color", Hex.C(palette.Taillight, braking ? 0.85f : 0.35f));
            taillightGlow.localScale = Vector3.one * (braking ? 0.7f : 0.5f);

            float boost = kart.Drift.BoostTimeRemaining;
            exhaustMaterial.SetColor("_Color", Hex.C(palette.Exhaust, 0.15f + boost * 0.6f));
            exhaustGlow.localScale = Vector3.one * (0.35f + boost * 0.5f);
        }

        public void SetVisible(bool visible) => Root.gameObject.SetActive(visible);
    }
}
