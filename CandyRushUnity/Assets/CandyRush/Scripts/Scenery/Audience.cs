using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// A plateia de bichinhos na arquibancada principal (track/audience.ts).
    /// Pulam mais alto quando o kart passa perto e rápido.
    /// </summary>
    public sealed class Audience
    {
        const int PerRow = 14;
        const float Spacing = 2.2f;
        const float Scale = 0.62f;
        const float IdleBob = 0.045f, CheerBob = 0.34f;
        const float IdleSpeed = 1.1f, CheerSpeed = 4.2f;
        const float ExciteRadius = 55f, ExciteRate = 2.5f;

        readonly List<Transform> critters = new List<Transform>();
        readonly List<Vector3> homes = new List<Vector3>();
        readonly List<float> phases = new List<float>();
        readonly float facing;
        float excitement, clock;

        public Audience(GrandstandAnchor anchor, Transform world)
        {
            Transform root = SceneKit.Node("audience", world);
            var random = new SeededRandom(CircuitConfig.RandomSeed + 77);
            int[] pastels = CircuitConfig.Pastels;
            float cosine = Mathf.Cos(anchor.Heading), sine = Mathf.Sin(anchor.Heading);
            facing = anchor.Heading - anchor.Side * (Mathf.PI / 2);

            Mesh geometry = BuildCritterGeometry().ToMesh("critter");
            var materials = new Mat[pastels.Length];
            for (int i = 0; i < pastels.Length; i++) materials[i] = Mats.Candy(pastels[i], 0.5f, 0.12f);

            // A ordem de criação por cor segue o original (instâncias agrupadas por cor).
            var byColor = new List<(Vector3 home, float phase)>[pastels.Length];
            for (int i = 0; i < pastels.Length; i++) byColor[i] = new List<(Vector3, float)>();

            for (int row = 0; row < CircuitConfig.GrandstandRows; row++)
            {
                float localX = anchor.Side * (row * CircuitConfig.GrandstandRowDepth + CircuitConfig.GrandstandRowDepth * 0.25f);
                float localY = CircuitConfig.GrandstandRowHeight * (row + 1);
                for (int seat = 0; seat < PerRow; seat++)
                {
                    float localZ = (seat - (PerRow - 1) / 2f) * Spacing;
                    var world2 = new Vector3(
                        anchor.Position.x + localX * cosine + localZ * sine,
                        anchor.Position.y + localY,
                        anchor.Position.z - localX * sine + localZ * cosine);
                    int color = Mathf.FloorToInt(random.Next() * pastels.Length);
                    byColor[color].Add((world2, random.Next() * Mathf.PI * 2));
                }
            }

            for (int c = 0; c < pastels.Length; c++)
            {
                foreach (var (home, phase) in byColor[c])
                {
                    critters.Add(SceneKit.Mesh(root, geometry, materials[c], false, false, "critter").At(home).Scl(Scale));
                    homes.Add(home);
                    phases.Add(phase);
                }
            }
        }

        /// <summary>Animação: roda no render, com deltaTime variável.</summary>
        public void Update(float dt, Vector3 kartPosition, float kartSpeed)
        {
            clock += dt;
            float target = 0;
            if (homes.Count > 0)
            {
                // Referência: o primeiro bichinho da primeira cor, como no original.
                Vector3 reference = homes[0];
                float distance = MathUtil.Hypot(reference.x - kartPosition.x, reference.z - kartPosition.z);
                float proximity = MathUtil.Clamp(1 - distance / ExciteRadius, 0, 1);
                float pace = MathUtil.Clamp(kartSpeed / 18f, 0, 1);
                target = proximity * (0.35f + pace * 0.65f);
            }
            excitement += (target - excitement) * Mathf.Min(1, ExciteRate * dt);

            float amplitude = IdleBob + (CheerBob - IdleBob) * excitement;
            float speed = IdleSpeed + (CheerSpeed - IdleSpeed) * excitement;
            float phaseClock = clock * speed * Mathf.PI * 2;

            for (int i = 0; i < critters.Count; i++)
            {
                float bounce = Mathf.Abs(Mathf.Sin(phaseClock * 0.5f + phases[i]));
                Vector3 position = homes[i];
                position.y += bounce * amplitude;
                critters[i].localPosition = position;
                critters[i].localRotation = MathUtil.AxisAngle(Vector3.up, facing + Mathf.Sin(phaseClock * 0.25f + phases[i]) * 0.25f);
            }
        }

        /// <summary>Corpo, cabeça e duas orelhas numa geometria só.</summary>
        static MeshData BuildCritterGeometry()
        {
            var merged = new MeshData();
            merged.Append(Geo.Sphere(0.5f, 10, 8).Scale(1, 0.9f, 0.9f).Translate(0, 0.45f, 0));
            merged.Append(Geo.Sphere(0.36f, 10, 8).Translate(0, 1.05f, 0.04f));
            MeshData earLeft = Geo.Capsule(0.1f, 0.34f, 2, 6).Translate(-0.16f, 1.5f, -0.02f);
            MeshData earRight = earLeft.Clone().Translate(0.32f, 0, 0);
            merged.Append(earLeft);
            merged.Append(earRight);
            return merged.ComputeNormals();
        }
    }
}
