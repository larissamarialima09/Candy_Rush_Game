using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// O "Doce Castelo" com a pista passando por um túnel (track/candyCastle.ts).
    ///
    /// São centenas de peças; cada uma é assada na geometria e, no fim, tudo que
    /// usa o mesmo material vira UMA malha. Os detalhes miúdos ficam numa malha
    /// à parte que não projeta sombra.
    /// </summary>
    public sealed class CandyCastle
    {
        public readonly Transform Root;

        readonly CircuitPath path;
        readonly SeededRandom random = new SeededRandom(CircuitConfig.RandomSeed + 2024);
        readonly Dictionary<string, (string material, bool castShadow, MeshData data)> buckets =
            new Dictionary<string, (string, bool, MeshData)>();
        readonly Dictionary<string, Mat> materials;
        readonly float inner;
        readonly Vector3 origin, left, forward;
        readonly List<Transform> signs = new List<Transform>();
        float time;

        static readonly string[] CandyColors = { "pink", "icing", "blue", "yellow", "lavender", "mint", "peach" };
        static readonly string[] GumdropColors = { "hotPink", "blue", "yellow", "mint", "lavender", "orange" };

        /// <summary>O referencial do castelo: eixo do túnel pela CORDA entre entrada e saída.</summary>
        static void Frame(CircuitPath path, out Vector3 origin, out Vector3 left, out Vector3 forward, out float heading, out int entryIndex)
        {
            entryIndex = path.IndexAtFraction(CastleConfig.At);
            float metersPerSample = path.TotalLength / path.Count;
            int exitIndex = (entryIndex + Mathf.RoundToInt(CastleConfig.TunnelLength / metersPerSample)) % path.Count;
            Vector3 entry = path.Samples[entryIndex].Position;
            Vector3 exit = path.Samples[exitIndex].Position;
            forward = new Vector3(exit.x - entry.x, 0, exit.z - entry.z).normalized;
            left = new Vector3(forward.z, 0, -forward.x);
            origin = entry;
            heading = Mathf.Atan2(forward.x, forward.z);
        }

        /// <summary>"Este ponto do mundo cai dentro do castelo?"</summary>
        public static Func<float, float, float, bool> Footprint(CircuitPath path)
        {
            Frame(path, out Vector3 origin, out Vector3 left, out Vector3 forward, out _, out _);
            return (x, z, margin) =>
            {
                float dx = x - origin.x, dz = z - origin.z;
                float localX = dx * left.x + dz * left.z;
                float localZ = dx * forward.x + dz * forward.z;
                foreach (CastleConfig.Area a in CastleConfig.Footprint)
                {
                    if (localX >= a.MinX - margin && localX <= a.MaxX + margin &&
                        localZ >= a.MinZ - margin && localZ <= a.MaxZ + margin) return true;
                }
                return false;
            };
        }

        public CandyCastle(CircuitPath path, Transform parent)
        {
            this.path = path;
            Frame(path, out origin, out left, out forward, out float heading, out int entryIndex);
            Root = SceneKit.Node("candy-castle", parent);
            materials = CreateMaterials();
            PathSample sample = path.Samples[entryIndex];
            inner = sample.HalfWidth + TrackConfig.BarrierOffsetFromEdge + CastleConfig.WallMargin;

            BuildTunnel();
            BuildPortal(true);
            BuildPortal(false);
            BuildBells();
            BuildBody();
            foreach (CastleConfig.Tower tower in CastleConfig.Towers) BuildTower(tower);
            BuildStairs();
            BuildGarden();
            BuildHearts();
            Flush();
            BuildSigns();

            Root.localPosition = origin;
            Root.localRotation = MathUtil.AxisAngle(Vector3.up, heading);
        }

        /// <summary>Só visual: a "respiração" dos letreiros.</summary>
        public void Update(float dt)
        {
            time += dt;
            for (int i = 0; i < signs.Count; i++)
            {
                float scale = 1 + Mathf.Sin(time * CastleConfig.SignPulseSpeed + i * 1.7f) * CastleConfig.SignPulse;
                signs[i].localScale = new Vector3(scale, scale, 1);
            }
        }

        // ------------------------------------------------------------ túnel ---

        void BuildTunnel()
        {
            float w = inner;
            float wo = w + CastleConfig.ShellThickness;
            float bottom = -CastleConfig.BuriedDepth;

            var block = new List<Vector2>
            {
                new Vector2(-wo, bottom), new Vector2(-wo, CastleConfig.TerraceHeight),
                new Vector2(wo, CastleConfig.TerraceHeight), new Vector2(wo, bottom),
            };
            block.AddRange(ArchPoints(w, CastleConfig.WallHeight, CastleConfig.ArchRise, bottom, 28));
            Add("ginger", Geo.Extrude(block, CastleConfig.TunnelLength), null);

            // Anéis listrados forrando o arco por dentro.
            const float liner = 0.22f;
            var hoop = new List<Vector2>(ArchPoints(w, CastleConfig.WallHeight, CastleConfig.ArchRise, bottom, 28));
            List<Vector2> innerArch = ArchPoints(w - liner, CastleConfig.WallHeight, CastleConfig.ArchRise - liner, bottom, 28);
            innerArch.Reverse();
            hoop.AddRange(innerArch);
            int count = Mathf.Max(1, Mathf.RoundToInt(CastleConfig.TunnelLength / CastleConfig.HoopLength));
            float hoopLength = CastleConfig.TunnelLength / count;
            MeshData hoopGeometry = Geo.Extrude(hoop, hoopLength);
            for (int i = 0; i < count; i++)
                Add(i % 2 == 0 ? "hoopPink" : "hoopWhite", hoopGeometry.Clone(), MathUtil.At(0, 0, i * hoopLength), false);
        }

        /// <summary>Moldura da boca do túnel: marshmallows no arco, friso de bengala e de glacê.</summary>
        void BuildPortal(bool isFront)
        {
            float w = inner;
            float depth = CastleConfig.PortalDepth;
            float zCenter = isFront ? -depth / 2 : CastleConfig.TunnelLength + depth / 2;

            float grow = CastleConfig.ShellThickness / 2 + 0.1f;
            List<Vector2> middle = ArchPoints(w + grow, CastleConfig.WallHeight, CastleConfig.ArchRise + grow, -0.8f, 64);
            var lengths = new List<float> { 0 };
            for (int i = 1; i < middle.Count; i++) lengths.Add(lengths[i - 1] + Vector2.Distance(middle[i], middle[i - 1]));
            float total = lengths[lengths.Count - 1];
            Vector2 PointAt(float distance)
            {
                float s = Mathf.Min(total, Mathf.Max(0, distance));
                int k = 1;
                while (k < lengths.Count - 1 && lengths[k] < s) k++;
                float span = lengths[k] - lengths[k - 1];
                if (span == 0) span = 1;
                return Vector2.Lerp(middle[k - 1], middle[k], (s - lengths[k - 1]) / span);
            }

            float piece = total / CastleConfig.MarshmallowCount;
            for (int i = 0; i < CastleConfig.MarshmallowCount; i++)
            {
                float s = (i + 0.5f) * piece;
                Vector2 p = PointAt(s), a = PointAt(s - 0.4f), b = PointAt(s + 0.4f);
                float angle = Mathf.Atan2(b.y - a.y, b.x - a.x);
                Add(CandyColors[i % CandyColors.Length],
                    Geo.RoundedBox(piece - 0.28f, CastleConfig.ShellThickness + 0.5f, depth, 1, 0.6f),
                    MathUtil.At(p.x, p.y, zCenter, 0, 0, angle));
            }

            float outerGrow = CastleConfig.ShellThickness + 0.45f;
            var outer = new List<Vector3>();
            foreach (Vector2 q in ArchPoints(w + outerGrow, CastleConfig.WallHeight, CastleConfig.ArchRise + outerGrow, -0.8f, 40))
                outer.Add(new Vector3(q.x, q.y, zCenter));
            Add("caneTrim", Geo.Tube(outer, 70, 0.38f, 8), null);

            float lip = isFront ? -depth - 0.04f : CastleConfig.TunnelLength + depth + 0.04f;
            var innerTrim = new List<Vector3>();
            foreach (Vector2 q in ArchPoints(w - 0.05f, CastleConfig.WallHeight, CastleConfig.ArchRise - 0.05f, -0.8f, 40))
                innerTrim.Add(new Vector3(q.x, q.y, lip));
            Add("icing", Geo.Tube(innerTrim, 60, 0.28f, 6), null);

            if (!isFront) return;

            // Placa "KART TRACK" no alto do arco, com dois pirulitos.
            float ringTop = CastleConfig.WallHeight + CastleConfig.ArchRise + CastleConfig.ShellThickness + 0.35f;
            Add("hotPink", Geo.RoundedBox(10.4f, 3.0f, 0.8f, 1, 0.35f), MathUtil.At(0, ringTop + 1.5f, zCenter));
            foreach (float x in new[] { -6.6f, 6.6f }) AddLollipop(x, ringTop - 0.8f, zCenter, 4.6f, 1.25f);
        }

        /// <summary>Sinos dourados pendurados no teto, em duas fileiras.</summary>
        void BuildBells()
        {
            const float liner = 0.22f;
            float halfWidth = inner - liner;
            float rise = CastleConfig.ArchRise - liner;
            Vector2[] bellProfile =
            {
                new Vector2(0.62f, 0), new Vector2(0.6f, 0.08f), new Vector2(0.46f, 0.3f),
                new Vector2(0.38f, 0.62f), new Vector2(0.24f, 0.9f), new Vector2(0, 1.0f),
            };

            for (float z = 2.5f; z < CastleConfig.TunnelLength - 1; z += CastleConfig.BellSpacing)
            {
                foreach (float x in new[] { -4.2f, 4.2f })
                {
                    float ceiling = CastleConfig.WallHeight + rise * Mathf.Sqrt(Mathf.Max(0, 1 - (x / halfWidth) * (x / halfWidth)));
                    float bellTop = ceiling - 1.1f;
                    Add("gold", Geo.Cylinder(0.04f, 0.04f, 1.3f, 5), MathUtil.At(x, ceiling - 0.5f, z), false);
                    Add("gold", Geo.Lathe(bellProfile, 12), MathUtil.At(x, bellTop - 1.0f, z), false);
                    Add("gold", Geo.Sphere(0.17f, 8, 6), MathUtil.At(x, bellTop - 1.08f, z), false);
                }
            }
        }

        // ------------------------------------------------------------ corpo ---

        void BuildBody()
        {
            float wo = inner + CastleConfig.ShellThickness;
            float bottom = -CastleConfig.BuriedDepth;
            float top = CastleConfig.TerraceHeight;

            Box("ginger", wo, 44, bottom, 13, 0, 28);
            Box("ginger", -wo - 5, -wo, bottom, 12, 0, 22);
            Box("ginger", -12, 38, 12.6f, 23, 5, 28);
            Box("ginger", 2, 18, 22.6f, 31, 8, 22);

            IcingEdge(-wo, wo, top, 0);
            GumdropRow(-wo + 1, wo - 1, top + 0.35f, 1.3f, 1.9f, 0.72f);
            IcingEdge(wo, 44, 13, 0);
            GumdropRow(wo + 1.2f, 43, 13.35f, 1.1f, 1.9f, 0.72f);
            IcingEdge(-wo - 5, -wo, 12, 0);
            GumdropRow(-wo - 4.2f, -wo - 0.8f, 12.35f, 1.1f, 1.7f, 0.62f);
            IcingEdge(-12, 38, 23, 5);
            GumdropRow(-11, 37, 23.35f, 6.1f, 1.8f, 0.66f);
            IcingEdge(2, 18, 31, 8);

            for (float x = wo + 2; x < 43; x += 1.55f)
                Add(GumdropColors[Mathf.FloorToInt(x) % GumdropColors.Length], Geo.Sphere(0.28f, 8, 6),
                    MathUtil.At(x, 10.6f, -0.05f, 0, 0, 0, 1, 1, 0.45f), false);

            foreach (float x in new float[] { 20, 26, 32, 38 }) AddWindow(x, 5.2f, 0, 2.2f, 3.6f);
            foreach (float x in new float[] { -9, -3, 25, 31, 36 }) AddWindow(x, 16.4f, 5, 2.0f, 3.2f);
            foreach (float x in new[] { 5.2f, 14.8f }) AddWindow(x, 23.6f, 8, 1.6f, 2.4f);
            AddWindow(10, top, 5, 4.0f, 5.6f);

            // Frontão triangular da torre central.
            const float gableWidth = 8.6f, gableHeight = 6.5f;
            var gable = new List<Vector2> { new Vector2(-gableWidth, 0), new Vector2(gableWidth, 0), new Vector2(0, gableHeight) };
            Add("ginger", Geo.Extrude(gable, 14.8f), MathUtil.At(10, 31, 7.6f));
            float slope = Mathf.Atan2(gableHeight, gableWidth);
            float slabLength = MathUtil.Hypot(gableWidth, gableHeight) + 0.8f;
            foreach (int side in new[] { -1, 1 })
            {
                float cx = 10 + side * (gableWidth / 2);
                float cy = 31 + gableHeight / 2;
                float nx = side * Mathf.Sin(slope), ny = Mathf.Cos(slope);
                Add("hotPink", Geo.Box(slabLength, 0.7f, 16), MathUtil.At(cx + nx * 0.35f, cy + ny * 0.35f, 15, 0, 0, -side * slope));
                Add("icing", Geo.RoundedBox(slabLength, 0.8f, 0.8f, 1, 0.3f), MathUtil.At(cx + nx * 0.5f, cy + ny * 0.5f, 7.1f, 0, 0, -side * slope));
            }
            Add("hotPink", Geo.Sphere(0.7f, 12, 8), MathUtil.At(10, 31 + gableHeight + 0.7f, 7.4f));
            Add("swirl", Geo.Cylinder(1.3f, 1.3f, 0.3f, 24).RotateX(Mathf.PI / 2), MathUtil.At(10, 33.4f, 7.45f), false);
            Add("hotPink", Geo.RoundedBox(10.8f, 3.2f, 0.7f, 1, 0.3f), MathUtil.At(10, 28.4f, 7.6f));
        }

        void BuildTower(CastleConfig.Tower tower)
        {
            float wo = inner + CastleConfig.ShellThickness;
            float x = tower.X, z = tower.Z, r = tower.Radius, h = tower.Height;
            // Torre sobre o túnel nasce no alto do bloco, nunca atravessando o arco.
            float baseY = Mathf.Abs(x) - r < wo ? CastleConfig.TerraceHeight - 0.5f : -CastleConfig.BuriedDepth;

            string body = tower.Body == "cane" ? "caneBody" : tower.Body;
            Add(body, Geo.Cylinder(r, r * 1.05f, h - baseY, 18), MathUtil.At(x, (h + baseY) / 2, z));

            MeshData band = Geo.Torus(r + 0.06f, 0.22f, 5, 18).RotateX(Mathf.PI / 2);
            Add(tower.Body == "pink" ? "icing" : "pink", band.Clone(), MathUtil.At(x, h - 5.5f, z));
            Add("icing", band, MathUtil.At(x, h - 0.9f, z));

            Add("icing", Geo.Cylinder(r + 0.45f, r + 0.35f, 0.9f, 18), MathUtil.At(x, h + 0.2f, z));
            for (int i = 0; i < 11; i++)
            {
                float angle = i / 11f * Mathf.PI * 2 + random.Next() * 0.2f;
                float length = 0.5f + random.Next() * 1.1f;
                Add("icing", Geo.Sphere(1, 6, 4),
                    MathUtil.At(x + Mathf.Cos(angle) * (r + 0.32f), h - 0.1f - length / 2, z + Mathf.Sin(angle) * (r + 0.32f), 0, 0, 0, 0.3f, length / 2, 0.3f), false);
            }

            AddWindow(x, h - 4.4f, z - r + 0.12f, Mathf.Min(1.5f, r * 0.55f), 2.4f);

            float roofBase = h + 0.6f;
            float roofTop = roofBase;
            if (tower.Roof == "cane" || tower.Roof == "blue")
            {
                float coneRadius = r + 0.55f;
                float coneHeight = coneRadius * (tower.Roof == "cane" ? 3.3f : 2.6f);
                Add(tower.Roof == "cane" ? "caneRoof" : "blue", Geo.Cone(coneRadius, coneHeight, 18), MathUtil.At(x, roofBase + coneHeight / 2, z));
                roofTop = roofBase + coneHeight;
                Add("icing", Geo.Sphere(0.36f, 10, 8), MathUtil.At(x, roofTop, z));
                if (tower.Roof == "blue")
                {
                    for (int i = 0; i < 9; i++)
                    {
                        float angle = i / 9f * Mathf.PI * 2;
                        float length = 0.6f + random.Next() * 0.9f;
                        Add("icing", Geo.Sphere(1, 6, 4),
                            MathUtil.At(x + Mathf.Cos(angle) * (coneRadius * 0.86f), roofBase + 0.5f, z + Mathf.Sin(angle) * (coneRadius * 0.86f), 0, 0, 0, 0.34f, length / 2, 0.34f), false);
                    }
                }
            }
            else if (tower.Roof == "dome")
            {
                float s = r + 0.6f;
                float[,] raw = { { 0.72f, 0 }, { 1.0f, 0.32f }, { 1.06f, 0.62f }, { 0.92f, 0.98f }, { 0.58f, 1.32f }, { 0.22f, 1.62f }, { 0, 1.78f } };
                var profile = new List<Vector2>();
                for (int i = 0; i < raw.GetLength(0); i++) profile.Add(new Vector2(raw[i, 0] * s, raw[i, 1] * s));
                Add("blue", Geo.Lathe(profile, 18), MathUtil.At(x, roofBase - 0.2f, z));
                for (int i = 0; i < 10; i++)
                {
                    float angle = i / 10f * Mathf.PI * 2;
                    Add(GumdropColors[i % GumdropColors.Length], Geo.Sphere(0.26f, 6, 4),
                        MathUtil.At(x + Mathf.Cos(angle) * s * 1.05f, roofBase - 0.2f + s * 0.62f, z + Mathf.Sin(angle) * s * 1.05f), false);
                }
                Add("icing", Geo.Sphere(s * 0.5f, 14, 6, 0, Mathf.PI * 2, 0, Mathf.PI / 2),
                    MathUtil.At(x, roofBase - 0.2f + s * 1.12f, z, 0, 0, 0, 1, 0.55f, 1));
                roofTop = roofBase - 0.2f + s * 1.78f;
                Add("hotPink", Geo.Sphere(0.42f, 10, 8), MathUtil.At(x, roofTop + 0.3f, z));
                roofTop += 0.6f;
            }
            else
            {
                Add("hotPink", Geo.Sphere(r + 0.4f, 18, 10, 0, Mathf.PI * 2, 0, Mathf.PI / 2), MathUtil.At(x, roofBase - 0.3f, z, 0, 0, 0, 1, 1.1f, 1));
                roofTop = roofBase - 0.3f + (r + 0.4f) * 1.1f;
                Add("icing", Geo.Sphere(0.4f, 10, 8), MathUtil.At(x, roofTop + 0.2f, z));
                roofTop += 0.5f;
            }

            Add("icing", Geo.Cylinder(0.07f, 0.07f, 2.6f, 6), MathUtil.At(x, roofTop + 1.2f, z));
            Add("hotPink", Geo.Box(1.5f, 0.9f, 0.08f, 8, 1, 1), MathUtil.At(x + 0.78f, roofTop + 2.0f, z), false);
        }

        /// <summary>Escada de jujubas descendo do terraço até o gramado.</summary>
        void BuildStairs()
        {
            var top = new Vector2(19.5f, -0.9f);
            var foot = new Vector2(40, -20);
            const int steps = 16;
            const float width = 5, landing = 13;
            float bottom = -CastleConfig.BuriedDepth;

            Vector2 run = -(foot - top);
            float length = run.magnitude;
            run.Normalize();
            float angle = Mathf.Atan2(-run.y, run.x);
            var across = new Vector2(Mathf.Sin(angle), Mathf.Cos(angle));
            float stepRun = length / steps;
            float rise = landing / steps;

            for (int i = 0; i < steps; i++)
            {
                float u = stepRun * (i + 0.5f);
                float cx = foot.x + run.x * u, cz = foot.y + run.y * u;
                float stepTop = rise * (i + 1);
                Add("ginger", Geo.Box(stepRun + 0.05f, stepTop - bottom, width), MathUtil.At(cx, (stepTop + bottom) / 2, cz, 0, angle, 0));
                for (int k = 0; k < 4; k++)
                {
                    float w = (k - 1.5f) * 1.18f;
                    string color = CandyColors[(i * 3 + k) % CandyColors.Length];
                    if (color == "icing") color = "hotPink";
                    Add(color, Geo.Sphere(1, 8, 5),
                        MathUtil.At(cx + across.x * w, stepTop + 0.12f, cz + across.y * w, 0, angle, 0, 0.36f, 0.3f, 0.56f), false);
                }
            }

            var postTops = new[] { new List<Vector3>(), new List<Vector3>() };
            for (int i = 0; i <= steps; i += 4)
            {
                float u = stepRun * Mathf.Min(i, steps - 0.5f);
                float stepTop = rise * Mathf.Min(i + 1, steps);
                for (int side = 0; side < 2; side++)
                {
                    float w = (side == 0 ? -1 : 1) * (width / 2 - 0.25f);
                    float px = foot.x + run.x * u + across.x * w;
                    float pz = foot.y + run.y * u + across.y * w;
                    float postHeight = i == 0 ? 4.2f : 2.3f;
                    Add("caneBody", Geo.Cylinder(0.18f, 0.18f, postHeight, 10), MathUtil.At(px, stepTop + postHeight / 2, pz));
                    if (i == 0)
                        Add("caneBody", Geo.Torus(0.55f, 0.18f, 6, 12, Mathf.PI),
                            MathUtil.At(px - run.x * 0.55f, stepTop + postHeight, pz - run.y * 0.55f, 0, angle + Mathf.PI, 0));
                    postTops[side].Add(new Vector3(px, stepTop + Mathf.Min(postHeight, 2.3f), pz));
                }
            }
            foreach (List<Vector3> rail in postTops) Add("icing", Geo.Tube(rail, 40, 0.13f, 6), null, false);
        }

        /// <summary>Pirulitos, cristais, gomas e arvorezinhas em volta da base.</summary>
        void BuildGarden()
        {
            float[,] lollipops = { { -18.5f, -3.5f, 5.6f, 1.5f }, { 17.2f, -4.2f, 4.6f, 1.3f }, { 24, -12.5f, 5.2f, 1.4f }, { 46.5f, -6, 6.2f, 1.7f }, { -22, 12, 5.0f, 1.3f } };
            for (int i = 0; i < lollipops.GetLength(0); i++)
            {
                float x = lollipops[i, 0], z = lollipops[i, 1];
                AddLollipop(x, GroundAt(x, z) - 0.4f, z, lollipops[i, 2], lollipops[i, 3]);
            }
            AddLollipop(33, 13, 2.5f, 3.4f, 1.1f);
            AddLollipop(-10.5f, 23, 7.2f, 3.2f, 1.0f);
            AddLollipop(36.5f, 23, 7.5f, 3.2f, 1.0f);

            float[,] crystals = { { 19.5f, -1.8f }, { -20.5f, -6.5f }, { 28, -17.5f }, { 45, -12 }, { 35.5f, -3 }, { -17.5f, -2.5f } };
            string[] crystalColors = { "lavender", "blue", "pink", "mint", "yellow" };
            for (int c = 0; c < crystals.GetLength(0); c++)
            {
                float cx = crystals[c, 0], cz = crystals[c, 1];
                float ground = GroundAt(cx, cz);
                for (int i = 0; i < 4; i++)
                {
                    float size = 0.55f + random.Next() * 0.6f;
                    float ox = (random.Next() - 0.5f) * 2.2f;
                    float oz = (random.Next() - 0.5f) * 2.2f;
                    float rx = (random.Next() - 0.5f) * 0.5f;
                    float ry = random.Next() * Mathf.PI;
                    float rz = (random.Next() - 0.5f) * 0.5f;
                    Add(crystalColors[(c + i) % crystalColors.Length], Geo.Octahedron(1),
                        MathUtil.At(cx + ox, ground + size * 0.9f, cz + oz, rx, ry, rz, size * 0.6f, size * 1.5f, size * 0.6f), false);
                }
            }

            for (int g = 0; g < 16; g++)
            {
                bool onRight = g % 4 == 0;
                float gx = onRight ? -15.5f - random.Next() * 6 : 16 + random.Next() * 30;
                float gz = onRight ? -2 - random.Next() * 8 : -1.5f - random.Next() * 3.5f;
                float ground = GroundAt(gx, gz);
                float size = 0.45f + random.Next() * 0.4f;
                Add(GumdropColors[g % GumdropColors.Length], Geo.Sphere(1, 10, 6, 0, Mathf.PI * 2, 0, Mathf.PI / 2),
                    MathUtil.At(gx, ground - 0.05f, gz, 0, 0, 0, size, size * 1.1f, size), false);
            }

            float[,] trees = { { 47, 1.5f }, { -23, 3 }, { -21.5f, 20 }, { 47, 18 }, { 47.5f, 30 } };
            for (int i = 0; i < trees.GetLength(0); i++)
            {
                float tx = trees[i, 0], tz = trees[i, 1];
                float ground = GroundAt(tx, tz);
                Add("icing", Geo.Cylinder(0.2f, 0.26f, 2.4f, 8), MathUtil.At(tx, ground + 1.2f, tz));
                Add(GumdropColors[(i * 2 + 1) % GumdropColors.Length], Geo.Sphere(1.5f, 14, 10), MathUtil.At(tx, ground + 3.3f, tz));
            }
        }

        /// <summary>Corações de goma flutuando diante da fachada.</summary>
        void BuildHearts()
        {
            var shape = new List<Vector2> { new Vector2(0, -1) };
            Geo.AddBezierPoints(shape, new Vector2(0, -1), new Vector2(-0.3f, -0.7f), new Vector2(-1.1f, -0.2f), new Vector2(-1.1f, 0.35f), 10);
            Geo.AddBezierPoints(shape, new Vector2(-1.1f, 0.35f), new Vector2(-1.1f, 0.95f), new Vector2(-0.35f, 1.15f), new Vector2(0, 0.6f), 10);
            Geo.AddBezierPoints(shape, new Vector2(0, 0.6f), new Vector2(0.35f, 1.15f), new Vector2(1.1f, 0.95f), new Vector2(1.1f, 0.35f), 10);
            Geo.AddBezierPoints(shape, new Vector2(1.1f, 0.35f), new Vector2(1.1f, -0.2f), new Vector2(0.3f, -0.7f), new Vector2(0, -1), 10);
            MeshData template = Geo.Extrude(shape, CastleConfig.HeartThickness, true, 0.16f, 0.14f, 2)
                .Translate(0, 0, -CastleConfig.HeartThickness / 2);

            string[] colors = { "hotPink", "pink", "lavender" };
            for (int i = 0; i < CastleConfig.HeartCount; i++)
            {
                float u = CastleConfig.HeartCount > 1 ? (float)i / (CastleConfig.HeartCount - 1) : 0.5f;
                float x = CastleConfig.HeartFromX + (CastleConfig.HeartToX - CastleConfig.HeartFromX) * u;
                float y = CastleConfig.HeartBaseHeight + (i % 3) * CastleConfig.HeartHeightStep;
                float z = CastleConfig.HeartZ - (i % 2) * CastleConfig.HeartZStagger;
                Add(colors[i % colors.Length], template.Clone(), MathUtil.At(x, y, z, 0, 0, 0, CastleConfig.HeartSize), false);
            }
        }

        /// <summary>Os dois letreiros: ficam fora da fusão, cada um com a própria textura.</summary>
        void BuildSigns()
        {
            float ringTop = CastleConfig.WallHeight + CastleConfig.ArchRise + CastleConfig.ShellThickness + 0.35f;
            AddSign("KART TRACK", 9.6f, 0, ringTop + 1.5f, -CastleConfig.PortalDepth / 2 - 0.42f);
            AddSign("DOCE CASTELO", 10.2f, 10, 28.4f, 7.22f);
        }

        // ------------------------------------------------------------ peças ---

        void Box(string material, float x0, float x1, float y0, float y1, float z0, float z1) =>
            Add(material, Geo.Box(x1 - x0, y1 - y0, z1 - z0), MathUtil.At((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));

        void IcingEdge(float x0, float x1, float yTop, float zFace)
        {
            Add("icing", Geo.RoundedBox(x1 - x0 + 0.5f, 0.8f, 1.1f, 1, 0.3f), MathUtil.At((x0 + x1) / 2, yTop - 0.05f, zFace + 0.3f));
            for (float x = x0 + 0.55f; x < x1 - 0.3f; x += 1.05f)
            {
                float length = 0.5f + random.Next() * 1.6f;
                Add("icing", Geo.Sphere(1, 6, 4),
                    MathUtil.At(x, yTop - 0.35f - length / 2 + 0.25f, zFace - 0.14f, 0, 0, 0, 0.3f, length / 2, 0.26f), false);
            }
        }

        void GumdropRow(float x0, float x1, float y, float z, float spacing, float radius)
        {
            MeshData half = Geo.Sphere(1, 10, 5, 0, Mathf.PI * 2, 0, Mathf.PI / 2);
            int index = 0;
            for (float x = x0; x <= x1; x += spacing)
                Add(GumdropColors[index++ % GumdropColors.Length], half.Clone(), MathUtil.At(x, y, z, 0, 0, 0, radius, radius * 1.15f, radius), false);
        }

        /// <summary>Janela (ou porta) em arco virada para -Z, com moldura rosa e peitoril.</summary>
        void AddWindow(float x, float yBottom, float zFace, float width, float height)
        {
            float half = width / 2;
            float straight = Mathf.Max(0.2f, height - half);
            var opening = new List<Vector2> { new Vector2(-half, 0), new Vector2(half, 0), new Vector2(half, straight) };
            Geo.AddArcPoints(opening, 0, straight, half, 0, Mathf.PI, 16);
            Geo.AddPoint(opening, new Vector2(-half, 0));
            Add("window", Geo.Extrude(opening, 0.3f), MathUtil.At(x, yBottom, zFace - 0.2f), false);

            float frame = Mathf.Max(0.16f, width * 0.09f);
            Add("pink", Geo.Torus(half + frame * 0.6f, frame, 5, 10, Mathf.PI), MathUtil.At(x, yBottom + straight, zFace - 0.22f), false);
            foreach (int side in new[] { -1, 1 })
                Add("pink", Geo.Box(frame * 2, straight, frame * 2), MathUtil.At(x + side * (half + frame * 0.6f), yBottom + straight / 2, zFace - 0.22f), false);
            Add("icing", Geo.RoundedBox(width + frame * 4, 0.36f, 0.8f, 1, 0.15f), MathUtil.At(x, yBottom - 0.1f, zFace - 0.3f), false);
        }

        void AddLollipop(float x, float yBase, float z, float height, float radius)
        {
            Add("icing", Geo.Cylinder(0.12f, 0.12f, height, 8), MathUtil.At(x, yBase + height / 2, z));
            Add("swirl", Geo.Cylinder(radius, radius, 0.32f, 24).RotateX(Mathf.PI / 2), MathUtil.At(x, yBase + height + radius * 0.8f, z), false);
        }

        void AddSign(string text, float width, float x, float y, float z)
        {
            var o = Mats.Opt(0.4f);
            o.Map = ProceduralTextures.Sign(text, CastleConfig.SignBackground);
            o.Emissive = 0xffffff;
            o.EmissiveIntensity = 0.28f;
            o.EmissiveUsesMap = true;
            Transform sign = SceneKit.Mesh(Root, Geo.Plane(width, width / 4), Mats.Standard(0xffffff, o), false, true, "castle-sign")
                .At(x, y, z).RotY(Mathf.PI);
            signs.Add(sign);
        }

        /// <summary>Altura do terreno num ponto do referencial local, relativa à origem.</summary>
        float GroundAt(float localX, float localZ)
        {
            float wx = origin.x + left.x * localX + forward.x * localZ;
            float wz = origin.z + left.z * localX + forward.z * localZ;
            return path.TerrainHeight(wx, wz) - origin.y;
        }

        void Add(string material, MeshData geometry, Matrix4x4? matrix, bool castShadow = true)
        {
            if (matrix.HasValue) geometry.Transform(matrix.Value);
            string key = castShadow ? material : material + ":detalhe";
            if (!buckets.TryGetValue(key, out var bucket))
            {
                bucket = (material, castShadow, new MeshData());
                buckets[key] = bucket;
            }
            bucket.data.Append(geometry);
        }

        /// <summary>Funde cada balde numa malha só.</summary>
        void Flush()
        {
            foreach (var pair in buckets)
            {
                var (material, castShadow, data) = pair.Value;
                SceneKit.Mesh(Root, data, materials[material], castShadow, true, "castle-" + pair.Key);
            }
            buckets.Clear();
        }

        /// <summary>Contorno do arco: parede reta, meia-elipse por cima e parede de volta.</summary>
        static List<Vector2> ArchPoints(float halfWidth, float wallHeight, float rise, float bottom, int segments)
        {
            var points = new List<Vector2> { new Vector2(halfWidth, bottom) };
            for (int i = 0; i <= segments; i++)
            {
                float angle = (float)i / segments * Mathf.PI;
                points.Add(new Vector2(Mathf.Cos(angle) * halfWidth, wallHeight + Mathf.Sin(angle) * rise));
            }
            points.Add(new Vector2(-halfWidth, bottom));
            return points;
        }

        static Dictionary<string, Mat> CreateMaterials()
        {
            Mat CandyCoat(int color, float roughness, float emissive, int top, int bottom, float rim, Texture map = null, Vector2? repeat = null)
            {
                var o = Mats.Opt(roughness);
                if (emissive > 0)
                {
                    o.Emissive = color;
                    o.EmissiveIntensity = emissive;
                }
                o.Map = map;
                if (repeat.HasValue) o.Repeat = repeat.Value;
                return Mats.Coat(Mats.Standard(color, o), top, bottom, rim);
            }

            Mat Plain(int color, float roughness, float emissive) => Mats.Candy(color, roughness, emissive);

            Texture2D stripes = ProceduralTextures.Stripe(CastleConfig.CaneStripe, "#ffffff");
            Texture2D swirl = ProceduralTextures.Swirl();
            var swirlOptions = Mats.Opt(0.14f);
            swirlOptions.Map = swirl;
            swirlOptions.Emissive = 0xffffff;
            swirlOptions.EmissiveIntensity = 0.08f;

            return new Dictionary<string, Mat>
            {
                ["ginger"] = CandyCoat(CastleConfig.Gingerbread, 0.55f, 0.03f, 0xffe2c0, 0xc97a44, 0.05f),
                ["icing"] = CandyCoat(CastleConfig.Icing, 0.28f, 0.07f, 0xffffff, 0xffe6f0, 0.08f),
                ["pink"] = CandyCoat(CastleConfig.Pink, 0.22f, 0.06f, 0xffc9df, 0xff7fb0, 0.09f),
                ["hotPink"] = CandyCoat(CastleConfig.HotPink, 0.2f, 0.07f, 0xffaacd, 0xff3f86, 0.09f),
                ["blue"] = CandyCoat(CastleConfig.Blue, 0.3f, 0.06f, 0xc9f5ff, 0x53bdeb, 0.1f),
                ["orange"] = CandyCoat(CastleConfig.Orange, 0.3f, 0.05f, 0xffe18b, 0xff8c28, 0.06f),
                ["peach"] = CandyCoat(CastleConfig.Peach, 0.34f, 0.05f, 0xffe8cc, 0xffa86a, 0.06f),
                ["mint"] = Plain(CastleConfig.Mint, 0.16f, 0.1f),
                ["yellow"] = Plain(CastleConfig.Yellow, 0.16f, 0.1f),
                ["lavender"] = Plain(CastleConfig.Lavender, 0.16f, 0.1f),
                ["window"] = Plain(CastleConfig.Window, 0.6f, 0),
                ["gold"] = Plain(CastleConfig.Gold, 0.25f, 0.35f),
                ["hoopPink"] = Plain(CastleConfig.HoopPink, 0.24f, 0.2f),
                ["hoopWhite"] = Plain(CastleConfig.HoopWhite, 0.24f, 0.16f),
                ["caneRoof"] = CandyCoat(0xffffff, 0.2f, 0.04f, 0xffffff, 0xffd6e0, 0.06f, stripes, new Vector2(4, 2)),
                ["caneBody"] = CandyCoat(0xffffff, 0.2f, 0.04f, 0xffffff, 0xffd6e0, 0.06f, stripes, new Vector2(3, 5)),
                ["caneTrim"] = Plain(0xffffff, 0.2f, 0.08f),
                ["swirl"] = Mats.Standard(0xffffff, swirlOptions),
            };
        }
    }
}
