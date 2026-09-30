using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Pirulitos pendulares numa parte da pista (track/candyObstacles.ts).
    /// Colisão é uma esfera móvel; o resto do jogo usa a física normal do kart.
    /// </summary>
    public sealed class CandyObstacles
    {
        sealed class Hazard
        {
            public Transform Bob, String;
            public Vector3 Base, Left, Tangent;
            public float PivotY, RopeLength, MaxAngle, Phase, Speed, Radius;
            public Vector3 Center, Velocity;
            public float PreviousX;
        }

        readonly List<Hazard> hazards = new List<Hazard>();
        float time;

        public CandyObstacles(CircuitPath path, Transform world)
        {
            Transform root = SceneKit.Node("candy-obstacles", world);
            (float at, float phase, float maxAngle)[] specs =
            {
                (0.285f, 0, 0.58f), (0.305f, Mathf.PI * 0.72f, 0.66f), (0.325f, Mathf.PI * 1.38f, 0.6f),
            };
            for (int i = 0; i < specs.Length; i++)
            {
                int index = path.IndexAtFraction(specs[i].at);
                hazards.Add(CreatePendulum(path, root, path.Samples[index], index, specs[i].phase, specs[i].maxAngle, i));
            }
            Update(0);
        }

        public void Update(float dt)
        {
            time += dt;
            foreach (Hazard h in hazards) UpdateHazard(h, dt);
        }

        public void Collide(Kart kart)
        {
            RigidBody body = kart.Body;
            Vector3 kartPosition = body.ChassisPosition;
            foreach (Hazard hazard in hazards)
            {
                Vector3 delta = kartPosition - hazard.Center;
                delta.y *= 0.35f;
                float contactRadius = hazard.Radius + TrackConfig.BarrierKartRadius;
                float distance = delta.magnitude;
                if (distance >= contactRadius) continue;

                Vector3 normal = distance > 1e-4f ? delta / distance : hazard.Left;
                normal.y = MathUtil.Clamp(normal.y, -0.25f, 0.25f);
                normal.Normalize();

                float penetration = contactRadius - distance;
                body.Position += normal * (penetration * 0.9f);

                float obstacleSpeed = Vector3.Dot(hazard.Velocity, normal);
                float kartSpeed = Vector3.Dot(body.Velocity, normal);
                float closingSpeed = Mathf.Max(0, obstacleSpeed - kartSpeed);
                float push = 4.5f + closingSpeed * 1.1f;

                body.Velocity *= 0.82f;
                body.Velocity += normal * push;
                Vector3 av = body.AngularVelocity;
                av.y += (normal.x * body.Velocity.z - normal.z * body.Velocity.x) * 0.035f;
                body.AngularVelocity = av;
            }
        }

        Hazard CreatePendulum(CircuitPath path, Transform root, PathSample sample, int index, float phase, float maxAngle, int variant)
        {
            float halfSpan = sample.HalfWidth + 3.0f;
            float baseHeight = path.SurfaceHeight(index, 0);
            float heading = Mathf.Atan2(sample.Tangent.x, sample.Tangent.z);

            var postOptions = Mats.Opt(0.16f);
            postOptions.Map = ProceduralTextures.Stripe("#ff5c96", "#fff2f7");
            postOptions.Repeat = new Vector2(1.35f, 3.8f);
            Mat whiteStripe = Mats.Standard(0xffffff, postOptions);
            var caneOptions = Mats.Opt(0.16f);
            caneOptions.Map = ProceduralTextures.Stripe("#ff5c96", "#fff2f7");
            caneOptions.Repeat = new Vector2(1.0f, 4.6f);
            caneOptions.Emissive = 0xffffff;
            caneOptions.EmissiveIntensity = 0.04f;
            Mat caneMaterial = Mats.Standard(0xffffff, caneOptions);
            var swirlOptions = Mats.Opt(0.12f);
            swirlOptions.Map = ProceduralTextures.Swirl(new[] { "#ff3f92", "#fff0f7" });
            swirlOptions.Emissive = 0xffd6e8;
            swirlOptions.EmissiveIntensity = 0.1f;
            Mat swirlMaterial = Mats.Standard(0xffffff, swirlOptions);
            Mat pink = Mats.Candy(0xff4f9a, 0.12f, 0.06f);
            Mat softPink = Mats.Candy(0xff9fc4, 0.18f, 0.03f);
            Mat yellow = Mats.Candy(0xffc24d, 0.18f, 0.04f);

            Transform group = SceneKit.Node("pendulum", root);
            Transform Shadowed(Transform parent, MeshData g, Mat m) => SceneKit.Mesh(parent, g, m, true, true, "pendulum-part");

            foreach (float x in new[] { -halfSpan, halfSpan })
            {
                Shadowed(group, Geo.Cylinder(0.42f, 0.42f, 7.0f, 18), whiteStripe).At(x, 3.5f, 0);
                Shadowed(group, Geo.RoundedBox(1.7f, 0.74f, 1.7f, 1, 0.28f), yellow).At(x, 0.35f, 0);
                Shadowed(group, Geo.Cylinder(0.6f, 0.6f, 0.72f, 18), softPink).At(x, 6.98f, 0);
            }
            Shadowed(group, Geo.RoundedBox(halfSpan * 2 + 1.4f, 0.58f, 0.82f, 1, 0.3f), pink).At(0, 6.95f, 0);
            foreach (float x in new[] { -halfSpan + 0.35f, halfSpan - 0.35f, 0 })
                Shadowed(group, Geo.Cylinder(0.54f, 0.54f, 0.8f, 18), yellow).At(x, 6.95f, 0).Rot(0, 0, Mathf.PI / 2);

            Transform stringMesh = Shadowed(group, Geo.Cylinder(0.16f, 0.16f, 1, 14), caneMaterial);

            Transform bob = SceneKit.Node("bob", group);
            float discRadius = 1.8f + (variant % 2) * 0.12f;
            const float discThickness = 0.56f;
            Shadowed(bob, Geo.Cylinder(discRadius, discRadius, discThickness, 40), softPink).Rot(Mathf.PI / 2, 0, 0);
            Shadowed(bob, Geo.Torus(discRadius + 0.02f, 0.13f, 8, 40), pink).At(0, 0, discThickness * 0.51f);
            Shadowed(bob, Geo.Torus(discRadius + 0.02f, 0.13f, 8, 40), pink).At(0, 0, -discThickness * 0.51f);
            Shadowed(bob, Geo.Cylinder(discRadius + 0.03f, discRadius + 0.03f, 0.22f, 40), softPink).Rot(Mathf.PI / 2, 0, 0);
            Shadowed(bob, Geo.Cylinder(discRadius * 0.92f, discRadius * 0.92f, 0.06f, 40), swirlMaterial).At(0, 0, discThickness * 0.56f).Rot(Mathf.PI / 2, 0, 0);
            Shadowed(bob, Geo.Cylinder(discRadius * 0.92f, discRadius * 0.92f, 0.06f, 40), swirlMaterial).At(0, 0, -discThickness * 0.56f).Rot(Mathf.PI / 2, 0, 0);

            int[] pastels = CircuitConfig.Pastels;
            var sprinkleMaterials = new Mat[pastels.Length];
            for (int i = 0; i < pastels.Length; i++) sprinkleMaterials[i] = Mats.Candy(pastels[i], 0.16f, 0.08f);
            for (int i = 0; i < 18; i++)
            {
                float angle = i / 18f * Mathf.PI * 2 + variant * 0.22f;
                float ring = i % 3 == 0 ? discRadius * 0.48f : discRadius * 0.78f;
                Shadowed(bob, Geo.RoundedBox(0.34f, 0.1f, 0.09f, 1, 0.04f), sprinkleMaterials[(i + variant) % sprinkleMaterials.Length])
                    .At(Mathf.Cos(angle) * ring, Mathf.Sin(angle) * ring, discThickness * 0.68f).Rot(0, 0, angle + Mathf.PI / 2);
            }

            Vector3 position = sample.Position;
            position.y = baseHeight;
            group.At(position).RotY(heading);

            return new Hazard
            {
                Bob = bob,
                String = stringMesh,
                Base = position,
                Left = sample.Left,
                Tangent = new Vector3(sample.Tangent.x, 0, sample.Tangent.z).normalized,
                PivotY = 6.88f,
                RopeLength = 4.8f,
                MaxAngle = maxAngle,
                Phase = phase,
                Speed = 1.35f + variant * 0.16f,
                Radius = discRadius,
            };
        }

        void UpdateHazard(Hazard hazard, float dt)
        {
            float angle = Mathf.Sin(time * hazard.Speed + hazard.Phase) * hazard.MaxAngle;
            float localX = Mathf.Sin(angle) * hazard.RopeLength;
            float localY = hazard.PivotY - Mathf.Cos(angle) * hazard.RopeLength;
            var pivot = new Vector3(0, hazard.PivotY, 0);
            var bobCenter = new Vector3(localX, localY, 0);

            hazard.Bob.localPosition = bobCenter;
            hazard.Bob.localRotation = MathUtil.AxisAngle(Vector3.forward, -angle * 0.45f);

            Vector3 stringDirection = bobCenter - pivot;
            float stringLength = stringDirection.magnitude;
            hazard.String.localPosition = (pivot + bobCenter) * 0.5f;
            hazard.String.localRotation = MathUtil.FromUnitVectors(Vector3.up, stringDirection.normalized);
            hazard.String.localScale = new Vector3(1, stringLength, 1);

            Vector3 center = hazard.Base + hazard.Left * localX;
            center.y += localY;
            hazard.Center = center;
            hazard.Velocity = dt > 0 ? hazard.Left * ((localX - hazard.PreviousX) / dt) : Vector3.zero;
            hazard.PreviousX = localX;
        }
    }

    /// <summary>
    /// Geleias fofas na última curva (track/jellyBlobs.ts): não empurram nem
    /// param ninguém, só AMORTECEM. Valem para humanos e rivais.
    /// </summary>
    public sealed class JellyBlobs
    {
        sealed class Jelly
        {
            public Transform Group;
            public Vector3 Center;
            public float Radius, Phase, Shake;
        }

        readonly List<Jelly> jellies = new List<Jelly>();
        float time;

        public JellyBlobs(CircuitPath path, Transform world)
        {
            Transform root = SceneKit.Node("jelly-blobs", world);
            for (int i = 0; i < JellyConfig.Spots.Length; i++) jellies.Add(CreateJelly(path, root, JellyConfig.Spots[i], i));
        }

        /// <summary>Só balanço, puro visual.</summary>
        public void Update(float dt)
        {
            time += dt;
            foreach (Jelly jelly in jellies)
            {
                jelly.Shake = Mathf.Max(0, jelly.Shake - dt / JellyConfig.WobbleHitDecay);
                float amplitude = JellyConfig.WobbleAmplitude + JellyConfig.WobbleHitAmplitude * jelly.Shake;
                float swing = Mathf.Sin(time * JellyConfig.WobbleSpeed + jelly.Phase) * amplitude;
                // Esmaga e estica mantendo o volume.
                jelly.Group.localScale = new Vector3(1 - swing * 0.5f, 1 + swing, 1 - swing * 0.5f);
            }
        }

        public void Collide(Kart kart, float dt)
        {
            if (dt <= 0) return;
            RigidBody body = kart.Body;
            Vector3 kartPosition = body.ChassisPosition;
            foreach (Jelly jelly in jellies)
            {
                Vector3 delta = kartPosition - jelly.Center;
                delta.y *= 0.4f;
                float contact = jelly.Radius + 0.75f;
                float distance = delta.magnitude;
                if (distance >= contact) continue;

                jelly.Shake = 1;
                // Perda de velocidade POR SEGUNDO, convertida para este passo.
                body.Velocity *= Mathf.Pow(JellyConfig.SlowPerSecond, dt);
                Vector3 normal = distance > 1e-4f ? delta / distance : new Vector3(1, 0, 0);
                normal.y = 0;
                normal.Normalize();
                body.Velocity += normal * JellyConfig.Push;
            }
        }

        Jelly CreateJelly(CircuitPath path, Transform root, JellySpot spot, int seed)
        {
            int index = path.IndexAtFraction(spot.At);
            PathSample sample = path.Samples[index];
            int color = JellyConfig.Colors[spot.Color % JellyConfig.Colors.Length];
            Transform group = SceneKit.Node("jelly", root);

            Mat body = Mats.Candy(color, 0.1f, 0.18f);
            Mat ink = Mats.Candy(JellyConfig.Ink, 0.35f);
            Mat cheek = Mats.Candy(JellyConfig.Cheek, 0.3f, 0.2f);

            SceneKit.Mesh(group, Geo.Sphere(spot.Radius, 20, 14), body, true).At(0, spot.Radius * 0.72f, 0).Scl(1, 0.82f, 1);
            SceneKit.Mesh(group, Geo.Sphere(spot.Radius * 1.05f, 18, 8), body, true, false).At(0, spot.Radius * 0.26f, 0).Scl(1, 0.3f, 1);

            float faceZ = -spot.Radius * 0.82f;
            float s = spot.Radius;
            foreach (int side in new[] { 1, -1 })
            {
                SceneKit.Mesh(group, Geo.Sphere(JellyConfig.EyeRadius * s, 10, 8), ink).At(side * JellyConfig.EyeSpread * s, spot.Radius * 0.78f, faceZ).Scl(1, 1, 0.45f);
                SceneKit.Mesh(group, Geo.Sphere(JellyConfig.EyeRadius * s * 0.8f, 10, 8), cheek)
                    .At(side * JellyConfig.EyeSpread * s * 1.75f, spot.Radius * 0.6f, faceZ * 0.92f).Scl(1, 1, 0.35f);
            }
            SceneKit.Mesh(group, Geo.Torus(JellyConfig.MouthRadius * s, JellyConfig.MouthRadius * s * 0.3f, 6, 14, Mathf.PI), ink)
                .At(0, spot.Radius * 0.56f, faceZ).Rot(0, 0, Mathf.PI);

            Vector3 center = sample.Position + sample.Left * spot.Lateral;
            center.y = path.SurfaceHeight(index, spot.Lateral);
            group.At(center).RotY(Mathf.Atan2(sample.Tangent.x, sample.Tangent.z));

            return new Jelly
            {
                Group = group,
                Center = center + new Vector3(0, spot.Radius * 0.6f, 0),
                Radius = spot.Radius,
                Phase = seed * 1.7f,
            };
        }
    }

    /// <summary>
    /// Rampa de turbo colada na pista, logo depois do Túnel de Donut
    /// (track/speedRamp.ts). Dispara o MESMO boost do drift.
    /// </summary>
    public sealed class SpeedRamp
    {
        readonly CircuitPath path;
        readonly float centerDistance;
        readonly float totalLength;
        readonly Transform root;

        public SpeedRamp(CircuitPath path, Transform world)
        {
            this.path = path;
            root = SceneKit.Node("speed-ramp", world);
            totalLength = path.TotalLength;
            int centerIndex = path.IndexAtFraction(SpeedRampConfig.At);
            centerDistance = path.Samples[centerIndex].Distance;
            float spacing = path.TotalLength / path.Count;
            int halfSpan = Mathf.Max(1, Mathf.RoundToInt(SpeedRampConfig.Length / 2 / spacing));

            BuildDecal(centerIndex, halfSpan);
            BuildArrows(centerIndex, halfSpan);
            BuildPosts(centerIndex, halfSpan);
        }

        void BuildDecal(int centerIndex, int halfSpan)
        {
            float left = SpeedRampConfig.Lateral + SpeedRampConfig.HalfWidth;
            float right = SpeedRampConfig.Lateral - SpeedRampConfig.HalfWidth;
            const float rail = 0.42f;

            var padOptions = Mats.Opt(0.2f);
            padOptions.DoubleSided = true;
            padOptions.Emissive = SpeedRampConfig.PadLight;
            padOptions.EmissiveIntensity = 0.08f;
            padOptions.OffsetFactor = -4;
            padOptions.OffsetUnits = -4;
            Mat pad = Mats.Standard(SpeedRampConfig.PadLight, padOptions);

            var stripeOptions = Mats.Opt(0.18f);
            stripeOptions.DoubleSided = true;
            stripeOptions.Emissive = SpeedRampConfig.PadStripe;
            stripeOptions.EmissiveIntensity = 0.16f;
            stripeOptions.OffsetFactor = -5;
            stripeOptions.OffsetUnits = -5;
            Mat stripe = Mats.Standard(SpeedRampConfig.PadStripe, stripeOptions);

            SceneKit.Mesh(root, Ribbon(centerIndex, halfSpan, right + rail, left - rail, SpeedRampConfig.Height), pad, false, true, "ramp-pad");
            SceneKit.Mesh(root, Ribbon(centerIndex, halfSpan, left - rail, left, SpeedRampConfig.Height), stripe, false, true, "ramp-stripe");
            SceneKit.Mesh(root, Ribbon(centerIndex, halfSpan, right, right + rail, SpeedRampConfig.Height), stripe, false, true, "ramp-stripe");
        }

        /// <summary>Fita entre dois deslocamentos laterais seguindo as amostras.</summary>
        MeshData Ribbon(int centerIndex, int halfSpan, float innerLateral, float outerLateral, float height)
        {
            var g = new MeshData();
            int count = path.Count;
            for (int step = -halfSpan; step < halfSpan; step++)
            {
                int index = (centerIndex + step + count * 2) % count;
                int next = (index + 1) % count;
                Vector3 a = path.PointAt(index, outerLateral, height);
                Vector3 b = path.PointAt(index, innerLateral, height);
                Vector3 c = path.PointAt(next, outerLateral, height);
                Vector3 d = path.PointAt(next, innerLateral, height);
                int start = g.VertexCount;
                foreach (Vector3 v in new[] { a, b, d, a, d, c }) g.Add(v, Vector3.up, Vector2.zero);
                g.Tri(start, start + 1, start + 2);
                g.Tri(start + 3, start + 4, start + 5);
            }
            return g.ComputeNormals();
        }

        void BuildArrows(int centerIndex, int halfSpan)
        {
            int count = path.Count;
            Mat arrow = Mats.Candy(SpeedRampConfig.Arrow, 0.1f, 1.6f);
            for (int i = 0; i < SpeedRampConfig.Chevrons; i++)
            {
                int offset = Mathf.RoundToInt(-halfSpan + 2f * halfSpan * (i + 0.7f) / (SpeedRampConfig.Chevrons + 0.4f));
                int index = (centerIndex + offset + count * 2) % count;
                PathSample sample = path.Samples[index];
                float heading = Mathf.Atan2(sample.Tangent.x, sample.Tangent.z);
                foreach (int side in new[] { 1, -1 })
                {
                    Vector3 point = path.PointAt(index, SpeedRampConfig.Lateral + side * SpeedRampConfig.HalfWidth * 0.42f, SpeedRampConfig.ArrowHeight);
                    SceneKit.Mesh(root, Geo.RoundedBox(SpeedRampConfig.HalfWidth * 1.25f, 0.05f, 0.4f, 1, 0.05f), arrow, false, true, "ramp-arrow")
                        .At(point).RotY(heading + side * 0.62f);
                }
            }
        }

        void BuildPosts(int centerIndex, int halfSpan)
        {
            int count = path.Count;
            Mat post = Mats.Candy(SpeedRampConfig.Post, 0.22f);
            Mat postTop = Mats.Candy(SpeedRampConfig.PostTop, 0.16f, 0.15f);
            foreach (int step in new[] { -halfSpan, halfSpan })
            {
                int index = (centerIndex + step + count * 2) % count;
                float edge = path.Samples[index].HalfWidth + 0.9f;
                foreach (int side in new[] { 1, -1 })
                {
                    Vector3 p = path.PointAt(index, side * edge, 0);
                    SceneKit.Mesh(root, Geo.Cylinder(0.16f, 0.18f, 1.5f, 12), post, true).At(p.x, p.y + 0.75f, p.z);
                    SceneKit.Mesh(root, Geo.Sphere(0.3f, 12, 9), postTop, true).At(p.x, p.y + 1.62f, p.z);
                }
            }
        }

        /// <summary>Dispara o turbo se o kart estiver em cima do tapete.</summary>
        public void Collide(Kart kart)
        {
            Vector3 k = kart.Body.ChassisPosition;
            int index = path.NearestSampleIndex(k.x, k.z);
            float lateral = path.LateralOffset(index, k.x, k.z);
            if (Mathf.Abs(lateral - SpeedRampConfig.Lateral) > SpeedRampConfig.HalfWidth) return;

            float along = path.Samples[index].Distance - centerDistance;
            if (along > totalLength / 2) along -= totalLength;
            if (along < -totalLength / 2) along += totalLength;
            if (Mathf.Abs(along) > SpeedRampConfig.Length / 2) return;

            kart.Drift.TriggerBoost(SpeedRampConfig.BoostLevel);
        }
    }

    /// <summary>
    /// Moedas de bala em linha serpenteante (track/coins.ts). A coleta é regra
    /// de jogo: anda no passo fixo, e quem estiver mais perto leva.
    /// </summary>
    public sealed class Coins
    {
        sealed class Coin
        {
            public Vector3 Position;
            public float Phase;
            public float Cooldown;
            public Transform View;
        }

        readonly List<Coin> coins = new List<Coin>();
        float clock;
        public readonly List<int> CollectedByPlayer = new List<int>();
        public readonly List<bool> JustCollectedByPlayer = new List<bool>();
        readonly List<Vector3> kartPositions = new List<Vector3>();

        public Coins(CircuitPath path, Transform world)
        {
            Transform root = SceneKit.Node("coins", world);
            float nextDistance = 0;
            int index = 0;
            for (int i = 0; i < path.Count; i++)
            {
                PathSample sample = path.Samples[i];
                if (sample.Distance < nextDistance) continue;
                nextDistance = sample.Distance + CoinConfig.Spacing;
                float weave = Mathf.Sin(index / CoinConfig.WeaveLength * Mathf.PI * 2);
                float lateral = weave * sample.HalfWidth * CoinConfig.LateralFraction;
                coins.Add(new Coin { Position = path.PointAt(i, lateral, CoinConfig.Height), Phase = index * 0.7f });
                index++;
            }

            // Cilindro deitado em X: a moeda fica de pé, com a face para quem chega.
            Mesh mesh = Geo.Cylinder(CoinConfig.Radius, CoinConfig.Radius, CoinConfig.Thickness, 48).RotateX(Mathf.PI / 2).ToMesh("coin");
            var o = Mats.Opt(0.25f);
            o.Metalness = 0.55f;
            o.Emissive = CoinConfig.Emissive;
            o.EmissiveIntensity = CoinConfig.EmissiveIntensity * .35f;
            Mat material = Mats.Standard(CoinConfig.Color, o);
            Mesh rimMesh = Geo.Torus(CoinConfig.Radius * .86f, CoinConfig.Radius * .055f, 8, 48).ToMesh("coin-rim");
            var rimOptions = Mats.Opt(.2f);
            rimOptions.Metalness = .65f;
            Mat rimMaterial = Mats.Standard(0xffdb78, rimOptions);
            foreach (Coin coin in coins)
            {
                coin.View = SceneKit.Mesh(root, mesh, material, false, true, "coin").At(coin.Position);
                for (int side = -1; side <= 1; side += 2)
                    SceneKit.Mesh(coin.View, rimMesh, rimMaterial, false, true, "raised-rim")
                        .At(0, 0, side * CoinConfig.Thickness * .5f);
            }
        }

        public void Update(float dt, IList<Kart> karts)
        {
            clock += dt;
            while (CollectedByPlayer.Count < karts.Count) CollectedByPlayer.Add(0);
            while (JustCollectedByPlayer.Count < karts.Count) JustCollectedByPlayer.Add(false);
            kartPositions.Clear();
            for (int p = 0; p < karts.Count; p++)
            {
                JustCollectedByPlayer[p] = false;
                kartPositions.Add(karts[p].Body.ChassisPosition);
            }

            float radiusSquared = CoinConfig.PickupRadius * CoinConfig.PickupRadius;
            float spin = clock * CoinConfig.SpinSpeed * Mathf.PI * 2;

            foreach (Coin coin in coins)
            {
                if (coin.Cooldown > 0)
                {
                    coin.Cooldown -= dt;
                    if (coin.Cooldown > 0)
                    {
                        coin.View.gameObject.SetActive(false);
                        continue;
                    }
                }

                // Quem estiver mais perto leva: o empate é resolvido por distância.
                int taker = -1;
                float best = radiusSquared;
                for (int p = 0; p < kartPositions.Count; p++)
                {
                    float d = (coin.Position - kartPositions[p]).sqrMagnitude;
                    if (d < best)
                    {
                        best = d;
                        taker = p;
                    }
                }

                if (taker >= 0)
                {
                    coin.Cooldown = CoinConfig.RespawnSeconds;
                    CollectedByPlayer[taker]++;
                    JustCollectedByPlayer[taker] = true;
                    coin.View.gameObject.SetActive(false);
                    continue;
                }

                coin.View.gameObject.SetActive(true);
                Vector3 position = coin.Position;
                position.y += Mathf.Sin(clock * CoinConfig.BobSpeed + coin.Phase) * CoinConfig.BobAmplitude;
                coin.View.localPosition = position;
                coin.View.localRotation = MathUtil.AxisAngle(Vector3.up, spin + coin.Phase);
            }
        }

        public void Reset()
        {
            for (int i = 0; i < CollectedByPlayer.Count; i++) CollectedByPlayer[i] = 0;
            for (int i = 0; i < JustCollectedByPlayer.Count; i++) JustCollectedByPlayer[i] = false;
            foreach (Coin coin in coins) coin.Cooldown = 0;
        }
    }
}
