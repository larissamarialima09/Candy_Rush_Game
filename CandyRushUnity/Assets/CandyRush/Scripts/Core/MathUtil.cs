using System;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Utilitários de matemática portados de `core/mathUtils.ts`.
    ///
    /// Convenção importante do port: TODA a lógica do jogo roda no referencial
    /// do three.js (destro, +Y para cima, rumo 0 = +Z). O mundo inteiro é
    /// pendurado num nó com escala (-1, 1, 1) — ver <see cref="ThreeSpace"/> —
    /// e é esse espelho que faz o resultado aparecer na tela exatamente como no
    /// navegador. Assim nenhuma conta de física, pista ou cenário precisou mudar
    /// de sinal.
    /// </summary>
    public static class MathUtil
    {
        public const float PI = Mathf.PI;

        public static float Clamp(float value, float min, float max) =>
            value < min ? min : value > max ? max : value;

        public static float Lerp(float a, float b, float t) => a + (b - a) * t;

        /// <summary>Move `current` na direção de `target` no máximo `maxDelta`.</summary>
        public static float MoveTowards(float current, float target, float maxDelta)
        {
            float diff = target - current;
            if (Mathf.Abs(diff) <= maxDelta) return target;
            return current + Mathf.Sign(diff) * maxDelta;
        }

        public static float DegToRad(float degrees) => degrees * Mathf.PI / 180f;
        public static float RadToDeg(float radians) => radians * 180f / Mathf.PI;

        /// <summary>Math.sign do JavaScript: 0 continua 0 (o Mathf.Sign do Unity devolve 1).</summary>
        public static float Sign(float v) => v > 0 ? 1f : v < 0 ? -1f : 0f;

        /// <summary>Quaternion de um eixo e ângulo em RADIANOS (o Unity usa graus).</summary>
        public static Quaternion AxisAngle(Vector3 axis, float radians) =>
            Quaternion.AngleAxis(radians * Mathf.Rad2Deg, axis);

        /// <summary>
        /// Euler na ordem XYZ do three.js (q = qx * qy * qz), em radianos.
        /// O `Quaternion.Euler` do Unity usa outra ordem (ZXY) e daria peças tortas.
        /// </summary>
        public static Quaternion EulerXYZ(float x, float y, float z) =>
            AxisAngle(Vector3.right, x) * AxisAngle(Vector3.up, y) * AxisAngle(Vector3.forward, z);

        /// <summary>Matriz de posição, rotação XYZ (radianos) e escala — o `at()` do castelo.</summary>
        public static Matrix4x4 At(float x, float y, float z, float rx = 0, float ry = 0, float rz = 0,
            float sx = 1, float sy = float.NaN, float sz = float.NaN)
        {
            if (float.IsNaN(sy)) sy = sx;
            if (float.IsNaN(sz)) sz = sx;
            return Matrix4x4.TRS(new Vector3(x, y, z), EulerXYZ(rx, ry, rz), new Vector3(sx, sy, sz));
        }

        public static float Hypot(float a, float b) => Mathf.Sqrt(a * a + b * b);

        /// <summary>Equivalente ao `Quaternion.setFromUnitVectors` do three.</summary>
        public static Quaternion FromUnitVectors(Vector3 from, Vector3 to)
        {
            float r = Vector3.Dot(from, to) + 1f;
            Quaternion q;
            if (r < 1e-6f)
            {
                r = 0;
                if (Mathf.Abs(from.x) > Mathf.Abs(from.z)) q = new Quaternion(-from.y, from.x, 0, r);
                else q = new Quaternion(0, -from.z, from.y, r);
            }
            else
            {
                q = new Quaternion(
                    from.y * to.z - from.z * to.y,
                    from.z * to.x - from.x * to.z,
                    from.x * to.y - from.y * to.x,
                    r);
            }
            float len = Mathf.Sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
            return new Quaternion(q.x / len, q.y / len, q.z / len, q.w / len);
        }
    }

    /// <summary>
    /// Gerador pseudoaleatório com semente (mulberry32), bit a bit igual ao do
    /// original. O cenário precisa sair idêntico a cada execução — e idêntico ao
    /// da versão web, já que as mesmas sementes são usadas.
    /// </summary>
    public sealed class SeededRandom
    {
        private uint state;

        public SeededRandom(int seed) { state = unchecked((uint)seed); }

        public float Next()
        {
            unchecked
            {
                state += 0x6d2b79f5;
                uint t = (state ^ (state >> 15)) * (1u | state);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                double value = (t ^ (t >> 14)) / 4294967296.0;
                // Em float, valores colados em 1 arredondariam para 1 e fariam
                // `Floor(random * n)` estourar o índice.
                float result = (float)value;
                return result >= 1f ? 0.99999994f : result;
            }
        }
    }

    /// <summary>Cores em hexadecimal, como no config original.</summary>
    public static class Hex
    {
        /// <summary>Cor sRGB (o Unity converte para linear ao entregar ao shader).</summary>
        public static Color C(int hex, float alpha = 1f) =>
            new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, alpha);

        /// <summary>Cor já em espaço linear — para cores de vértice, que o Unity não converte.</summary>
        public static Color Linear(int hex) => C(hex).linear;

        public static Color Css(string css)
        {
            if (ColorUtility.TryParseHtmlString(css, out Color color)) return color;
            return Color.magenta;
        }
    }

    /// <summary>
    /// A ponte entre o referencial do three.js (onde a lógica toda vive) e o do
    /// Unity (canhoto). A conversão é um espelho em X.
    /// </summary>
    public static class ThreeSpace
    {
        public static Vector3 ToUnity(Vector3 v) => new Vector3(-v.x, v.y, v.z);
        public static Vector3 FromUnity(Vector3 v) => new Vector3(-v.x, v.y, v.z);
    }
}
