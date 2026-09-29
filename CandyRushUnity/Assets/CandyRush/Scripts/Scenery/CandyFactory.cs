using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// A máquina de doces à beira da pista, com as montanhas de algodão-doce
    /// fechando o fundo (track/candyFactory.ts).
    /// </summary>
    public sealed class CandyFactory
    {
        struct Gumball
        {
            public Vector3 Position;
            public float Radius;
            public int Color;
        }

        readonly SeededRandom random = new SeededRandom(CircuitConfig.RandomSeed + 909);
        readonly Texture2D stripeTexture = ProceduralTextures.Stripe("#ff5c96", "#ffffff");
        readonly int[] palette = CircuitConfig.Pastels;
        readonly Mat cream, pink, hotPink, frosting, gold, stripe, glass, gumball;
        readonly Dictionary<string, Mat> capMaterials;

        /// <summary>Onde a máquina cai no mundo e o giro que põe o +Z local virado para a pista.</summary>
        static void Placement(CircuitPath path, out Vector3 basePosition, out float angle)
        {
            int index = path.IndexAtFraction(FactoryConfig.At);
            PathSample sample = path.Samples[index];
            float lateral = FactoryConfig.Side * (sample.HalfWidth + FactoryConfig.OffsetFromEdge);
            basePosition = sample.Position + sample.Left * lateral;
            float heading = Mathf.Atan2(sample.Tangent.x, sample.Tangent.z);
            angle = heading - FactoryConfig.Side * (Mathf.PI / 2);
        }

        static Vector3 ToWorld(Vector3 basePosition, float angle, float localX, float localZ)
        {
            float cosine = Mathf.Cos(angle), sine = Mathf.Sin(angle);
            return new Vector3(basePosition.x + localX * cosine + localZ * sine, basePosition.y, basePosition.z - localX * sine + localZ * cosine);
        }

        /// <summary>"Este ponto está em cima da máquina ou das montanhas?"</summary>
        public static Func<float, float, float, bool> Footprint(CircuitPath path)
        {
            Placement(path, out Vector3 basePosition, out float angle);
            float cosine = Mathf.Cos(angle), sine = Mathf.Sin(angle);
            return (x, z, margin) =>
            {
                float dx = x - basePosition.x, dz = z - basePosition.z;
                float localX = dx * cosine - dz * sine;
                float localZ = dx * sine + dz * cosine;
                return localX >= FactoryConfig.FootprintMinX - margin && localX <= FactoryConfig.FootprintMaxX + margin &&
                       localZ >= FactoryConfig.FootprintMinZ - margin && localZ <= FactoryConfig.FootprintMaxZ + margin;
            };
        }

        public CandyFactory(CircuitPath path, Transform parent)
        {
            Transform root = SceneKit.Node("candy-factory", parent);

            cream = Mats.Coat(Mats.Candy(FactoryConfig.Cream, 0.3f), 0xffffff, 0xffd7bb, 0.05f);
            pink = Mats.Coat(Mats.Candy(FactoryConfig.Pink, 0.16f, 0.05f), 0xffc2dd, 0xff2f87, 0.075f);
            hotPink = Mats.Coat(Mats.Candy(FactoryConfig.HotPink, 0.14f, 0.08f), 0xffaad0, 0xff277d, 0.09f);
            var frostingOptions = Mats.Opt(0.2f);
            frostingOptions.Emissive = 0xffd8ec;
            frostingOptions.EmissiveIntensity = 0.05f;
            frosting = Mats.Coat(Mats.Standard(FactoryConfig.Frosting, frostingOptions), 0xffffff, 0xffd6ea, 0.045f);
            gold = Mats.Coat(Mats.Candy(FactoryConfig.Gold, 0.18f, 0.06f), 0xffe18b, 0xff8c28, 0.05f);
            stripe = Mats.Candy(0xffffff, 0.16f, 0, stripeTexture);
            glass = Mats.Glass(FactoryConfig.Glass, 0.34f, 0xffffff, 0xaeeeff, 0.24f);
            gumball = Mats.Candy(0xffffff, 0.12f);
            capMaterials = new Dictionary<string, Mat>
            {
                ["lavender"] = Mats.Candy(FactoryConfig.Lavender, 0.18f),
                ["mint"] = Mats.Candy(FactoryConfig.Mint, 0.2f),
                ["blue"] = Mats.Candy(FactoryConfig.Blue, 0.18f),
            };

            Placement(path, out Vector3 basePosition, out float angle);
            Vector3 machinePosition = basePosition;
            machinePosition.y = path.TerrainHeight(basePosition.x, basePosition.z) + FactoryConfig.DeckHeight - FactoryConfig.BuriedDepth;
            Transform machine = SceneKit.Node("machine", root).At(machinePosition).RotY(angle);

            BuildDeck(machine);
            BuildBody(machine);
            BuildChute(machine);
            BuildPipes(machine);
            BuildJars(machine);
            BuildMountains(path, root, basePosition, angle);
        }

        Transform Add(Transform group, MeshData geometry, Mat material) => SceneKit.Mesh(group, geometry, material, true, true, "factory-part");

        void BuildDeck(Transform group)
        {
            Add(group, Geo.RoundedBox(FactoryConfig.DeckWidth + 1.2f, 1.5f, FactoryConfig.DeckDepth + 1.2f, 1, 0.55f), hotPink).At(0, -FactoryConfig.DeckHeight + 0.75f, 0);
            Add(group, Geo.RoundedBox(FactoryConfig.DeckWidth, 1.0f, FactoryConfig.DeckDepth, 1, 0.4f), pink).At(0, -0.5f, 0);
            Add(group, Geo.RoundedBox(FactoryConfig.DeckWidth + 1.0f, 0.4f, FactoryConfig.DeckDepth + 1.0f, 1, 0.34f), frosting).At(0, -0.05f, 0);

            float halfWidth = FactoryConfig.DeckWidth / 2, halfDepth = FactoryConfig.DeckDepth / 2;
            AddRailing(group, -halfWidth + 0.6f, halfWidth - 0.6f, -halfDepth + 0.5f, true);
            AddRailing(group, -halfDepth + 0.5f, halfDepth - 0.5f, -halfWidth + 0.6f, false);
            AddRailing(group, -halfDepth + 0.5f, halfDepth - 0.5f, halfWidth - 0.6f, false);
        }

        void AddRailing(Transform group, float from, float to, float offset, bool alongX)
        {
            float span = Mathf.Abs(to - from);
            float center = (from + to) / 2;
            Add(group, alongX ? Geo.RoundedBox(span, 0.2f, 0.18f, 1, 0.09f) : Geo.RoundedBox(0.18f, 0.2f, span, 1, 0.09f), hotPink)
                .At(alongX ? center : offset, 1.25f, alongX ? offset : center);

            int posts = FactoryConfig.DeckPosts;
            for (int i = 0; i < posts; i++)
            {
                float along = from + span * i / (posts - 1);
                float x = alongX ? along : offset, z = alongX ? offset : along;
                Add(group, Geo.Cylinder(0.1f, 0.1f, 1.2f, 8), frosting).At(x, 0.6f, z);
                Add(group, Geo.Sphere(0.19f, 10, 7), gold).At(x, 1.45f, z);
            }
        }

        void BuildBody(Transform group)
        {
            float bodyCenter = FactoryConfig.BodyHeight / 2 + 0.55f;
            Add(group, Geo.Cylinder(FactoryConfig.BodyBottomRadius + 0.1f, FactoryConfig.BodyBottomRadius + 0.35f, 0.7f, 24), hotPink).At(0, 0.35f, 0);
            Add(group, Geo.Cylinder(FactoryConfig.BodyTopRadius, FactoryConfig.BodyBottomRadius, FactoryConfig.BodyHeight, 24), cream).At(0, bodyCenter, 0);
            Add(group, Geo.Cylinder(FactoryConfig.BodyTopRadius + 0.12f, FactoryConfig.BodyTopRadius + 0.26f, 0.42f, 24), pink)
                .At(0, bodyCenter + FactoryConfig.BodyHeight / 2 - 0.3f, 0);
            Add(group, Geo.Sphere(FactoryConfig.BodyTopRadius + 0.3f, 24, 10), frosting)
                .At(0, bodyCenter + FactoryConfig.BodyHeight / 2 + 0.1f, 0).Scl(1, 0.3f, 1);

            var balls = new List<Gumball>();
            float innerRadius = FactoryConfig.BowlRadius - 0.55f;
            for (int i = 0; i < FactoryConfig.BowlGumballs; i++)
            {
                // Raiz cúbica: sem ela as balas se amontoam no centro.
                float radius = innerRadius * Mathf.Pow(random.Next(), 1f / 3f);
                float theta = random.Next() * Mathf.PI * 2;
                float phi = Mathf.Acos(2 * random.Next() - 1);
                balls.Add(new Gumball
                {
                    Position = new Vector3(Mathf.Sin(phi) * Mathf.Cos(theta) * radius, FactoryConfig.BowlCenterY + Mathf.Cos(phi) * radius,
                        Mathf.Sin(phi) * Mathf.Sin(theta) * radius),
                    Radius = 0.3f + random.Next() * 0.1f,
                    Color = palette[i % palette.Length],
                });
            }
            AddGumballs(group, balls, false);

            SceneKit.Mesh(group, Geo.Sphere(FactoryConfig.BowlRadius, 30, 20), glass, false, true, "bowl").At(0, FactoryConfig.BowlCenterY, 0);

            Add(group, Geo.Cylinder(FactoryConfig.LidRadius - 0.15f, FactoryConfig.LidRadius + 0.05f, 0.5f, 24), pink).At(0, FactoryConfig.LidY - 0.45f, 0);
            Add(group, Geo.Cylinder(FactoryConfig.LidRadius, FactoryConfig.LidRadius + 0.06f, 0.3f, 24), gold).At(0, FactoryConfig.LidY - 0.1f, 0);
            Add(group, Geo.Sphere(FactoryConfig.LidRadius, 24, 14, 0, Mathf.PI * 2, 0, Mathf.PI / 2), hotPink).At(0, FactoryConfig.LidY, 0).Scl(1, 0.62f, 1);
            Add(group, Geo.Cylinder(FactoryConfig.LidRadius * 0.72f, FactoryConfig.LidRadius * 0.82f, 0.12f, 24), frosting).At(0, FactoryConfig.LidY + 0.6f, 0);

            // Bengala saindo da tampa: meio toro emendado no topo do mastro.
            float caneBase = FactoryConfig.LidY + 1.0f;
            float caneTop = caneBase + 4.2f;
            Add(group, Geo.Cylinder(0.34f, 0.34f, 4.2f, 14), stripe).At(0, caneBase + 2.1f, 0);
            const float hookRadius = 1.3f;
            Add(group, Geo.Torus(hookRadius, 0.34f, 10, 22, Mathf.PI), stripe).At(-hookRadius, caneTop, 0);
            Add(group, Geo.Cylinder(0.34f, 0.34f, 1.1f, 14), stripe).At(-hookRadius * 2, caneTop - 0.55f, 0);

            // A bengala grande plantada no convés.
            Add(group, Geo.Cylinder(0.55f, 0.55f, 11, 16), stripe).At(-8.6f, 5.5f, 1.6f);
            const float bigHookRadius = 1.9f;
            Add(group, Geo.Torus(bigHookRadius, 0.55f, 12, 26, Mathf.PI), stripe).At(-8.6f + bigHookRadius, 11, 1.6f);
            Add(group, Geo.Cylinder(0.55f, 0.55f, 1.5f, 16), stripe).At(-8.6f + bigHookRadius * 2, 10.25f, 1.6f);
        }

        /// <summary>A calha despejando balas na direção da pista, montada num subgrupo inclinado.</summary>
        void BuildChute(Transform group)
        {
            Add(group, Geo.Torus(0.85f, 0.22f, 10, 20), gold).At(FactoryConfig.ChuteOffsetX, 4.6f, 3.1f);
            Add(group, Geo.Cylinder(0.48f, 0.66f, 1.3f, 16), hotPink).At(FactoryConfig.ChuteOffsetX, 4.6f, 3.7f).Rot(Mathf.PI / 2, 0, 0);

            Transform ramp = SceneKit.Node("chute", group).At(FactoryConfig.ChuteOffsetX, FactoryConfig.ChuteCenterY, FactoryConfig.ChuteCenterZ)
                .Rot(FactoryConfig.ChuteTilt, 0, 0);

            float half = FactoryConfig.ChuteLength / 2;
            Add(ramp, Geo.RoundedBox(FactoryConfig.ChuteWidth, 0.24f, FactoryConfig.ChuteLength, 1, 0.1f), frosting);
            foreach (int side in new[] { -1, 1 })
                Add(ramp, Geo.RoundedBox(0.3f, 0.62f, FactoryConfig.ChuteLength, 1, 0.14f), hotPink).At(side * (FactoryConfig.ChuteWidth + 0.3f) / 2, 0.22f, 0);

            const int slats = 11;
            for (int i = 0; i < slats; i++)
                Add(ramp, Geo.RoundedBox(FactoryConfig.ChuteWidth - 0.15f, 0.12f, 0.2f, 1, 0.05f), pink)
                    .At(0, 0.16f, -half + 0.4f + i * (FactoryConfig.ChuteLength - 0.8f) / (slats - 1));

            foreach (float z in new[] { -half, half })
                foreach (int side in new[] { -1, 1 })
                    Add(ramp, Geo.Cylinder(0.12f, 0.14f, 1.5f, 8), gold).At(side * FactoryConfig.ChuteWidth / 2, -0.85f, z * 0.85f);

            var rolling = new List<Gumball>();
            for (int i = 0; i < FactoryConfig.ChuteRolling; i++)
            {
                float x = (random.Next() - 0.5f) * (FactoryConfig.ChuteWidth - 0.9f);
                float z = -half + random.Next() * FactoryConfig.ChuteLength;
                rolling.Add(new Gumball { Position = new Vector3(x, 0.45f, z), Radius = 0.32f + random.Next() * 0.1f, Color = palette[i % palette.Length] });
            }
            AddGumballs(ramp, rolling, true);

            var spilled = new List<Gumball>();
            float footZ = FactoryConfig.ChuteCenterZ + Mathf.Cos(FactoryConfig.ChuteTilt) * half;
            for (int i = 0; i < FactoryConfig.ChuteSpilled; i++)
            {
                float spread = random.Next();
                float x = FactoryConfig.ChuteOffsetX + (random.Next() - 0.5f) * (5.5f + spread * 3);
                float y = -0.35f + random.Next() * 0.25f;
                spilled.Add(new Gumball { Position = new Vector3(x, y, footZ + spread * 5.5f), Radius = 0.34f + random.Next() * 0.14f, Color = palette[i % palette.Length] });
            }
            AddGumballs(group, spilled, true);
        }

        void BuildPipes(Transform group)
        {
            Add(group, Geo.Cylinder(0.42f, 0.42f, 7.2f, 14), stripe).At(6.4f, 4.4f, -2.2f).Rot(0, 0, Mathf.PI / 2);
            foreach (float x in new[] { 3.0f, 9.8f })
                Add(group, Geo.Torus(0.5f, 0.14f, 8, 18), gold).At(x, 4.4f, -2.2f).Rot(0, Mathf.PI / 2, 0);
            Add(group, Geo.Torus(1.1f, 0.42f, 10, 20, Mathf.PI / 2), stripe).At(9.8f, 4.4f, -3.3f).Rot(0, Mathf.PI / 2, Mathf.PI);
            Add(group, Geo.Cylinder(0.42f, 0.42f, 4.6f, 14), stripe).At(9.8f, 2.1f, -4.4f);
            Add(group, Geo.Cylinder(0.56f, 0.56f, 0.32f, 16), gold).At(9.8f, 4.6f, -4.4f);
            Add(group, Geo.Cylinder(0.3f, 0.3f, 4.4f, 12), gold).At(-5.4f, 5.4f, -0.6f).Rot(0, 0, Mathf.PI / 2);
        }

        void BuildJars(Transform group)
        {
            for (int jarIndex = 0; jarIndex < FactoryConfig.Jars.Length; jarIndex++)
            {
                FactoryConfig.Jar jar = FactoryConfig.Jars[jarIndex];
                SceneKit.Mesh(group, Geo.Cylinder(jar.Radius, jar.Radius + 0.08f, jar.Height, 18), glass, false, true, "jar")
                    .At(jar.X, jar.Height / 2 + 0.2f, jar.Z);
                Add(group, Geo.Cylinder(jar.Radius + 0.12f, jar.Radius + 0.2f, 0.26f, 18), frosting).At(jar.X, 0.23f, jar.Z);
                Mat cap = capMaterials.TryGetValue(jar.Cap, out Mat c) ? c : frosting;
                Add(group, Geo.Cylinder(jar.Radius + 0.1f, jar.Radius + 0.16f, 0.28f, 18), cap).At(jar.X, jar.Height + 0.34f, jar.Z);

                var balls = new List<Gumball>();
                for (int i = 0; i < 18; i++)
                {
                    float angle = random.Next() * Mathf.PI * 2;
                    float radius = random.Next() * (jar.Radius - 0.32f);
                    float y = 0.6f + random.Next() * (jar.Height - 0.8f);
                    balls.Add(new Gumball
                    {
                        Position = new Vector3(jar.X + Mathf.Cos(angle) * radius, y, jar.Z + Mathf.Sin(angle) * radius),
                        Radius = 0.22f + random.Next() * 0.06f,
                        Color = palette[(i + jarIndex * 2) % palette.Length],
                    });
                }
                AddGumballs(group, balls, false);
            }
        }

        /// <summary>As montanhas: cada uma no próprio chão, com tufos no pé e balas cravadas.</summary>
        void BuildMountains(CircuitPath path, Transform root, Vector3 basePosition, float angle)
        {
            foreach (FactoryConfig.Mountain spec in FactoryConfig.Mountains)
            {
                Vector3 center = ToWorld(basePosition, angle, spec.X, spec.Z);
                float ground = path.TerrainHeight(center.x, center.z);
                Mat material = Mats.Cotton(new Mats.CottonOptions
                {
                    Base = spec.Base, Swirl = spec.Swirl, Rim = spec.Rim, PuffMeters = spec.PuffMeters,
                    FiberMeters = 0.9f, Relief = spec.Height * 0.032f, Fuzz = 0.9f, RimStrength = 0.55f,
                });

                Transform group = SceneKit.Node("cotton-mountain", root)
                    .At(center.x, ground - spec.Height * 0.02f, center.z)
                    .RotY(random.Next() * Mathf.PI * 2);

                MeshData geometry = CottonPeakGeometry(spec.Radius, spec.Height);
                SceneKit.Mesh(group, geometry, material, true, true, "peak");

                MeshData puff = Geo.Sphere(1, 16, 12);
                for (int i = 0; i < 5; i++)
                {
                    float a = i / 5f * Mathf.PI * 2 + random.Next();
                    float size = spec.Radius * (0.22f + random.Next() * 0.12f);
                    SceneKit.Mesh(group, puff, material, true, true, "puff")
                        .At(Mathf.Cos(a) * spec.Radius * 0.85f, size * 0.55f, Mathf.Sin(a) * spec.Radius * 0.85f)
                        .Scl(size, size * 0.8f, size);
                }

                var balls = new List<Gumball>();
                for (int i = 0; i < spec.Dots; i++)
                {
                    int vertex = Mathf.FloorToInt(random.Next() * geometry.VertexCount);
                    Vector3 v = geometry.Vertices[vertex];
                    balls.Add(new Gumball { Position = new Vector3(v.x * 0.9f, v.y, v.z * 0.9f), Radius = 0.35f + random.Next() * 0.3f, Color = palette[i % palette.Length] });
                }
                AddGumballs(group, balls, false);
            }
        }

        /// <summary>Perfil de um pico de algodão-doce: gordo embaixo, arredondado no topo.</summary>
        static MeshData CottonPeakGeometry(float radius, float height, int radialSegments = 40)
        {
            float[,] profile =
            {
                { 0.0f, 1.0f }, { 0.08f, 0.99f }, { 0.18f, 0.95f }, { 0.3f, 0.88f }, { 0.42f, 0.79f }, { 0.54f, 0.69f }, { 0.65f, 0.58f },
                { 0.75f, 0.47f }, { 0.83f, 0.37f }, { 0.9f, 0.27f }, { 0.95f, 0.18f }, { 0.98f, 0.1f }, { 1.0f, 0.0f },
            };
            var points = new List<Vector2>();
            for (int i = 0; i < profile.GetLength(0) - 1; i++)
            {
                float fromY = profile[i, 0], fromR = profile[i, 1], toY = profile[i + 1, 0], toR = profile[i + 1, 1];
                for (int step = 0; step < 3; step++)
                {
                    float k = step / 3f;
                    points.Add(new Vector2((fromR + (toR - fromR) * k) * radius, (fromY + (toY - fromY) * k) * height));
                }
            }
            points.Add(new Vector2(0, height));
            return Geo.Lathe(points, radialSegments);
        }

        /// <summary>Um punhado de balas numa malha só, com cor por bala.</summary>
        void AddGumballs(Transform target, List<Gumball> balls, bool castShadow)
        {
            if (balls.Count == 0) return;
            var batch = new Batch(gumball, "gumballs");
            MeshData sphere = Geo.Sphere(1, 10, 8);
            foreach (Gumball b in balls)
                batch.Add(sphere, Matrix4x4.TRS(b.Position, Quaternion.identity, Vector3.one * b.Radius), Hex.Linear(b.Color));
            batch.Flush(target, castShadow, false);
        }
    }
}
