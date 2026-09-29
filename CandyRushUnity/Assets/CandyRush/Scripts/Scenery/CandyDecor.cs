using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Placas de direção, bandeiras de largada e nuvens voadoras com arco-íris
    /// (track/candySigns.ts).
    /// </summary>
    public sealed class CandySigns
    {
        readonly SeededRandom random = new SeededRandom(CircuitConfig.RandomSeed + 5150);
        readonly Texture2D stripe = ProceduralTextures.Stripe("#ff5c96", "#ffffff");
        readonly Texture2D swirl = ProceduralTextures.Swirl(new[] { "#ff3f92", "#ffffff" });
        readonly Texture2D checker = ProceduralTextures.Checker(CandySignsConfig.StartFlagsSquares);
        readonly Transform root;

        public CandySigns(CircuitPath path, Transform world)
        {
            root = SceneKit.Node("candy-signs", world);
            foreach (CandySignsConfig.Signpost spec in CandySignsConfig.Signposts) AddSignpost(path, spec);
            AddStartFlags(path);
            AddFlyingClouds(path);
        }

        void AddSignpost(CircuitPath path, CandySignsConfig.Signpost spec)
        {
            int index = path.IndexAtFraction(spec.At);
            PathSample sample = path.Samples[index];
            float lateral = spec.Side * (sample.HalfWidth + spec.OffsetFromEdge);
            Transform group = SceneKit.Node("signpost", root);

            Mat post = Mats.Candy(0xffffff, 0.2f, 0, stripe);
            var lollipopOptions = Mats.Opt(0.12f);
            lollipopOptions.Map = swirl;
            lollipopOptions.DoubleSided = true;
            lollipopOptions.Emissive = 0xffd6e8;
            lollipopOptions.EmissiveIntensity = 0.12f;
            Mat lollipop = Mats.Standard(0xffffff, lollipopOptions);

            SceneKit.Mesh(group, Geo.Cylinder(CandySignsConfig.PostRadius, CandySignsConfig.PostRadius * 1.15f, CandySignsConfig.PostHeight, 14), post, true)
                .At(0, CandySignsConfig.PostHeight / 2, 0);
            SceneKit.Mesh(group, Geo.Cylinder(CandySignsConfig.TopRadius, CandySignsConfig.TopRadius, 0.2f, 20), lollipop, true)
                .At(0, CandySignsConfig.PostHeight + CandySignsConfig.TopRadius * 0.7f, 0).Rot(Mathf.PI / 2, 0, 0);

            foreach (CandySignsConfig.Board board in CandySignsConfig.Boards)
            {
                Mat material = Mats.Candy(board.Color, 0.16f, 0.1f);
                SceneKit.Mesh(group, Geo.RoundedBox(CandySignsConfig.BoardWidth, CandySignsConfig.BoardHeight, CandySignsConfig.BoardDepth, 1, 0.08f), material, true)
                    .At(board.Dir * CandySignsConfig.BoardWidth * 0.45f, board.Y, 0);
                SceneKit.Mesh(group, Geo.Cone(CandySignsConfig.BoardHeight * 0.75f, 0.62f, 3), material, true)
                    .At(board.Dir * CandySignsConfig.BoardWidth * 0.95f, board.Y, 0).Rot(0, 0, board.Dir > 0 ? -Mathf.PI / 2 : Mathf.PI / 2);
                SceneKit.Mesh(group, Geo.Sphere(CandySignsConfig.BoardHeight * 0.26f, 10, 8), Mats.Candy(board.Icon, 0.15f, 0.25f))
                    .At(board.Dir * CandySignsConfig.BoardWidth * 0.45f, board.Y, -CandySignsConfig.BoardDepth).Scl(1, 1, 0.5f);
            }

            AddGumdropBase(group, 1.1f);
            Vector3 point = path.PointAt(index, lateral, 0);
            point.y -= 0.12f;
            group.At(point).RotY(CircuitPath.HeadingOf(sample));
        }

        void AddStartFlags(CircuitPath path)
        {
            Mat pole = Mats.Candy(0xffffff, 0.18f, 0, stripe);
            Mat flag = Mats.Candy(0xffffff, 0.4f, 0, checker, true);
            Mat star = Mats.Candy(CandySignsConfig.StartFlagsStarColor, 0.18f, 0.3f);

            foreach (float at in CandySignsConfig.StartFlagsAt)
            {
                int index = path.IndexAtFraction(at);
                PathSample sample = path.Samples[index];
                foreach (int side in new[] { 1, -1 })
                {
                    Transform group = SceneKit.Node("start-flag", root);
                    SceneKit.Mesh(group, Geo.Cylinder(CandySignsConfig.StartFlagsPoleRadius, CandySignsConfig.StartFlagsPoleRadius, CandySignsConfig.StartFlagsPoleHeight, 12), pole, true)
                        .At(0, CandySignsConfig.StartFlagsPoleHeight / 2, 0);
                    SceneKit.Mesh(group, Geo.Plane(CandySignsConfig.StartFlagsWidth, CandySignsConfig.StartFlagsHeight), flag, true)
                        .At(side * CandySignsConfig.StartFlagsWidth * 0.5f, CandySignsConfig.StartFlagsPoleHeight - CandySignsConfig.StartFlagsHeight * 0.65f, 0)
                        .RotY(Mathf.PI);
                    SceneKit.Mesh(group, Geo.Sphere(CandySignsConfig.StartFlagsStarRadius, 12, 9), star, true)
                        .At(0, CandySignsConfig.StartFlagsPoleHeight + CandySignsConfig.StartFlagsStarRadius * 0.6f, 0);
                    AddGumdropBase(group, 0.9f);

                    float lateral = side * (sample.HalfWidth + CandySignsConfig.StartFlagsOffsetFromEdge);
                    Vector3 point = path.PointAt(index, lateral, 0);
                    point.y -= 0.1f;
                    group.At(point).RotY(CircuitPath.HeadingOf(sample));
                }
            }
        }

        void AddGumdropBase(Transform group, float radius)
        {
            int[] pastels = CircuitConfig.Pastels;
            for (int i = 0; i < 5; i++)
            {
                float angle = i / 5f * Mathf.PI * 2 + random.Next();
                float size = 0.26f + random.Next() * 0.2f;
                int color = pastels[i % pastels.Length];
                SceneKit.Mesh(group, Geo.Sphere(size, 10, 8), Mats.Candy(color, 0.15f, 0.1f), true)
                    .At(Mathf.Cos(angle) * radius, size * 0.55f, Mathf.Sin(angle) * radius).Scl(1, 0.8f, 1);
            }
        }

        void AddFlyingClouds(CircuitPath path)
        {
            path.Bounds(0, out float minX, out float maxX, out float minZ, out float maxZ);
            Mat body = Mats.Candy(CandySignsConfig.FlyingBody, 0.55f, 0.14f);
            Mat ink = Mats.Candy(CandySignsConfig.FlyingInk, 0.4f);
            Mat cheek = Mats.Candy(CandySignsConfig.FlyingCheek, 0.3f, 0.22f);
            var rainbow = new Mat[CandySignsConfig.Rainbow.Length];
            for (int b = 0; b < rainbow.Length; b++) rainbow[b] = Mats.Candy(CandySignsConfig.Rainbow[b], 0.25f, 0.22f);

            for (int i = 0; i < CandySignsConfig.FlyingCount; i++)
            {
                Transform group = SceneKit.Node("flying-cloud", root);
                float scale = CandySignsConfig.FlyingMinScale + random.Next() * (CandySignsConfig.FlyingMaxScale - CandySignsConfig.FlyingMinScale);

                (float x, float y, float r)[] puffs = { (0, 0, 1.0f), (-1.15f, -0.22f, 0.72f), (1.2f, -0.18f, 0.68f), (-0.2f, 0.62f, 0.62f) };
                foreach (var p in puffs) SceneKit.Mesh(group, Geo.Sphere(p.r, 14, 11), body).At(p.x, p.y, 0);

                const float faceZ = -0.95f;
                foreach (int side in new[] { 1, -1 })
                {
                    SceneKit.Mesh(group, Geo.Sphere(0.15f, 10, 8), ink).At(side * 0.34f, 0.12f, faceZ).Scl(1, 1, 0.4f);
                    SceneKit.Mesh(group, Geo.Sphere(0.12f, 10, 8), cheek).At(side * 0.62f, -0.12f, faceZ * 0.95f).Scl(1, 1, 0.35f);
                }
                SceneKit.Mesh(group, Geo.Torus(0.17f, 0.05f, 6, 14, Mathf.PI), ink).At(0, -0.18f, faceZ).Rot(0, 0, Mathf.PI);

                for (int band = 0; band < rainbow.Length; band++)
                {
                    SceneKit.Mesh(group, Geo.Torus(2.6f - band * (CandySignsConfig.RainbowTube * 1.05f), CandySignsConfig.RainbowTube, 6, 26, Mathf.PI * 0.9f), rainbow[band])
                        .At(1.1f, -0.5f, 0.35f).Rot(0, 0, -0.55f);
                }

                group.localScale = Vector3.one * scale;
                float px = minX - CandySignsConfig.FlyingSpread + random.Next() * (maxX - minX + CandySignsConfig.FlyingSpread * 2);
                float py = CandySignsConfig.FlyingMinHeight + random.Next() * (CandySignsConfig.FlyingMaxHeight - CandySignsConfig.FlyingMinHeight);
                float pz = minZ - CandySignsConfig.FlyingSpread + random.Next() * (maxZ - minZ + CandySignsConfig.FlyingSpread * 2);
                group.At(px, py, pz).RotY((random.Next() - 0.5f) * 0.8f);
            }
        }
    }

    /// <summary>
    /// Os doces espalhados: pirulitos, bengalas, cupcakes, gumdrops e tufos de
    /// grama (track/candyProps.ts). Cada PEÇA de doce é uma malha fundida, para
    /// o pirulito manter o palito branco e o cupcake a cobertura.
    /// </summary>
    public sealed class CandyProps
    {
        struct Spot
        {
            public float X, Z, Ground, Heading, Scale;
        }

        readonly SeededRandom random = new SeededRandom(CircuitConfig.RandomSeed + 404);
        readonly Transform root;

        public CandyProps(CircuitPath path, Transform world)
        {
            root = SceneKit.Node("candy-props", world);
            List<Spot> spots = Scatter(path, QualityConfig.CandyPropCount);
            Texture2D stripes = ProceduralTextures.Stripe("#ff5c96", "#ffffff");
            Texture2D swirl = ProceduralTextures.Swirl();

            var buckets = new Dictionary<string, List<Spot>>
            {
                ["lollipop"] = new List<Spot>(), ["cane"] = new List<Spot>(), ["cupcake"] = new List<Spot>(),
                ["gumdrop"] = new List<Spot>(), ["tuft"] = new List<Spot>(),
            };
            string[] mix = { "gumdrop", "gumdrop", "gumdrop", "lollipop", "cupcake", "cupcake", "cane", "gumdrop" };
            for (int i = 0; i < spots.Count; i++) buckets[mix[i % mix.Length]].Add(spots[i]);

            AddLollipops(buckets["lollipop"], swirl);
            AddCandyCanes(buckets["cane"], stripes);
            AddCupcakes(buckets["cupcake"]);
            AddGumdrops(buckets["gumdrop"]);
            AddGrassTufts(buckets["tuft"]);
        }

        List<Spot> Scatter(CircuitPath path, int count)
        {
            path.Bounds(70, out float minX, out float maxX, out float minZ, out float maxZ);
            Func<float, float, float, bool> inCastle = CandyCastle.Footprint(path);
            Func<float, float, float, bool> inFactory = CandyFactory.Footprint(path);
            var spots = new List<Spot>();
            int attempts = 0;
            while (spots.Count < count && attempts < count * 60)
            {
                attempts++;
                float x = minX + random.Next() * (maxX - minX);
                float z = minZ + random.Next() * (maxZ - minZ);
                float distance = path.DistanceToCenterline(x, z);
                if (distance < 13 || distance > 62) continue;
                if (inCastle(x, z, 1.5f)) continue;
                if (inFactory(x, z, 1.5f)) continue;
                spots.Add(new Spot
                {
                    X = x, Z = z, Ground = path.TerrainHeight(x, z),
                    Heading = random.Next() * Mathf.PI * 2,
                    Scale = 0.8f + random.Next() * 0.6f,
                });
            }
            return spots;
        }

        void AddLollipops(List<Spot> spots, Texture2D swirl)
        {
            AddPart(Geo.Cylinder(0.055f, 0.055f, 1.7f, 8), spots, s => (s.Ground + 0.85f * s.Scale, s.Scale), 0xffffff, 0.35f);
            AddPart(Geo.Cylinder(0.62f, 0.62f, 0.16f, 22).RotateX(Mathf.PI / 2), spots, s => (s.Ground + 1.85f * s.Scale, s.Scale), 0xffffff, 0.12f, swirl, 0.1f);
        }

        void AddCandyCanes(List<Spot> spots, Texture2D stripes)
        {
            AddPart(Geo.Cylinder(0.11f, 0.11f, 1.5f, 10), spots, s => (s.Ground + 0.75f * s.Scale, s.Scale), 0xffffff, 0.15f, stripes);
            AddPart(Geo.Torus(0.3f, 0.11f, 8, 14, Mathf.PI), spots, s => (s.Ground + 1.5f * s.Scale, s.Scale), 0xffffff, 0.15f, stripes);
        }

        void AddCupcakes(List<Spot> spots)
        {
            AddPart(Geo.Cylinder(0.42f, 0.3f, 0.5f, 16), spots, s => (s.Ground + 0.25f * s.Scale, s.Scale), 0xffcf8a, 0.22f, null, 0.06f);
            AddPart(Geo.Sphere(0.46f, 16, 12).Scale(1, 0.85f, 1), spots, s => (s.Ground + 0.72f * s.Scale, s.Scale), 0xfff0f6, 0.16f, null, 0.08f);
            AddPart(Geo.Sphere(0.13f, 10, 8), spots, s => (s.Ground + 1.1f * s.Scale, s.Scale), 0xf0518f, 0.15f, null, 0.15f);
        }

        void AddGumdrops(List<Spot> spots)
        {
            int[] pastels = CircuitConfig.Pastels;
            var byColor = new List<Spot>[pastels.Length];
            for (int i = 0; i < pastels.Length; i++) byColor[i] = new List<Spot>();

            foreach (Spot spot in spots)
            {
                // Um grupinho de duas ou três balas: uma esfera sozinha parece um erro.
                int cluster = 2 + Mathf.FloorToInt(random.Next() * 2);
                for (int i = 0; i < cluster; i++)
                {
                    float angle = random.Next() * Mathf.PI * 2;
                    float distance = random.Next() * 0.9f * spot.Scale;
                    int color = Mathf.FloorToInt(random.Next() * pastels.Length);
                    float heading = random.Next() * Mathf.PI * 2;
                    float scale = spot.Scale * (0.28f + random.Next() * 0.3f);
                    byColor[color].Add(new Spot
                    {
                        X = spot.X + Mathf.Cos(angle) * distance,
                        Z = spot.Z + Mathf.Sin(angle) * distance,
                        Ground = spot.Ground,
                        Heading = heading,
                        Scale = scale,
                    });
                }
            }

            MeshData geometry = Geo.Sphere(1, 9, 7);
            for (int i = 0; i < pastels.Length; i++)
                AddPart(geometry, byColor[i], s => (s.Ground + s.Scale * 0.72f, s.Scale), pastels[i], 0.14f, null, 0.08f);
        }

        void AddGrassTufts(List<Spot> spots)
        {
            var blades = new List<Spot>();
            foreach (Spot spot in spots)
            {
                for (int i = 0; i < 3; i++)
                {
                    float angle = i / 3f * Mathf.PI * 2 + spot.Heading;
                    blades.Add(new Spot
                    {
                        X = spot.X + Mathf.Cos(angle) * 0.18f * spot.Scale,
                        Z = spot.Z + Mathf.Sin(angle) * 0.18f * spot.Scale,
                        Ground = spot.Ground,
                        Heading = spot.Heading,
                        Scale = spot.Scale * (0.7f + random.Next() * 0.5f),
                    });
                }
            }
            AddPart(Geo.Cone(0.11f, 0.5f, 5), blades, s => (s.Ground + 0.25f * s.Scale, s.Scale), 0x8fdb6a, 0.28f, null, 0.06f);
        }

        void AddPart(MeshData geometry, List<Spot> spots, Func<Spot, (float y, float scale)> place, int color, float roughness,
            Texture2D map = null, float emissive = 0)
        {
            if (spots.Count == 0) return;
            var batch = new Batch(Mats.Candy(color, roughness, emissive, map), "candy-prop");
            foreach (Spot spot in spots)
            {
                var (y, scale) = place(spot);
                batch.Add(geometry, new Vector3(spot.X, y, spot.Z), spot.Heading, scale);
            }
            batch.Flush(root, true, true);
        }
    }
}
