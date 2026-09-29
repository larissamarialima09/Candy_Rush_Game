using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>Um ponto amostrado do eixo da pista, com o referencial local pronto.</summary>
    public sealed class PathSample
    {
        /// <summary>Posição no eixo, já com a elevação em y.</summary>
        public Vector3 Position;
        /// <summary>Direção de corrida, unitária, incluindo a subida.</summary>
        public Vector3 Tangent;
        /// <summary>Perpendicular HORIZONTAL para a esquerda do sentido de corrida.</summary>
        public Vector3 Left;
        /// <summary>Normal da superfície, já com a inclinação da curva.</summary>
        public Vector3 Normal;
        /// <summary>Curvatura com sinal (1/m). Positiva = curva à esquerda.</summary>
        public float Curvature;
        /// <summary>Distância acumulada desde a largada.</summary>
        public float Distance;
        public float HalfWidth;
        /// <summary>Inclinação transversal, em radianos.</summary>
        public float Bank;
    }

    /// <summary>
    /// O eixo da pista (track/circuitPath.ts): amostrado uniformemente, fechado,
    /// com largura, elevação e inclinação. Uma única fonte de verdade para
    /// malha, física, cenário, checkpoints e barreiras — e também o índice
    /// espacial que a física consulta 240 vezes por segundo.
    /// </summary>
    public sealed class CircuitPath
    {
        const float GridCell = 12f;

        public readonly PathSample[] Samples;
        public readonly float TotalLength;
        readonly Dictionary<int, List<int>> grid = new Dictionary<int, List<int>>();

        public int Count => Samples.Length;

        public CircuitPath(Vector2[] points, int sampleCount, int curvatureWindow = 1)
        {
            var controls = new List<Vector3>();
            foreach (Vector2 p in points) controls.Add(new Vector3(p.x, 0, p.y));
            var curve = new CatmullRomCurve3(controls, true);

            // Reparametrizado por comprimento de arco: pontos igualmente espaçados.
            List<Vector3> positions = curve.GetSpacedPoints(sampleCount);
            positions.RemoveAt(positions.Count - 1);
            int count = positions.Count;

            // --- Distâncias no plano ---
            var distances = new float[count];
            float planarLength = 0;
            for (int i = 0; i < count; i++)
            {
                distances[i] = planarLength;
                planarLength += Vector3.Distance(positions[i], positions[(i + 1) % count]);
            }
            TotalLength = planarLength;

            // --- Elevação, normalizada para o ponto mais baixo ficar em y = 0 ---
            float lowest = float.MaxValue;
            for (int i = 0; i < count; i++)
            {
                float elevation = SampleProfile(TrackConfig.ElevationProfile, distances[i] / planarLength);
                positions[i] = new Vector3(positions[i].x, elevation, positions[i].z);
                lowest = Mathf.Min(lowest, elevation);
            }
            for (int i = 0; i < count; i++) positions[i] -= new Vector3(0, lowest, 0);

            // --- Referencial local ---
            var tangents = new Vector3[count];
            var lefts = new Vector3[count];
            var halfWidths = new float[count];
            for (int i = 0; i < count; i++)
            {
                Vector3 next = positions[(i + 1) % count];
                Vector3 previous = positions[(i - 1 + count) % count];
                Vector3 tangent = (next - previous).normalized;
                Vector3 flat = new Vector3(tangent.x, 0, tangent.z).normalized;
                tangents[i] = tangent;
                lefts[i] = Vector3.Cross(Vector3.up, flat).normalized;
                // O perfil de largura existe no config, mas o original fixa 5,4 m.
                halfWidths[i] = 5.4f;
            }

            // --- Curvatura no plano, com janela ---
            var curvatures = new float[count];
            int window = Mathf.Max(1, curvatureWindow);
            for (int i = 0; i < count; i++)
            {
                Vector3 before = tangents[(i - window + count * 2) % count];
                Vector3 after = tangents[(i + window) % count];
                Vector3 beforePos = positions[(i - window + count * 2) % count];
                Vector3 afterPos = positions[(i + window) % count];
                float arc = Vector3.Distance(beforePos, afterPos);

                Vector3 flatBefore = new Vector3(before.x, 0, before.z).normalized;
                Vector3 flatAfter = new Vector3(after.x, 0, after.z).normalized;
                float dot = MathUtil.Clamp(Vector3.Dot(flatBefore, flatAfter), -1, 1);
                float angle = Mathf.Acos(dot);
                float sign = MathUtil.Sign(Vector3.Cross(flatBefore, flatAfter).y);
                curvatures[i] = arc > 1e-6f ? angle * sign / arc : 0;
            }

            // --- Inclinação: derivada da curvatura e alisada ---
            var rawBank = new float[count];
            for (int i = 0; i < count; i++)
            {
                float degrees = MathUtil.Clamp(curvatures[i] * TrackConfig.BankingDegreesPerCurvature,
                    -TrackConfig.BankingMaxDegrees, TrackConfig.BankingMaxDegrees);
                rawBank[i] = MathUtil.DegToRad(degrees);
            }
            float[] bank = SmoothCyclic(rawBank, TrackConfig.BankingSmoothingSamples);

            Samples = new PathSample[count];
            for (int i = 0; i < count; i++)
            {
                Vector3 lateralDir = (lefts[i] + Vector3.up * -Mathf.Tan(bank[i])).normalized;
                Vector3 normal = Vector3.Cross(tangents[i], lateralDir).normalized;
                Samples[i] = new PathSample
                {
                    Position = positions[i],
                    Tangent = tangents[i],
                    Left = lefts[i],
                    Normal = normal,
                    Curvature = curvatures[i],
                    Distance = distances[i],
                    HalfWidth = halfWidths[i],
                    Bank = bank[i],
                };
            }

            for (int i = 0; i < Samples.Length; i++)
            {
                int key = CellKey(Samples[i].Position.x, Samples[i].Position.z);
                if (!grid.TryGetValue(key, out var bucket)) grid[key] = bucket = new List<int>();
                bucket.Add(i);
            }
        }

        /// <summary>Índice da amostra mais próxima: nove células vizinhas, varredura só se longe de tudo.</summary>
        public int NearestSampleIndex(float x, float z)
        {
            int cx = Mathf.FloorToInt(x / GridCell);
            int cz = Mathf.FloorToInt(z / GridCell);
            int best = -1;
            float bestDistance = float.MaxValue;

            for (int ox = -1; ox <= 1; ox++)
            {
                for (int oz = -1; oz <= 1; oz++)
                {
                    if (!grid.TryGetValue(HashCell(cx + ox, cz + oz), out var bucket)) continue;
                    foreach (int index in bucket)
                    {
                        Vector3 p = Samples[index].Position;
                        float dx = p.x - x, dz = p.z - z;
                        float squared = dx * dx + dz * dz;
                        if (squared < bestDistance)
                        {
                            bestDistance = squared;
                            best = index;
                        }
                    }
                }
            }
            if (best >= 0) return best;

            for (int i = 0; i < Samples.Length; i++)
            {
                Vector3 p = Samples[i].Position;
                float dx = p.x - x, dz = p.z - z;
                float squared = dx * dx + dz * dz;
                if (squared < bestDistance)
                {
                    bestDistance = squared;
                    best = i;
                }
            }
            return best < 0 ? 0 : best;
        }

        /// <summary>Deslocamento lateral: positivo para a esquerda da pista.</summary>
        public float LateralOffset(int index, float x, float z)
        {
            PathSample s = Samples[index];
            return (x - s.Position.x) * s.Left.x + (z - s.Position.z) * s.Left.z;
        }

        /// <summary>
        /// A ÚNICA função de altura do jogo: física, terreno e cenário chamam esta.
        /// A inclinação para na borda do asfalto e a elevação some com a distância.
        /// </summary>
        public float SurfaceHeight(int index, float lateral)
        {
            PathSample s = Samples[index];
            float paved = MathUtil.Clamp(lateral, -s.HalfWidth, s.HalfWidth);
            float height = s.Position.y - paved * Mathf.Tan(s.Bank);
            float absolute = Mathf.Abs(lateral);
            if (absolute <= TrackConfig.TerrainFadeStart) return height;
            if (absolute >= TrackConfig.TerrainFadeEnd) return 0;
            float k = (absolute - TrackConfig.TerrainFadeStart) / (TrackConfig.TerrainFadeEnd - TrackConfig.TerrainFadeStart);
            return height * (1 - k * k * (3 - 2 * k));
        }

        public float TerrainHeight(float x, float z)
        {
            int index = NearestSampleIndex(x, z);
            return SurfaceHeight(index, LateralOffset(index, x, z));
        }

        public SurfaceKind SurfaceAt(int index, float lateral)
        {
            PathSample s = Samples[index];
            float absolute = Mathf.Abs(lateral);
            if (absolute <= s.HalfWidth) return SurfaceKind.Asfalto;
            if (absolute <= s.HalfWidth + CircuitConfig.KerbWidth) return SurfaceKind.Zebra;
            if (absolute <= s.HalfWidth + TrackConfig.RunoffWidth) return SurfaceKind.Areia;
            return SurfaceKind.Grama;
        }

        /// <summary>Ponto da superfície deslocado lateralmente, com a inclinação aplicada.</summary>
        public Vector3 PointAt(int index, float lateral, float heightOffset)
        {
            int i = ((index % Samples.Length) + Samples.Length) % Samples.Length;
            PathSample s = Samples[i];
            Vector3 p = s.Position + s.Left * lateral;
            p.y = SurfaceHeight(i, lateral) + heightOffset;
            return p;
        }

        public int IndexAtFraction(float fraction)
        {
            int count = Samples.Length;
            int index = Mathf.RoundToInt(fraction * count) % count;
            return index < 0 ? index + count : index;
        }

        public float DistanceToCenterline(float x, float z)
        {
            PathSample s = Samples[NearestSampleIndex(x, z)];
            return MathUtil.Hypot(s.Position.x - x, s.Position.z - z);
        }

        /// <summary>Rumo (rotação em Y) que alinha um objeto com a pista.</summary>
        public static float HeadingOf(PathSample s) => Mathf.Atan2(s.Tangent.x, s.Tangent.z);

        /// <summary>Caixa do traçado, com margem.</summary>
        public void Bounds(float margin, out float minX, out float maxX, out float minZ, out float maxZ)
        {
            minX = float.MaxValue; maxX = float.MinValue; minZ = float.MaxValue; maxZ = float.MinValue;
            foreach (PathSample s in Samples)
            {
                minX = Mathf.Min(minX, s.Position.x);
                maxX = Mathf.Max(maxX, s.Position.x);
                minZ = Mathf.Min(minZ, s.Position.z);
                maxZ = Mathf.Max(maxZ, s.Position.z);
            }
            minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
        }

        static float SampleProfile(ProfilePoint[] profile, float t)
        {
            int count = profile.Length;
            if (count == 0) return 0;
            if (count == 1) return profile[0].Value;
            float wrapped = ((t % 1) + 1) % 1;
            int previous = count - 1;
            for (int i = 0; i < count; i++)
            {
                if (profile[i].At <= wrapped) previous = i;
                else break;
            }
            int next = (previous + 1) % count;
            float from = profile[previous].At;
            float span = profile[next].At - from;
            if (span <= 0) span += 1;
            float local = wrapped - from;
            if (local < 0) local += 1;
            float k = MathUtil.Clamp(local / span, 0, 1);
            float smooth = k * k * (3 - 2 * k);
            return profile[previous].Value + (profile[next].Value - profile[previous].Value) * smooth;
        }

        static float[] SmoothCyclic(float[] values, int window)
        {
            int count = values.Length;
            int half = Mathf.Max(0, window / 2);
            if (half == 0) return values;
            var result = new float[count];
            for (int i = 0; i < count; i++)
            {
                float sum = 0;
                for (int o = -half; o <= half; o++) sum += values[(i + o + count * 2) % count];
                result[i] = sum / (half * 2 + 1);
            }
            return result;
        }

        static int CellKey(float x, float z) => HashCell(Mathf.FloorToInt(x / GridCell), Mathf.FloorToInt(z / GridCell));
        static int HashCell(int cx, int cz) => (cx + 4096) * 8192 + (cz + 4096);
    }

    /// <summary>
    /// A pista como superfície física (track/trackSurface.ts). O raio é
    /// intersectado com o plano tangente calculado a partir da spline, não com
    /// a malha: mais rápido e nunca falha numa aresta de triângulo.
    /// </summary>
    public sealed class TrackSurface : IGroundSampler
    {
        readonly CircuitPath path;
        public TrackSurface(CircuitPath path) { this.path = path; }

        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, out GroundHit hit)
        {
            hit = default;
            if (direction.y >= -1e-4f) return false;

            int index = path.NearestSampleIndex(origin.x, origin.z);
            float lateral = path.LateralOffset(index, origin.x, origin.z);
            var planePoint = new Vector3(origin.x, path.SurfaceHeight(index, lateral), origin.z);
            // A normal inclinada só vale sobre o asfalto; fora dele o terreno é plano.
            bool paved = Mathf.Abs(lateral) <= path.Samples[index].HalfWidth;
            Vector3 planeNormal = paved ? path.Samples[index].Normal : Vector3.up;

            float denominator = Vector3.Dot(direction, planeNormal);
            if (denominator >= -1e-6f) return false;
            float distance = Vector3.Dot(planePoint - origin, planeNormal) / denominator;
            if (distance < 0 || distance > maxDistance) return false;

            hit.Distance = distance;
            hit.Point = origin + direction * distance;
            hit.Normal = planeNormal;
            int contactIndex = path.NearestSampleIndex(hit.Point.x, hit.Point.z);
            hit.Surface = path.SurfaceAt(contactIndex, path.LateralOffset(contactIndex, hit.Point.x, hit.Point.z));
            return true;
        }
    }
}
