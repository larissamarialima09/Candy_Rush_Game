using System;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Malha do terreno ao redor do circuito (track/terrain.ts). As células
    /// cobertas pela pista não são geradas, e as da borda mergulham por baixo da
    /// fita — é o que impede a grama de "comer" o asfalto.
    /// </summary>
    public static class TerrainBuilder
    {
        public static void Build(CircuitPath path, Transform world, Texture2D meadow)
        {
            float margin = TrackConfig.TerrainFadeEnd;
            path.Bounds(margin, out float minX, out float maxX, out float minZ, out float maxZ);

            float cell = Mathf.Min(QualityConfig.TerrainCellSize, 4);
            int columns = Mathf.CeilToInt((maxX - minX) / cell) + 1;
            int rows = Mathf.CeilToInt((maxZ - minZ) / cell) + 1;
            const float tileMeters = 26f;
            const float maxSink = 0.9f;
            const float sinkRamp = 2.5f;
            float coverMargin = Mathf.Min(cell * 0.45f, 1.4f);

            var g = new MeshData();
            var covered = new float[columns * rows];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int index = r * columns + c;
                    float x = minX + c * cell, z = minZ + r * cell;
                    float inside = TrackCoverage(path, x, z, coverMargin);
                    covered[index] = inside;
                    float sink = inside <= 0 ? 0 : Mathf.Min(1, inside / sinkRamp) * maxSink;
                    g.Add(new Vector3(x, path.TerrainHeight(x, z) - sink, z), Vector3.up, new Vector2(x / tileMeters, z / tileMeters));
                }
            }

            for (int r = 0; r < rows - 1; r++)
            {
                for (int c = 0; c < columns - 1; c++)
                {
                    int a = r * columns + c, b = a + 1, d = a + columns, e = d + 1;
                    float centerX = minX + (c + 0.5f) * cell, centerZ = minZ + (r + 0.5f) * cell;
                    float touch = Mathf.Max(Mathf.Max(covered[a], covered[b]), Mathf.Max(covered[d], covered[e]));
                    touch = Mathf.Max(touch, TrackCoverage(path, centerX, centerZ, coverMargin));
                    if (touch > 0) continue;
                    g.Tri(a, d, b);
                    g.Tri(b, d, e);
                }
            }
            g.ComputeNormals();

            var o = Mats.Opt(0.92f);
            o.Map = meadow;
            o.OffsetFactor = 4;
            o.OffsetUnits = 4;
            SceneKit.Mesh(world, g, Mats.Standard(0xc5e9a7, o), false, true, "terrain");
        }

        static float TrackCoverage(CircuitPath path, float x, float z, float margin)
        {
            int index = path.NearestSampleIndex(x, z);
            float lateral = path.LateralOffset(index, x, z);
            float edge = path.Samples[index].HalfWidth + TrackConfig.RunoffWidth + CircuitConfig.KerbWidth + margin;
            return edge - Mathf.Abs(lateral);
        }

        /// <summary>
        /// O plano de horizonte (track/flatGround.ts), já com a textura de
        /// gramado e a altura que o main.ts aplicava.
        /// </summary>
        public static void BuildHorizon(Transform world, Texture2D meadow)
        {
            var o = Mats.Opt(0.92f);
            o.Map = meadow;
            float repeat = QualityConfig.HorizonPlaneSize / 20f;
            o.Repeat = new Vector2(repeat, repeat);
            MeshData plane = Geo.Plane(QualityConfig.HorizonPlaneSize, QualityConfig.HorizonPlaneSize).RotateX(-Mathf.PI / 2);
            SceneKit.Mesh(world, plane, Mats.Standard(0xc5e9a7, o), false, true, "flat-ground").At(0, -0.34f, 0);
        }
    }

    /// <summary>
    /// O piso do circuito (track/circuitSurface.ts): escape, asfalto de
    /// confete, zebras, linha central, largada quadriculada e o portal.
    /// </summary>
    public sealed class CircuitSurface
    {
        readonly Transform root;
        readonly CircuitPath path;

        /// <summary>Acumulador de quadriláteros com cor e UV por vértice.</summary>
        sealed class Ribbon
        {
            public readonly MeshData Data = new MeshData { Colors = new System.Collections.Generic.List<Color>() };

            public void Quad(Vector3 leftStart, Vector3 rightStart, Vector3 leftEnd, Vector3 rightEnd, int color, float vStart = 0, float vEnd = 1)
            {
                Color linear = Hex.Linear(color);
                Tri(leftStart, rightStart, rightEnd, new Vector2(0, vStart), new Vector2(1, vStart), new Vector2(1, vEnd), linear);
                Tri(leftStart, rightEnd, leftEnd, new Vector2(0, vStart), new Vector2(1, vEnd), new Vector2(0, vEnd), linear);
            }

            void Tri(Vector3 a, Vector3 b, Vector3 c, Vector2 ua, Vector2 ub, Vector2 uc, Color color)
            {
                int start = Data.VertexCount;
                Data.Add(a, Vector3.up, ua);
                Data.Add(b, Vector3.up, ub);
                Data.Add(c, Vector3.up, uc);
                Data.Colors.Add(color);
                Data.Colors.Add(color);
                Data.Colors.Add(color);
                Data.Tri(start, start + 1, start + 2);
            }
        }

        MeshData BuildRibbon(float y, Func<int, float> leftEdge, Func<int, float> rightEdge, Func<int, int?> color)
        {
            var ribbon = new Ribbon();
            int count = path.Count;
            float repeat = CircuitConfig.TextureRepeatMeters;
            for (int i = 0; i < count; i++)
            {
                int? c = color(i);
                if (!c.HasValue) continue;
                int next = (i + 1) % count;
                Vector3 a = path.PointAt(i, leftEdge(i), y);
                Vector3 b = path.PointAt(i, rightEdge(i), y);
                Vector3 cc = path.PointAt(next, leftEdge(next), y);
                Vector3 d = path.PointAt(next, rightEdge(next), y);
                float vStart = path.Samples[i].Distance / repeat;
                float vEnd = vStart + Vector3.Distance(a, cc) / repeat;
                ribbon.Quad(a, b, cc, d, c.Value, vStart, vEnd);
            }
            return ribbon.Data.VertexCount == 0 ? null : ribbon.Data.ComputeNormals();
        }

        void Add(MeshData data, Mat material, string name)
        {
            if (data == null) return;
            SceneKit.Mesh(root, data, material, false, true, name);
        }

        public CircuitSurface(CircuitPath path, Transform world, Texture2D trackTexture, Texture2D trackNormals)
        {
            this.path = path;
            root = SceneKit.Node("circuit-surface", world);
            float Half(int i) => path.Samples[i].HalfWidth;
            float runoffWidth = TrackConfig.RunoffWidth;
            const float runoffBleed = 0.8f;
            const int runoffColor = 0xffd7e8;

            var asphaltOptions = Mats.Opt(0.42f);
            asphaltOptions.Map = trackTexture;
            asphaltOptions.NormalMap = trackNormals;
            asphaltOptions.NormalScale = 0.55f;
            asphaltOptions.DoubleSided = true;
            asphaltOptions.OffsetFactor = -2;
            asphaltOptions.OffsetUnits = -2;
            Mat asphalt = Mats.Standard(0xffffff, asphaltOptions);

            var paintedOptions = Mats.Opt(0.4f);
            paintedOptions.DoubleSided = true;
            paintedOptions.OffsetFactor = -3;
            paintedOptions.OffsetUnits = -3;
            Mat painted = Mats.Standard(0xffffff, paintedOptions);

            var runoffOptions = Mats.Opt(0.55f);
            runoffOptions.DoubleSided = true;
            runoffOptions.OffsetFactor = 5;
            runoffOptions.OffsetUnits = 5;
            Mat runoff = Mats.Standard(0xffffff, runoffOptions);

            foreach (int side in new[] { 1, -1 })
            {
                Add(BuildRibbon(CircuitConfig.LayerRunoff,
                    i => Mathf.Max(side * (Half(i) + runoffWidth), side * Half(i)),
                    i => Mathf.Min(side * (Half(i) + runoffWidth), side * Half(i)),
                    _ => runoffColor), runoff, "runoff");
            }
            foreach (int side in new[] { 1, -1 })
            {
                Add(BuildRibbon(CircuitConfig.LayerRunoff - 0.012f,
                    i => Mathf.Max(side * (Half(i) + runoffWidth + runoffBleed), side * (Half(i) + runoffWidth)),
                    i => Mathf.Min(side * (Half(i) + runoffWidth + runoffBleed), side * (Half(i) + runoffWidth)),
                    _ => runoffColor), runoff, "runoff-bleed");
            }

            Add(BuildRibbon(CircuitConfig.LayerAsphalt, i => Half(i), i => -Half(i),
                _ => trackTexture != null ? 0xffffff : CircuitConfig.ColorAsphalt), asphalt, "asphalt");

            AddKerbs(painted);
            float halfLine = CircuitConfig.CenterLineWidth / 2;
            Add(BuildRibbon(CircuitConfig.LayerEdgeLine, _ => halfLine, _ => -halfLine, _ => CircuitConfig.ColorCenterLine), painted, "center-line");
            AddStartLine(painted);
            AddStartGate();
        }

        /// <summary>Zebra quadriculada rosa e branca nas DUAS bordas, pela volta inteira.</summary>
        void AddKerbs(Mat material)
        {
            float Half(int i) => path.Samples[i].HalfWidth;
            int? Square(int i) => (i / CircuitConfig.KerbStripeSegments) % 2 == 0 ? CircuitConfig.ColorKerbA : CircuitConfig.ColorKerbB;
            foreach (int side in new[] { 1, -1 })
            {
                float Outer(int i) => side * (Half(i) + CircuitConfig.KerbWidth);
                float Inner(int i) => side * Half(i);
                Add(BuildRibbon(CircuitConfig.LayerKerb, i => Mathf.Max(Outer(i), Inner(i)), i => Mathf.Min(Outer(i), Inner(i)), Square),
                    material, "kerb");
            }
        }

        /// <summary>Faixa de largada construída sobre as AMOSTRAS, assentando na inclinação.</summary>
        void AddStartLine(Mat material)
        {
            var ribbon = new Ribbon();
            float y = CircuitConfig.LayerStartLine;
            float spacing = path.TotalLength / path.Count;
            int rows = Mathf.Max(2, Mathf.RoundToInt(CircuitConfig.StartLineDepth / spacing));
            int squares = CircuitConfig.StartLineSquares;
            for (int row = 0; row < rows; row++)
            {
                int near = row % path.Count, far = (row + 1) % path.Count;
                float halfNear = path.Samples[near].HalfWidth, halfFar = path.Samples[far].HalfWidth;
                for (int column = 0; column < squares; column++)
                {
                    float from = 1 - column * 2f / squares;
                    float to = 1 - (column + 1) * 2f / squares;
                    bool dark = (row + column) % 2 == 0;
                    ribbon.Quad(
                        path.PointAt(near, halfNear * from, y), path.PointAt(near, halfNear * to, y),
                        path.PointAt(far, halfFar * from, y), path.PointAt(far, halfFar * to, y),
                        dark ? CircuitConfig.ColorStartLineB : CircuitConfig.ColorStartLineA);
                }
            }
            Add(ribbon.Data.ComputeNormals(), material, "start-line");
        }

        // ------------------------------------------------ portal de largada ---

        void AddStartGate()
        {
            PathSample sample = path.Samples[0];
            float halfSpan = sample.HalfWidth + StartGateConfig.OffsetFromEdge;
            float springline = StartGateConfig.FootHeight + StartGateConfig.PillarHeight;

            Transform group = SceneKit.Node("start-gantry", root).At(sample.Position).RotY(CircuitPath.HeadingOf(sample));
            float ArchHeightAt(float fraction) =>
                springline + StartGateConfig.ArchRise * Mathf.Sqrt(Mathf.Max(0, 1 - fraction * fraction));

            Texture2D stripes = ProceduralTextures.Stripe("#ff5c96", "#ffffff");
            Mat cane = Mats.Candy(0xffffff, 0.22f, 0, stripes);
            Mat frosting = Mats.Candy(StartGateConfig.Frosting, 0.25f);
            Mat hotPink = Mats.Candy(StartGateConfig.HotPink, 0.18f, 0.06f);
            Mat gold = Mats.Candy(StartGateConfig.Gold, 0.2f, 0.12f);

            AddGatePillars(group, halfSpan, cane, frosting, hotPink);

            // O arco é meio toro ACHATADO: altura vira `rise`, não consequência do vão.
            SceneKit.Mesh(group, Geo.Torus(halfSpan, StartGateConfig.ArchThickness, 14, 44, Mathf.PI), cane, true)
                .At(0, springline, 0).Scl(1, StartGateConfig.ArchRise / halfSpan, 1);

            AddGateDecorations(group, halfSpan, ArchHeightAt);
            AddGateSign(group, ArchHeightAt(0), frosting, gold);
        }

        void AddGatePillars(Transform group, float halfSpan, Mat cane, Mat frosting, Mat hotPink)
        {
            Texture2D checker = ProceduralTextures.Checker(StartGateConfig.FlagSquares);
            Mat flagMaterial = Mats.Candy(0xffffff, 0.4f, 0, checker, true);

            foreach (int side in new[] { 1, -1 })
            {
                float x = side * halfSpan;
                SceneKit.Mesh(group, Geo.RoundedBox(StartGateConfig.PlinthSize, StartGateConfig.PlinthHeight, StartGateConfig.PlinthSize, 1, 0.22f), hotPink, true)
                    .At(x, StartGateConfig.PlinthHeight / 2, 0);
                SceneKit.Mesh(group, Geo.Cylinder(StartGateConfig.PillarRadius * 1.1f, StartGateConfig.FootRadius, StartGateConfig.FootHeight, 20), frosting, true)
                    .At(x, StartGateConfig.PlinthHeight + StartGateConfig.FootHeight / 2, 0);
                SceneKit.Mesh(group, Geo.Cylinder(StartGateConfig.PillarRadius, StartGateConfig.PillarRadius * 1.08f, StartGateConfig.PillarHeight, 20), cane, true)
                    .At(x, StartGateConfig.FootHeight + StartGateConfig.PillarHeight / 2, 0);

                float top = StartGateConfig.FootHeight + StartGateConfig.PillarHeight;
                SceneKit.Mesh(group, Geo.Cylinder(StartGateConfig.FlagPoleRadius, StartGateConfig.FlagPoleRadius, StartGateConfig.FlagPoleHeight, 10), frosting, true)
                    .At(x, top + StartGateConfig.FlagPoleHeight / 2, 0);
                SceneKit.Mesh(group, Geo.Sphere(StartGateConfig.FlagPoleRadius * 2.4f, 12, 9), hotPink)
                    .At(x, top + StartGateConfig.FlagPoleHeight, 0);
                // A bandeira sai para FORA da pista, virada para o grid.
                SceneKit.Mesh(group, Geo.Plane(StartGateConfig.FlagWidth, StartGateConfig.FlagHeight), flagMaterial, true, true, "gate-flag")
                    .At(x + side * StartGateConfig.FlagWidth / 2, top + StartGateConfig.FlagPoleHeight - StartGateConfig.FlagHeight * 0.7f, 0)
                    .RotY(Mathf.PI);
            }
        }

        void AddGateDecorations(Transform group, float halfSpan, Func<float, float> archHeightAt)
        {
            Mat lollipop = Mats.Candy(0xffffff, 0.16f, 0, ProceduralTextures.Swirl(), true);
            Mat star = Mats.Candy(StartGateConfig.Star, 0.2f, 0.18f, null, true);
            float front = -StartGateConfig.ArchThickness - 0.25f;

            foreach (int side in new[] { 1, -1 })
            {
                SceneKit.Mesh(group, Geo.Cylinder(StartGateConfig.LollipopRadius, StartGateConfig.LollipopRadius, StartGateConfig.LollipopThickness, 28), lollipop, true)
                    .At(side * halfSpan * StartGateConfig.LollipopAt, archHeightAt(StartGateConfig.LollipopAt), front)
                    .Rot(Mathf.PI / 2, 0, 0);

                AddGateCloud(group, side * halfSpan * StartGateConfig.CloudAt, archHeightAt(StartGateConfig.CloudAt), front);

                SceneKit.Mesh(group, StarGeometry(StartGateConfig.StarOuterRadius, StartGateConfig.StarInnerRadius), star, false, true, "gate-star")
                    .At(side * halfSpan * StartGateConfig.StarAt, archHeightAt(StartGateConfig.StarAt), front - StartGateConfig.CloudRadius - 0.8f)
                    .Rot(0, Mathf.PI, side * 0.25f);
            }
        }

        /// <summary>Nuvenzinha de marshmallow com olhos "^" e sorriso.</summary>
        void AddGateCloud(Transform group, float x, float y, float z)
        {
            float radius = StartGateConfig.CloudRadius;
            Mat cloud = Mats.Candy(StartGateConfig.Cloud, 0.55f, 0.1f);
            Mat face = Mats.Candy(StartGateConfig.Face, 0.4f);
            Mat cheek = Mats.Candy(StartGateConfig.Cheek, 0.4f);

            (float px, float py, float scale)[] puffs =
            {
                (0, 0, 1), (-radius * 0.78f, -radius * 0.22f, 0.72f), (radius * 0.8f, -radius * 0.18f, 0.68f), (-radius * 0.16f, radius * 0.58f, 0.6f),
            };
            foreach (var p in puffs)
                SceneKit.Mesh(group, Geo.Sphere(radius * p.scale, 14, 11), cloud, true).At(x + p.px, y + p.py, z);

            float faceZ = z - radius * 0.92f;
            foreach (int side in new[] { 1, -1 })
            {
                SceneKit.Mesh(group, Geo.Torus(radius * 0.17f, radius * 0.045f, 6, 12, Mathf.PI), face).At(x + side * radius * 0.32f, y + radius * 0.08f, faceZ);
                SceneKit.Mesh(group, Geo.Sphere(radius * 0.13f, 10, 8), cheek).At(x + side * radius * 0.52f, y - radius * 0.12f, faceZ).Scl(1, 1, 0.35f);
            }
            SceneKit.Mesh(group, Geo.Torus(radius * 0.19f, radius * 0.05f, 6, 14, Mathf.PI), face)
                .At(x, y - radius * 0.18f, faceZ).Rot(0, 0, Mathf.PI);
        }

        /// <summary>Letreiro "CANDY RUSH", coroa em cima e semáforo embaixo.</summary>
        void AddGateSign(Transform group, float archTop, Mat frosting, Mat gold)
        {
            float width = StartGateConfig.SignWidth;
            float height = width / 4;
            float centerY = archTop + StartGateConfig.SignAboveArch + height / 2;
            float signZ = -StartGateConfig.ArchThickness - 0.5f;

            Texture2D texture = ProceduralTextures.Sign(StartGateConfig.SignText, "#ff4f93");
            var signOptions = Mats.Opt(0.35f);
            signOptions.Map = texture;
            signOptions.Emissive = 0xffffff;
            signOptions.EmissiveIntensity = 0.3f;
            signOptions.EmissiveUsesMap = true;
            Mat sign = Mats.Standard(0xffffff, signOptions);

            SceneKit.Mesh(group, Geo.RoundedBox(width + 0.7f, height + 0.7f, 0.45f, 1, 0.3f), frosting, true).At(0, centerY, signZ + 0.28f);
            SceneKit.Mesh(group, Geo.Plane(width, height), sign).At(0, centerY, signZ).RotY(Mathf.PI);

            // --- Coroa ---
            float crownY = centerY + height / 2 + StartGateConfig.CrownBandHeight / 2;
            SceneKit.Mesh(group, Geo.Cylinder(StartGateConfig.CrownBandRadius, StartGateConfig.CrownBandRadius, StartGateConfig.CrownBandHeight, 18), gold, true)
                .At(0, crownY, signZ + 0.2f);
            foreach (int spike in new[] { -1, 0, 1 })
            {
                float tall = spike == 0 ? 1.35f : 1f;
                float sx = spike * StartGateConfig.CrownBandRadius * 0.72f;
                SceneKit.Mesh(group, Geo.Cone(StartGateConfig.CrownSpikeRadius, StartGateConfig.CrownSpikeHeight * tall, 10), gold, true)
                    .At(sx, crownY + StartGateConfig.CrownSpikeHeight * tall / 2 + StartGateConfig.CrownBandHeight / 2, signZ + 0.2f);
                SceneKit.Mesh(group, Geo.Sphere(StartGateConfig.CrownSpikeRadius * 0.55f, 10, 8), gold)
                    .At(sx, crownY + StartGateConfig.CrownSpikeHeight * tall + StartGateConfig.CrownBandHeight / 2, signZ + 0.2f);
            }

            // --- Semáforo decorativo ---
            float barWidth = StartGateConfig.LightsSpacing * StartGateConfig.LightsCount + 0.8f;
            float barY = centerY - height / 2 - StartGateConfig.LightsBelowSign - StartGateConfig.LightsBarHeight / 2;
            SceneKit.Mesh(group, Geo.RoundedBox(barWidth, StartGateConfig.LightsBarHeight, StartGateConfig.LightsBarDepth, 1, 0.2f),
                Mats.Candy(StartGateConfig.LightBar, 0.4f), true).At(0, barY, signZ + 0.1f);
            Mat bulb = Mats.Candy(StartGateConfig.LightOn, 0.15f, 0.9f);
            for (int i = 0; i < StartGateConfig.LightsCount; i++)
            {
                SceneKit.Mesh(group, Geo.Sphere(StartGateConfig.LightsRadius, 14, 10), bulb)
                    .At((i - (StartGateConfig.LightsCount - 1) / 2f) * StartGateConfig.LightsSpacing, barY, signZ - StartGateConfig.LightsBarDepth * 0.35f)
                    .Scl(1, 1, 0.5f);
            }
        }

        /// <summary>Estrela de cinco pontas chapada: leque de triângulos do centro para a borda.</summary>
        static MeshData StarGeometry(float outer, float inner)
        {
            var g = new MeshData();
            const int points = 5;
            for (int i = 0; i < points * 2; i++)
            {
                float angleA = (float)i / (points * 2) * Mathf.PI * 2 - Mathf.PI / 2;
                float angleB = (float)(i + 1) / (points * 2) * Mathf.PI * 2 - Mathf.PI / 2;
                float ra = i % 2 == 0 ? outer : inner;
                float rb = i % 2 == 0 ? inner : outer;
                int start = g.VertexCount;
                g.Add(Vector3.zero, Vector3.forward, Vector2.zero);
                g.Add(new Vector3(Mathf.Cos(angleA) * ra, Mathf.Sin(angleA) * ra, 0), Vector3.forward, Vector2.zero);
                g.Add(new Vector3(Mathf.Cos(angleB) * rb, Mathf.Sin(angleB) * rb, 0), Vector3.forward, Vector2.zero);
                g.Tri(start, start + 1, start + 2);
            }
            return g.ComputeNormals();
        }
    }
}
