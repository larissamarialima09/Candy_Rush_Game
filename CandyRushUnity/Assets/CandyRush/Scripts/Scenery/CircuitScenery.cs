using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>Onde a arquibancada principal ficou, para a plateia sentar nela.</summary>
    public struct GrandstandAnchor
    {
        public Vector3 Position;
        public float Heading;
        /// <summary>Sinal do X LOCAL em que os degraus sobem (para longe da pista).</summary>
        public float Side;
    }

    /// <summary>
    /// Tudo que fica ao redor do asfalto (track/circuitScenery.ts). Nada aqui
    /// tem colisão: a barreira que se sente é o <see cref="BarrierSystem"/>, no
    /// mesmo deslocamento da barreira que se vê.
    ///
    /// A ordem das chamadas ao gerador aleatório é a do original — mudá-la
    /// mudaria onde nasce cada árvore.
    /// </summary>
    public sealed class CircuitScenery
    {
        struct Placement
        {
            public Vector3 Position;
            public float HeadingY;
            public float Scale;
        }

        struct InstanceOptions
        {
            public int Color;
            public float Roughness;
            public bool CastShadow;
            public bool Stripes;
            public bool Unlit;
            public float Emissive;
            public Mat Material;
            public string Name;
        }

        public readonly Transform Root;
        public GrandstandAnchor Grandstand;
        public readonly CandyCastle Castle;

        readonly SeededRandom random = new SeededRandom(CircuitConfig.RandomSeed);
        readonly List<Vector3> treeFootprints = new List<Vector3>();
        readonly Texture2D stripeTexture = ProceduralTextures.Stripe();
        readonly Func<float, float, float, bool> inCastle;
        readonly Func<float, float, float, bool> inFactory;

        public CircuitScenery(CircuitPath path, Transform world)
        {
            Root = SceneKit.Node("circuit-scenery", world);
            inCastle = CandyCastle.Footprint(path);
            inFactory = CandyFactory.Footprint(path);
            AddCandyArenaFrame(path);
            AddCandyBarriers(path);
            AddLollipopPoles(path);
            AddGrandstand(path);
            AddArenaGrandstands(path);
            AddSweetShop(path);
            new CandyFactory(path, Root);
            AddCupcakeBalloons(path);
            Castle = new CandyCastle(path, Root);
            AddDonutTunnel(path);
            AddCandyTrees(path);
            AddGumdropHills(path);
            AddClouds(path);
            AddSweetGarden(path);
        }

        /// <summary>Moldura externa de balas: cara de arena de brinquedo.</summary>
        void AddCandyArenaFrame(CircuitPath path)
        {
            path.Bounds(82, out float minX, out float maxX, out float minZ, out float maxZ);
            var palette = new List<int>(CircuitConfig.Pastels) { 0xffffff, 0xffb9d2, 0xffe7a8 };
            var buckets = new List<Placement>[palette.Count];
            for (int i = 0; i < buckets.Length; i++) buckets[i] = new List<Placement>();
            const float spacing = 4.4f;
            int index = 0;

            void AddBlock(float x, float z, float heading)
            {
                buckets[index++ % palette.Count].Add(new Placement
                {
                    Position = new Vector3(x, path.TerrainHeight(x, z) + 0.55f, z),
                    HeadingY = heading,
                    Scale = 1,
                });
            }

            for (float x = minX; x <= maxX; x += spacing)
            {
                AddBlock(x, minZ, Mathf.PI / 2);
                AddBlock(x, maxZ, Mathf.PI / 2);
            }
            for (float z = minZ; z <= maxZ; z += spacing)
            {
                AddBlock(minX, z, 0);
                AddBlock(maxX, z, 0);
            }

            MeshData block = Geo.RoundedBox(3.9f, 1.1f, 1.15f, 1, 0.35f);
            for (int i = 0; i < palette.Count; i++)
                AddInstances(block, buckets[i], new InstanceOptions { Color = palette[i], Roughness = 0.18f, CastShadow = true, Emissive = 0.04f, Name = "arena-frame" });
        }

        /// <summary>Barreira de bala contínua nos DOIS lados da volta inteira.</summary>
        void AddCandyBarriers(CircuitPath path)
        {
            var palette = new List<int>(CircuitConfig.Pastels) { 0xffffff, 0xff9ec4 };
            var buckets = new List<Placement>[palette.Count];
            for (int i = 0; i < buckets.Length; i++) buckets[i] = new List<Placement>();
            int index = 0;

            PlaceAlong(path, CircuitConfig.TireWallSpacing, (sample, i) =>
            {
                // A cor avança ao longo da PISTA, não entre os lados.
                List<Placement> bucket = buckets[index++ % buckets.Length];
                foreach (int side in new[] { 1, -1 })
                {
                    float lateral = side * (sample.HalfWidth + TrackConfig.BarrierOffsetFromEdge);
                    bucket.Add(PlacementAt(path, i, lateral, 0, CircuitConfig.TireWallRadius, 1));
                }
            });

            float r = CircuitConfig.TireWallRadius;
            MeshData geometry = Geo.RoundedBox(r * 2.1f, r * 2.1f, CircuitConfig.TireWallHeight + r * 2, 1, r * 0.5f);
            for (int i = 0; i < palette.Count; i++)
                AddInstances(geometry, buckets[i], new InstanceOptions { Color = palette[i], Roughness = 0.18f, CastShadow = true, Name = "barrier" });
        }

        /// <summary>Postes-pirulito: mastro listrado com disco de bala no topo.</summary>
        void AddLollipopPoles(CircuitPath path)
        {
            var poles = new List<Placement>();
            var candyA = new List<Placement>();
            var candyB = new List<Placement>();
            int index = 0;

            PlaceAlong(path, CircuitConfig.PoleSpacing, (sample, i) =>
            {
                int side = index % 2 == 0 ? 1 : -1;
                float lateral = side * (sample.HalfWidth + CircuitConfig.PoleOffsetFromEdge);
                Placement pole = PlacementAt(path, i, lateral, 0, CircuitConfig.PoleHeight / 2, 1);
                if (inCastle(pole.Position.x, pole.Position.z, 1))
                {
                    index++;
                    return;
                }
                poles.Add(pole);
                Placement candy = PlacementAt(path, i, lateral, 0, CircuitConfig.PoleHeight, 1);
                (index % 4 < 2 ? candyA : candyB).Add(candy);
                index++;
            });

            AddInstances(Geo.Cylinder(CircuitConfig.PoleRadius, CircuitConfig.PoleRadius, CircuitConfig.PoleHeight, 10), poles,
                new InstanceOptions { Color = CircuitConfig.PoleColor, Roughness = 0.25f, Stripes = true, CastShadow = true, Name = "pole" });

            MeshData disc = Geo.Cylinder(CircuitConfig.PoleFlagWidth / 2, CircuitConfig.PoleFlagWidth / 2, 0.28f, 20).RotateX(Mathf.PI / 2);
            AddInstances(disc, candyA, new InstanceOptions { Color = CircuitConfig.PoleFlagColorA, Roughness = 0.15f, Stripes = true, CastShadow = true });
            AddInstances(disc, candyB, new InstanceOptions { Color = CircuitConfig.PoleFlagColorB, Roughness = 0.15f, Stripes = true, CastShadow = true });
        }

        /// <summary>A arquibancada principal, virada para a pista.</summary>
        void AddGrandstand(CircuitPath path)
        {
            int index = path.IndexAtFraction(CircuitConfig.GrandstandAt);
            PathSample sample = path.Samples[index];
            float heading = CircuitPath.HeadingOf(sample);
            float lateral = CircuitConfig.GrandstandSide * (sample.HalfWidth + Mathf.Max(CircuitConfig.GrandstandOffsetFromEdge, 38));
            Vector3 baseP = sample.Position + sample.Left * lateral;
            float awaySign = AwaySignFor(path, baseP, heading);
            GroundUnder(path, baseP, heading, CircuitConfig.GrandstandLength,
                CircuitConfig.GrandstandRows * CircuitConfig.GrandstandRowDepth, awaySign, out float gMin, out float gMax);
            baseP.y = gMax;

            Transform group = SceneKit.Node("grandstand", Root).At(baseP).RotY(heading);
            Mat frame = Mats.Candy(CircuitConfig.GrandstandFrameColor, 0.4f);
            Mat seat = Mats.Candy(CircuitConfig.GrandstandSeatColor, 0.35f);

            for (int row = 0; row < CircuitConfig.GrandstandRows; row++)
            {
                float h = CircuitConfig.GrandstandRowHeight * (row + 1);
                SceneKit.Mesh(group, Geo.Box(CircuitConfig.GrandstandRowDepth, h, CircuitConfig.GrandstandLength), row % 2 == 0 ? frame : seat, true)
                    .At(awaySign * row * CircuitConfig.GrandstandRowDepth, h / 2, 0);
            }

            float drop = gMax - gMin;
            if (drop > 0.01f)
            {
                float depth = CircuitConfig.GrandstandRows * CircuitConfig.GrandstandRowDepth + 1.4f;
                SceneKit.Mesh(group, Geo.Box(depth, drop + 0.6f, CircuitConfig.GrandstandLength + 0.8f), frame)
                    .At(awaySign * (depth / 2 - 0.9f), -(drop + 0.6f) / 2 + 0.05f, 0);
            }

            Grandstand = new GrandstandAnchor { Position = baseP, Heading = heading, Side = awaySign };
        }

        /// <summary>Arquibancadas extras, colocadas por FRAÇÃO DA VOLTA e recuadas até caber.</summary>
        void AddArenaGrandstands(CircuitPath path)
        {
            (float at, int side, float offset, float length, int rows)[] stands =
            {
                (0.14f, 1, 46, 34, 5), (0.34f, -1, 48, 28, 4), (0.58f, 1, 48, 32, 5), (0.82f, -1, 46, 28, 4),
            };
            int[] pastels = CircuitConfig.Pastels;
            var bodies = new List<Placement>[pastels.Length];
            var heads = new List<Placement>[pastels.Length];
            for (int i = 0; i < pastels.Length; i++)
            {
                bodies[i] = new List<Placement>();
                heads[i] = new List<Placement>();
            }
            int spectatorIndex = 0;

            foreach (var stand in stands)
            {
                int index = path.IndexAtFraction(stand.at);
                PathSample sample = path.Samples[index];
                float heading = CircuitPath.HeadingOf(sample);
                float offset = ClearOffsetFor(path, index, stand.side, stand.length, stand.rows * 1.15f, stand.offset, 14);
                if (offset < 0) continue;

                float lateral = stand.side * (sample.HalfWidth + offset);
                Vector3 baseP = sample.Position + sample.Left * lateral;
                float away = AwaySignFor(path, baseP, heading);
                GroundUnder(path, baseP, heading, stand.length, stand.rows * 1.15f, away, out float gMin, out float gMax);
                baseP.y = gMax;

                Transform group = SceneKit.Node("grandstand", Root).At(baseP).RotY(heading);
                AddGrandstandStructure(group, away, stand.length, stand.rows, gMax - gMin);
                AddGrandstandCrowd(baseP, heading, away, stand.length, stand.rows, bodies, heads, spectatorIndex);
                spectatorIndex += stand.rows * 11;
            }

            MeshData body = Geo.Sphere(0.38f, 9, 7).Scale(1, 0.95f, 0.85f);
            MeshData head = Geo.Sphere(0.22f, 8, 6);
            for (int i = 0; i < pastels.Length; i++)
            {
                AddInstances(body, bodies[i], new InstanceOptions { Color = pastels[i], Roughness = 0.35f, Emissive = 0.08f });
                AddInstances(head, heads[i], new InstanceOptions { Color = pastels[(i + 2) % pastels.Length], Roughness = 0.32f, Emissive = 0.08f });
            }
        }

        void AddGrandstandStructure(Transform group, float side, float length, int rows, float skirt)
        {
            const float rowDepth = 1.15f, rowHeight = 0.58f;
            Mat frame = Mats.Candy(0xfff1f7, 0.35f);
            Mat seatA = Mats.Candy(0xff83b5, 0.32f);
            Mat seatB = Mats.Candy(0x72d7ef, 0.32f);
            Mat rail = Mats.Candy(0xff5c96, 0.22f);
            var lampOptions = Mats.Opt(0.2f);
            lampOptions.Emissive = 0xffd07a;
            lampOptions.EmissiveIntensity = 0.7f;
            Mat lamp = Mats.Standard(0xfff4cf, lampOptions);

            for (int row = 0; row < rows; row++)
            {
                float h = rowHeight * (row + 1);
                SceneKit.Mesh(group, Geo.Box(rowDepth, h, length), row % 2 == 0 ? seatA : seatB, true).At(side * row * rowDepth, h / 2, 0);
            }

            float faceHeight = rows * rowHeight + 0.7f;
            SceneKit.Mesh(group, Geo.Box(0.36f, faceHeight, length + 1.6f), frame, true).At(-side * 0.55f, faceHeight / 2, 0);

            float postHeight = rows * rowHeight + 1.4f;
            foreach (float z in new[] { -(length + 1.4f) / 2, (length + 1.4f) / 2 })
            {
                SceneKit.Mesh(group, Geo.Cylinder(0.12f, 0.12f, postHeight, 8), rail, true).At(-side * 0.85f, postHeight / 2, z);
                SceneKit.Mesh(group, Geo.Cone(0.45f, 1.1f, 3), rail, true).At(-side * 1.35f, rows * rowHeight + 1.45f, z).Rot(0, 0, Mathf.PI / 2);
                SceneKit.Mesh(group, Geo.Cylinder(0.08f, 0.08f, 3.2f, 8), rail, true).At(-side * 1.55f, rows * rowHeight + 1.65f, z);
                for (int i = 0; i < 4; i++)
                {
                    SceneKit.Mesh(group, Geo.Sphere(0.2f, 10, 8), lamp)
                        .At(-side * 1.55f, rows * rowHeight + 3.1f + (i % 2) * 0.42f, z + (i - 1.5f) * 0.5f);
                }
            }

            SceneKit.Mesh(group, Geo.Box(0.18f, 0.18f, length + 1.8f), rail, true).At(-side * 0.85f, rows * rowHeight + 0.76f, 0);

            if (skirt > 0.01f)
            {
                float depth = rows * rowDepth + 1.6f;
                SceneKit.Mesh(group, Geo.Box(depth, skirt + 0.6f, length + 1.6f), frame).At(side * (depth / 2 - 1.0f), -(skirt + 0.6f) / 2 + 0.05f, 0);
            }
        }

        void AddGrandstandCrowd(Vector3 baseP, float heading, float side, float length, int rows,
            List<Placement>[] bodies, List<Placement>[] heads, int seedOffset)
        {
            int seats = Mathf.Max(11, Mathf.RoundToInt(length / 2.4f));
            const float rowDepth = 1.15f, rowHeight = 0.58f;
            float cosine = Mathf.Cos(heading), sine = Mathf.Sin(heading);
            int n = CircuitConfig.Pastels.Length;

            for (int row = 0; row < rows; row++)
            {
                for (int seat = 0; seat < seats; seat++)
                {
                    float localX = side * (row * rowDepth + 0.35f);
                    float localY = rowHeight * (row + 1) + 0.32f;
                    float localZ = (seat - (seats - 1) / 2f) * (length / seats);
                    var world = new Vector3(
                        baseP.x + localX * cosine + localZ * sine,
                        baseP.y + localY,
                        baseP.z - localX * sine + localZ * cosine);
                    float facing = heading - side * (Mathf.PI / 2);
                    int color = (seedOffset + row * seats + seat) % n;
                    bodies[color].Add(new Placement { Position = world, HeadingY = facing, Scale = 1 });
                    heads[color].Add(new Placement { Position = world + new Vector3(0, 0.44f, 0), HeadingY = facing, Scale = 1 });
                }
            }
        }

        /// <summary>Sweet shop ao lado da reta.</summary>
        void AddSweetShop(CircuitPath path)
        {
            int index = path.IndexAtFraction(CircuitConfig.PitAt);
            PathSample sample = path.Samples[index];
            float lateral = CircuitConfig.PitSide * (sample.HalfWidth + CircuitConfig.PitOffsetFromEdge);
            Vector3 position = sample.Position + sample.Left * lateral;
            position.y = path.SurfaceHeight(index, lateral);
            Transform group = SceneKit.Node("sweet-shop", Root).At(position).RotY(CircuitPath.HeadingOf(sample));

            SceneKit.Mesh(group, Geo.Box(CircuitConfig.PitDepth, CircuitConfig.PitHeight, CircuitConfig.PitLength), Mats.Candy(CircuitConfig.PitWallColor, 0.5f), true)
                .At(0, CircuitConfig.PitHeight / 2, 0);
            SceneKit.Mesh(group, Geo.Sphere(CircuitConfig.PitLength / 2, 20, 12, 0, Mathf.PI * 2, 0, Mathf.PI / 2), Mats.Candy(CircuitConfig.PitRoofColor, 0.3f), true)
                .At(0, CircuitConfig.PitHeight, 0).Scl(CircuitConfig.PitDepth / CircuitConfig.PitLength, 0.55f, 1);
            SceneKit.Mesh(group, Geo.Box(2.2f, 0.4f, CircuitConfig.PitLength * 0.8f), Mats.Candy(CircuitConfig.PitAwningColor, 0.3f, 0, stripeTexture), true)
                .At(-CircuitConfig.PitSide * (CircuitConfig.PitDepth / 2 + 0.9f), CircuitConfig.PitHeight * 0.62f, 0);
        }

        /// <summary>Túnel de Donut: toro em pé com a pista passando pelo furo.</summary>
        void AddDonutTunnel(CircuitPath path)
        {
            int index = path.IndexAtFraction(DonutConfig.At);
            PathSample sample = path.Samples[index];
            float ringRadius = DonutConfig.HoleRadius + DonutConfig.TubeRadius;

            Vector3 position = sample.Position;
            position.y = path.SurfaceHeight(index, 0);
            Transform group = SceneKit.Node("donut-tunnel", Root).At(position).RotY(CircuitPath.HeadingOf(sample));

            Mat dough = Mats.Coat(Mats.Candy(DonutConfig.Dough, 0.55f, 0.03f), DonutConfig.DoughTop, DonutConfig.DoughBottom, 0.04f);
            Mat icing = Mats.Coat(Mats.Candy(DonutConfig.Icing, 0.12f, 0.07f, null, true), DonutConfig.IcingTop, DonutConfig.IcingBottom, 0.11f);

            SceneKit.Mesh(group, Geo.Torus(ringRadius, DonutConfig.TubeRadius, DonutConfig.TubeSegments, DonutConfig.RingSegments), dough, true, true, "donut-dough")
                .At(0, DonutConfig.CenterHeight, 0);

            float IcingSpan(float u) => DonutConfig.FrostingSpan + Mathf.Sin(u * DonutConfig.FrostingWaves) * DonutConfig.FrostingWaveAmplitude;

            SceneKit.Mesh(group, IcingShellGeometry(ringRadius, DonutConfig.TubeRadius + DonutConfig.FrostingThickness, IcingSpan,
                    DonutConfig.RingSegments, DonutConfig.TubeSegments), icing, true, true, "donut-icing")
                .At(0, DonutConfig.CenterHeight, 0);

            AddDonutSprinkles(group, ringRadius, IcingSpan);
        }

        /// <summary>Granulados deitados na cobertura, com cor própria cada um.</summary>
        void AddDonutSprinkles(Transform group, float ringRadius, Func<float, float> icingSpan)
        {
            float surfaceRadius = DonutConfig.TubeRadius + DonutConfig.FrostingThickness + 0.05f;
            var palette = new List<int>(CircuitConfig.Pastels) { 0xffffff };
            MeshData geometry = Geo.RoundedBox(DonutConfig.SprinkleLength, DonutConfig.SprinkleThickness, DonutConfig.SprinkleThickness, 1,
                DonutConfig.SprinkleThickness * 0.45f);
            var batch = new Batch(Mats.Candy(0xffffff, 0.2f), "donut-sprinkles");

            for (int i = 0; i < DonutConfig.SprinkleCount; i++)
            {
                float u = random.Next() * Mathf.PI * 2;
                float v = (random.Next() * 2 - 1) * icingSpan(u) * 0.85f;
                float cosV = Mathf.Cos(v);
                float radial = ringRadius + surfaceRadius * cosV;
                var position = new Vector3(radial * Mathf.Cos(u), radial * Mathf.Sin(u), surfaceRadius * Mathf.Sin(v));
                Vector3 normal = new Vector3(cosV * Mathf.Cos(u), cosV * Mathf.Sin(u), Mathf.Sin(v)).normalized;
                Quaternion rotation = MathUtil.FromUnitVectors(Vector3.up, normal) *
                                      MathUtil.AxisAngle(Vector3.up, random.Next() * Mathf.PI * 2);
                float scale = 0.85f + random.Next() * 0.45f;
                int color = palette[Mathf.FloorToInt(random.Next() * palette.Count)];
                batch.Add(geometry, Matrix4x4.TRS(position, rotation, Vector3.one * scale), Hex.Linear(color));
            }
            Transform mesh = batch.Flush(group, false, false);
            mesh?.At(0, DonutConfig.CenterHeight, 0);
        }

        /// <summary>Balões de ar quente com cesta de cupcake, sorteados no mapa todo.</summary>
        void AddCupcakeBalloons(CircuitPath path)
        {
            path.Bounds(CircuitConfig.BalloonsSpread, out float minX, out float maxX, out float minZ, out float maxZ);
            for (int i = 0; i < QualityConfig.BalloonCount; i++)
            {
                float x = minX + random.Next() * (maxX - minX);
                float z = minZ + random.Next() * (maxZ - minZ);
                float scale = CircuitConfig.BalloonsMinScale + random.Next() * (CircuitConfig.BalloonsMaxScale - CircuitConfig.BalloonsMinScale);
                float baseY = path.TerrainHeight(x, z) + CircuitConfig.BalloonsMinHeight +
                              random.Next() * (CircuitConfig.BalloonsMaxHeight - CircuitConfig.BalloonsMinHeight);
                float phase = random.Next() * 6;
                var balloon = new GameObject("Cupcake balloon frames");
                balloon.transform.SetParent(Root, false);
                balloon.transform.localPosition = new Vector3(x, baseY + 4 * scale, z);
                balloon.transform.localScale = Vector3.one * (scale * 4);
                balloon.AddComponent<CandyBalloonSprite>().Phase = phase;
            }
        }

        /// <summary>Árvores de bala por amostragem com rejeição.</summary>
        void AddCandyTrees(CircuitPath path)
        {
            path.Bounds(CircuitConfig.TreesMaxDistance, out float minX, out float maxX, out float minZ, out float maxZ);
            CircuitConfig.TreeVariety[] varieties = CircuitConfig.TreeVarieties;
            var trunks = new List<Placement>();
            var tops = new List<Placement>[varieties.Length];
            for (int i = 0; i < varieties.Length; i++) tops[i] = new List<Placement>();

            int totalWeight = 0;
            foreach (var v in varieties) totalWeight += v.Weight;
            int PickVariety()
            {
                float ticket = random.Next() * totalWeight;
                for (int i = 0; i < varieties.Length; i++)
                {
                    ticket -= varieties[i].Weight;
                    if (ticket <= 0) return i;
                }
                return varieties.Length - 1;
            }

            int attempts = 0;
            while (trunks.Count < QualityConfig.TreeCount && attempts < QualityConfig.TreeCount * 40)
            {
                attempts++;
                float x = minX + random.Next() * (maxX - minX);
                float z = minZ + random.Next() * (maxZ - minZ);
                float distance = path.DistanceToCenterline(x, z);
                if (distance < CircuitConfig.TreesMinDistance) continue;
                if (distance > CircuitConfig.TreesMaxDistance) continue;

                int variety = PickVariety();
                float margin = varieties[variety].Size;
                if (inCastle(x, z, margin)) continue;
                if (inFactory(x, z, margin)) continue;

                float scale = 1 + (random.Next() - 0.5f) * 2 * CircuitConfig.TreeScaleVariation;
                float heading = random.Next() * Mathf.PI * 2;
                float ground = path.TerrainHeight(x, z);
                treeFootprints.Add(new Vector3(x, z, margin * scale));
                trunks.Add(new Placement { Position = new Vector3(x, ground + CircuitConfig.TrunkHeight * scale / 2, z), HeadingY = heading, Scale = scale });
                tops[variety].Add(new Placement { Position = new Vector3(x, ground + CircuitConfig.TrunkHeight * scale, z), HeadingY = heading, Scale = scale });
            }

            AddInstances(Geo.Cylinder(CircuitConfig.TrunkRadius, CircuitConfig.TrunkRadius * 1.3f, CircuitConfig.TrunkHeight, 8), trunks,
                new InstanceOptions { Color = CircuitConfig.TrunkColor, Roughness = 0.25f, Stripes = true, CastShadow = true, Name = "tree-trunk" });

            for (int i = 0; i < varieties.Length; i++) AddTreeTop(varieties[i], tops[i]);
        }

        void AddTreeTop(CircuitConfig.TreeVariety variety, List<Placement> placements)
        {
            if (placements.Count == 0) return;
            float size = variety.Size;

            if (variety.Kind == "algodao")
            {
                MeshData geometry = Geo.Sphere(size, 14, 11).Scale(1, 1.12f, 1).Translate(0, size * 1.05f, 0);
                AddInstances(geometry, placements, new InstanceOptions
                {
                    Color = variety.Color, CastShadow = true, Name = "tree-algodao",
                    Material = Mats.Cotton(new Mats.CottonOptions
                    {
                        Base = variety.Color, Swirl = 0xffffff, Rim = 0xd8f4ff,
                        PuffMeters = 1.6f, FiberMeters = 0.3f, Relief = 0.12f, Fuzz = 0.8f, RimStrength = 0.45f,
                    }),
                });
                return;
            }

            if (variety.Kind == "pirulito")
            {
                MeshData geometry = Geo.Cylinder(size, size, size * 0.26f, 22).RotateX(Mathf.PI / 2).Translate(0, size * 0.95f, 0);
                var o = Mats.Opt(0.14f);
                o.Map = ProceduralTextures.Swirl(new[] { "#ff3f92", "#ffffff" });
                o.DoubleSided = true;
                o.Emissive = 0xffd6e8;
                o.EmissiveIntensity = 0.1f;
                AddInstances(geometry, placements, new InstanceOptions
                {
                    Color = 0xffffff, CastShadow = true, Name = "tree-pirulito", Material = Mats.Standard(0xffffff, o),
                });
                return;
            }

            if (variety.Kind == "cupcake")
            {
                AddInstances(Geo.Cylinder(size * 0.62f, size * 0.46f, size * 0.8f, 14).Translate(0, size * 0.4f, 0), placements,
                    new InstanceOptions { Color = 0xfff0e2, Roughness = 0.4f, CastShadow = true });
                AddInstances(Geo.Sphere(size * 0.72f, 14, 10).Scale(1, 1.05f, 1).Translate(0, size * 1.05f, 0), placements,
                    new InstanceOptions { Color = variety.Color, Roughness = 0.2f, Emissive = 0.12f, CastShadow = true, Name = "tree-cupcake" });
                return;
            }

            // Sorvete: casquinha e uma bola por cima.
            AddInstances(Geo.Cone(size * 0.55f, size * 0.95f, 14).RotateZ(Mathf.PI).Translate(0, size * 0.48f, 0), placements,
                new InstanceOptions { Color = 0xffc98a, Roughness = 0.45f, CastShadow = true });
            AddInstances(Geo.Sphere(size * 0.72f, 14, 11).Translate(0, size * 1.18f, 0), placements,
                new InstanceOptions { Color = variety.Color, Roughness = 0.18f, Emissive = 0.12f, CastShadow = true, Name = "tree-sorvete" });
        }

        /// <summary>Colinas de gumdrop: meias esferas pastel no horizonte.</summary>
        void AddGumdropHills(CircuitPath path)
        {
            int[] pastels = CircuitConfig.Pastels;
            path.Bounds(CircuitConfig.HillsMaxDistance, out float minX, out float maxX, out float minZ, out float maxZ);
            var byColor = new List<Placement>[pastels.Length];
            for (int i = 0; i < pastels.Length; i++) byColor[i] = new List<Placement>();

            int attempts = 0, placed = 0;
            while (placed < QualityConfig.HillCount && attempts < QualityConfig.HillCount * 40)
            {
                attempts++;
                float x = minX + random.Next() * (maxX - minX);
                float z = minZ + random.Next() * (maxZ - minZ);
                float distance = path.DistanceToCenterline(x, z);
                if (distance < CircuitConfig.HillsMinDistance) continue;
                if (distance > CircuitConfig.HillsMaxDistance) continue;
                float radius = CircuitConfig.HillsMinRadius + random.Next() * (CircuitConfig.HillsMaxRadius - CircuitConfig.HillsMinRadius);
                if (inCastle(x, z, radius)) continue;
                if (inFactory(x, z, radius)) continue;
                byColor[Mathf.FloorToInt(random.Next() * pastels.Length)].Add(new Placement
                {
                    Position = new Vector3(x, path.TerrainHeight(x, z) - radius * 0.25f, z),
                    HeadingY = random.Next() * Mathf.PI * 2,
                    Scale = radius,
                });
                placed++;
            }

            MeshData geometry = Geo.Sphere(1, 14, 10);
            for (int i = 0; i < pastels.Length; i++)
                AddInstances(geometry, byColor[i], new InstanceOptions { Color = pastels[i], Roughness = 0.14f, Emissive = 0.05f, Name = "hill" });
        }

        /// <summary>Nuvens de marshmallow, bem alto e bem longe, sem luz.</summary>
        void AddClouds(CircuitPath path)
        {
            path.Bounds(0, out float minX, out float maxX, out float minZ, out float maxZ);
            float centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
            var puffs = new List<Placement>();

            for (int i = 0; i < QualityConfig.CloudCount; i++)
            {
                float angle = random.Next() * Mathf.PI * 2;
                float radius = CircuitConfig.CloudsSpread * (0.35f + random.Next() * 0.65f);
                float x = centerX + Mathf.Cos(angle) * radius;
                float z = centerZ + Mathf.Sin(angle) * radius;
                float y = CircuitConfig.CloudsMinHeight + random.Next() * (CircuitConfig.CloudsMaxHeight - CircuitConfig.CloudsMinHeight);
                float size = CircuitConfig.CloudsMinRadius + random.Next() * (CircuitConfig.CloudsMaxRadius - CircuitConfig.CloudsMinRadius);
                for (int p = 0; p < 3; p++)
                {
                    puffs.Add(new Placement
                    {
                        Position = new Vector3(x + (p - 1) * size * 0.85f, y + (p == 1 ? size * 0.3f : 0), z + (random.Next() - 0.5f) * size * 0.5f),
                        HeadingY = 0,
                        Scale = size * (p == 1 ? 1 : 0.78f),
                    });
                }
            }
            AddInstances(Geo.Sphere(1, 12, 8), puffs, new InstanceOptions { Color = CircuitConfig.CloudsColor, Unlit = true, Name = "cloud" });
        }

        // A separate seed keeps the existing landmarks and horizon unchanged.
        void AddSweetGarden(CircuitPath path)
        {
            var rng = new SeededRandom(CircuitConfig.RandomSeed + 90210);
            int[] palette = CircuitConfig.GardenPalette;
            var occupied = new List<Vector3>(treeFootprints); // x, z, footprint radius
            var buildings = new List<Bounds>();
            foreach (Transform child in Root)
            {
                if (child.name != "grandstand" && child.name != "sweet-shop" && child.name != "donut-tunnel") continue;
                foreach (Renderer renderer in child.GetComponentsInChildren<Renderer>()) buildings.Add(renderer.bounds);
            }
            path.Bounds(74, out float minX, out float maxX, out float minZ, out float maxZ);

            bool Clear(float x, float z, float radius)
            {
                if (x - radius < minX || x + radius > maxX || z - radius < minZ || z + radius > maxZ) return false;
                PathSample nearest = path.Samples[path.NearestSampleIndex(x, z)];
                float clearance = Mathf.Max(TrackConfig.RunoffWidth, TrackConfig.BarrierOffsetFromEdge) + 3;
                if (path.DistanceToCenterline(x, z) < nearest.HalfWidth + clearance + radius) return false;
                if (inCastle(x, z, radius) || inFactory(x, z, radius)) return false;
                Vector3 worldPoint = Root.TransformPoint(new Vector3(x, path.TerrainHeight(x, z), z));
                float worldRadius = radius * Mathf.Max(Mathf.Abs(Root.lossyScale.x), Mathf.Abs(Root.lossyScale.z));
                foreach (Bounds bounds in buildings)
                    if (worldPoint.x > bounds.min.x - worldRadius && worldPoint.x < bounds.max.x + worldRadius &&
                        worldPoint.z > bounds.min.z - worldRadius && worldPoint.z < bounds.max.z + worldRadius) return false;
                foreach (Vector3 other in occupied)
                    if (MathUtil.Hypot(x - other.x, z - other.y) < radius + other.z + 1) return false;
                return true;
            }

            List<Placement>[] Scatter(int count, float radius, bool reserve)
            {
                var buckets = new List<Placement>[palette.Length];
                for (int i = 0; i < buckets.Length; i++) buckets[i] = new List<Placement>();
                int placed = 0;
                for (int attempt = 0; attempt < count * 60 && placed < count; attempt++)
                {
                    float x = Mathf.Lerp(minX, maxX, rng.Next()), z = Mathf.Lerp(minZ, maxZ, rng.Next());
                    float scale = 0.8f + rng.Next() * 0.55f;
                    if (!Clear(x, z, radius * scale)) continue;
                    buckets[placed % palette.Length].Add(new Placement
                    {
                        Position = new Vector3(x, path.TerrainHeight(x, z), z),
                        HeadingY = rng.Next() * Mathf.PI * 2, Scale = scale,
                    });
                    if (reserve) occupied.Add(new Vector3(x, z, radius * scale));
                    placed++;
                }
                return buckets;
            }

            void Draw(MeshData mesh, List<Placement> points, int color, string name, bool shadows = true)
            {
                AddInstances(mesh, points, new InstanceOptions { Color = color, Roughness = 0.4f, CastShadow = shadows, Name = name });
            }

            // Tall ribbon banners repeat on both sides of the course.
            var flags = new List<Placement>[palette.Length];
            for (int i = 0; i < flags.Length; i++) flags[i] = new List<Placement>();
            int flagIndex = 0;
            PlaceAlong(path, Mathf.Max(12, CircuitConfig.GardenFlagSpacing), (sample, index) =>
            {
                foreach (int side in new[] { -1, 1 })
                {
                    Vector3 p = sample.Position + sample.Left * side * (sample.HalfWidth + 14);
                    if (!Clear(p.x, p.z, 3.5f)) continue;
                    p.y = path.TerrainHeight(p.x, p.z);
                    flags[flagIndex++ % palette.Length].Add(new Placement { Position = p, HeadingY = CircuitPath.HeadingOf(sample), Scale = 1 });
                    occupied.Add(new Vector3(p.x, p.z, 3.5f));
                }
            });
            MeshData banner = GardenBanner();
            for (int i = 0; i < palette.Length; i++)
            {
                Draw(Geo.Cylinder(0.12f, 0.17f, 8, 8).Translate(0, 4, 0), flags[i], 0xfff2d3, "garden-flag-poles");
                Draw(Geo.Sphere(0.3f, 8, 6).Translate(0, 8.15f, 0), flags[i], 0xffd563, "garden-flag-finials");
                Draw(banner, flags[i], palette[i], "garden-ribbon-flags");
                Draw(Geo.Torus(0.55f, 0.13f, 6, 14).Translate(1.55f, 5.85f, 0.4f), flags[i], 0xfff9eb, "garden-flag-emblems");
            }

            var trees = Scatter(Mathf.Max(0, CircuitConfig.GardenTreeCount), 3.6f, true);
            MeshData sprinkles = new MeshData();
            for (int s = 0; s < 14; s++)
            {
                float angle = s * 2.39996f, y = -0.7f + s / 13f * 2.9f;
                float ring = Mathf.Sqrt(Mathf.Max(0, 2.5f * 2.5f - y * y));
                sprinkles.Append(Geo.Sphere(0.16f, 6, 4).Scale(1, 1.8f, 1).RotateZ(angle)
                    .Translate(Mathf.Cos(angle) * ring, 5.5f + y, Mathf.Sin(angle) * ring));
            }
            for (int i = 0; i < palette.Length; i++)
            {
                Draw(Geo.Cylinder(0.3f, 0.46f, 3.6f, 9).Translate(0, 1.8f, 0), trees[i], 0xc88d61, "garden-tree-trunks");
                Draw(Geo.Sphere(2.5f, 14, 10).Translate(0, 5.5f, 0), trees[i], palette[i], "garden-candy-canopies");
                Draw(sprinkles, trees[i], 0xfff1ce, "garden-tree-sprinkles", false);
                Draw(Geo.Sphere(1.4f, 10, 6).Scale(1, 0.24f, 1).Translate(0, 0.1f, 0), trees[i], 0x80c887, "garden-tree-beds", false);
            }

            var sweets = Scatter(Mathf.Max(0, CircuitConfig.GardenCandyCount), 2.1f, true);
            MeshData wrapperEnds = new MeshData();
            foreach (int side in new[] { -1, 1 })
                wrapperEnds.Append(Geo.Cone(0.6f, 0.85f, 8).RotateZ(side * Mathf.PI / 2).Translate(side * 1.45f, 0.75f, 0));
            for (int i = 0; i < palette.Length; i++)
            {
                var wrapped = new List<Placement>();
                var drops = new List<Placement>();
                for (int j = 0; j < sweets[i].Count; j++) (j % 2 == 0 ? wrapped : drops).Add(sweets[i][j]);
                Draw(Geo.Sphere(0.8f, 12, 8).Scale(1.4f, 0.85f, 0.85f).Translate(0, 0.75f, 0), wrapped, palette[i], "garden-wrapped-candies");
                Draw(wrapperEnds, wrapped, palette[(i + 2) % palette.Length], "garden-candy-wrappers");
                Draw(Geo.Torus(0.69f, 0.1f, 6, 12).RotateY(Mathf.PI / 2).Translate(0, 0.75f, 0), wrapped, 0xfff6df, "garden-candy-stripes", false);
                Draw(Geo.Sphere(1, 12, 8).Scale(1, 1.2f, 1).Translate(0, 0.4f, 0), drops, palette[i], "garden-gumdrops");
            }

            var flowers = Scatter(Mathf.Max(0, CircuitConfig.GardenFlowerCount), 0.9f, false);
            var petals = new MeshData();
            var leaves = new MeshData();
            for (int j = 0; j < 5; j++)
            {
                float a = j * Mathf.PI * 2 / 5;
                petals.Append(Geo.Sphere(0.3f, 7, 5).Scale(1, 0.45f, 1)
                    .Translate(Mathf.Cos(a) * 0.34f, 0.45f, Mathf.Sin(a) * 0.34f));
            }
            for (int j = 0; j < 3; j++)
                leaves.Append(Geo.Sphere(0.45f, 6, 4).Scale(0.35f, 1, 0.4f).RotateZ((j - 1) * 0.65f).Translate((j - 1) * 0.25f, 0.3f, 0));
            for (int i = 0; i < palette.Length; i++)
            {
                Draw(petals, flowers[i], i % 2 == 0 ? 0xfff9e8 : palette[i], "garden-daisy-petals", false);
                Draw(Geo.Sphere(0.21f, 7, 5).Scale(1, 0.6f, 1).Translate(0, 0.5f, 0), flowers[i], 0xffd052, "garden-daisy-centers", false);
                Draw(leaves, flowers[i], 0x69b876, "garden-grass-tufts", false);
            }
        }

        static MeshData GardenBanner()
        {
            var mesh = new MeshData();
            const int segments = 10;
            for (int i = 0; i <= segments; i++)
            {
                float t = i / (float)segments;
                float wave = Mathf.Sin(t * Mathf.PI * 2) * 0.3f;
                float slope = Mathf.Cos(t * Mathf.PI * 2) * 0.3f * Mathf.PI * 2 / 3;
                Vector3 normal = new Vector3(-slope, 0, 1).normalized;
                mesh.Add(new Vector3(t * 3, 7.5f - t * 0.25f, wave), normal, new Vector2(t, 1));
                mesh.Add(new Vector3(t * 3, 4.4f + (t > 0.7f ? (t - 0.7f) * 2 : 0), wave), normal, new Vector2(t, 0));
            }
            for (int i = 0; i < segments; i++)
            {
                int a = i * 2;
                mesh.Tri(a, a + 1, a + 2); mesh.Tri(a + 2, a + 1, a + 3);
            }
            // Real back faces keep the cloth lit correctly from either side.
            int frontVertices = mesh.VertexCount, frontIndices = mesh.Indices.Count;
            for (int i = 0; i < frontVertices; i++) mesh.Add(mesh.Vertices[i], -mesh.Normals[i], mesh.Uvs[i]);
            for (int i = 0; i < frontIndices; i += 3)
                mesh.Tri(mesh.Indices[i] + frontVertices, mesh.Indices[i + 2] + frontVertices, mesh.Indices[i + 1] + frontVertices);
            return mesh;
        }

        void AddInstances(MeshData geometry, List<Placement> placements, InstanceOptions options)
        {
            if (placements.Count == 0) return;
            Mat material = options.Material;
            if (material == null)
            {
                if (options.Unlit) material = Mats.Unlit(options.Color);
                else
                {
                    var o = Mats.Opt(options.Roughness == 0 ? 0.4f : options.Roughness);
                    if (options.Emissive > 0)
                    {
                        o.Emissive = options.Color;
                        o.EmissiveIntensity = options.Emissive;
                    }
                    if (options.Stripes) o.Map = stripeTexture;
                    material = Mats.Standard(options.Color, o);
                }
            }

            var batch = new Batch(material, options.Name ?? "instances");
            foreach (Placement p in placements) batch.Add(geometry, p.Position, p.HeadingY, p.Scale);
            batch.Flush(Root, options.CastShadow, true);
        }

        // ------------------------------------------------------ utilidades ---

        static void PlaceAlong(CircuitPath path, float spacing, Action<PathSample, int> visit)
        {
            float nextDistance = 0;
            for (int i = 0; i < path.Count; i++)
            {
                PathSample sample = path.Samples[i];
                if (sample.Distance < nextDistance) continue;
                nextDistance = sample.Distance + spacing;
                visit(sample, i);
            }
        }

        static Placement PlacementAt(CircuitPath path, int index, float lateral, float along, float height, float scale)
        {
            PathSample sample = path.Samples[index];
            Vector3 position = sample.Position + sample.Left * lateral + sample.Tangent * along;
            position.y = path.SurfaceHeight(index, lateral) + height;
            return new Placement { Position = position, HeadingY = CircuitPath.HeadingOf(sample), Scale = scale };
        }

        /// <summary>Sinal do X LOCAL que aponta para LONGE da pista — medido, nunca escrito.</summary>
        static float AwaySignFor(CircuitPath path, Vector3 baseP, float heading)
        {
            PathSample sample = path.Samples[path.NearestSampleIndex(baseP.x, baseP.z)];
            float awayX = baseP.x - sample.Position.x, awayZ = baseP.z - sample.Position.z;
            float axisX = Mathf.Cos(heading), axisZ = -Mathf.Sin(heading);
            return axisX * awayX + axisZ * awayZ >= 0 ? 1 : -1;
        }

        /// <summary>Maior afastamento em que a PEGADA inteira fica livre do traçado; -1 se nenhum.</summary>
        static float ClearOffsetFor(CircuitPath path, int index, int side, float length, float depth, float requested, float minimum)
        {
            PathSample sample = path.Samples[index];
            float heading = CircuitPath.HeadingOf(sample);
            float cosine = Mathf.Cos(heading), sine = Mathf.Sin(heading);
            for (float offset = requested; offset >= minimum; offset -= 1)
            {
                float lateral = side * (sample.HalfWidth + offset);
                Vector3 baseP = sample.Position + sample.Left * lateral;
                float away = AwaySignFor(path, baseP, heading);
                bool clear = true;
                for (int a = 0; a <= 4 && clear; a++)
                {
                    float localZ = (a / 4f - 0.5f) * length;
                    for (int b = 0; b <= 2 && clear; b++)
                    {
                        float localX = away * (b / 2f) * depth;
                        float x = baseP.x + localX * cosine + localZ * sine;
                        float z = baseP.z - localX * sine + localZ * cosine;
                        PathSample nearest = path.Samples[path.NearestSampleIndex(x, z)];
                        if (path.DistanceToCenterline(x, z) < nearest.HalfWidth + 6) clear = false;
                    }
                }
                if (clear) return offset;
            }
            return -1;
        }

        /// <summary>Altura do terreno sob a PEGADA inteira: apoia no mais alto, saia até o mais baixo.</summary>
        static void GroundUnder(CircuitPath path, Vector3 baseP, float heading, float length, float depth, float awaySign,
            out float min, out float max)
        {
            float cosine = Mathf.Cos(heading), sine = Mathf.Sin(heading);
            min = float.MaxValue;
            max = float.MinValue;
            for (int a = 0; a <= 8; a++)
            {
                float localZ = (a / 8f - 0.5f) * length;
                for (int b = 0; b <= 3; b++)
                {
                    float localX = awaySign * (b / 3f) * depth;
                    float h = path.TerrainHeight(baseP.x + localX * cosine + localZ * sine, baseP.z - localX * sine + localZ * cosine);
                    min = Mathf.Min(min, h);
                    max = Mathf.Max(max, h);
                }
            }
        }

        /// <summary>Casca de cobertura sobre o toro, recortada na volta da SEÇÃO (borda escorrida).</summary>
        static MeshData IcingShellGeometry(float ringRadius, float tubeRadius, Func<float, float> span, int ringSegments, int tubeSegments)
        {
            var g = new MeshData();
            for (int i = 0; i <= ringSegments; i++)
            {
                float u = (float)i / ringSegments * Mathf.PI * 2;
                float limit = span(u);
                float cosU = Mathf.Cos(u), sinU = Mathf.Sin(u);
                for (int j = 0; j <= tubeSegments; j++)
                {
                    float v = ((float)j / tubeSegments - 0.5f) * 2 * limit;
                    float cosV = Mathf.Cos(v), sinV = Mathf.Sin(v);
                    float radial = ringRadius + tubeRadius * cosV;
                    g.Add(new Vector3(radial * cosU, radial * sinU, tubeRadius * sinV), new Vector3(cosV * cosU, cosV * sinU, sinV),
                        new Vector2((float)i / ringSegments, (float)j / tubeSegments));
                }
            }
            int stride = tubeSegments + 1;
            for (int i = 0; i < ringSegments; i++)
            {
                for (int j = 0; j < tubeSegments; j++)
                {
                    int a = i * stride + j, b = a + stride;
                    g.Tri(a, b, a + 1);
                    g.Tri(b, b + 1, a + 1);
                }
            }
            return g;
        }
    }
}
