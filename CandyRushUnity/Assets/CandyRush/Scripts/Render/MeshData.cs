using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CandyRush
{
    /// <summary>
    /// Geometria em memória, no referencial e no enrolamento do three.js.
    ///
    /// Faz o papel do `BufferGeometry`: os geradores de <see cref="Geo"/>
    /// preenchem isto, as peças do cenário transformam e fundem, e no fim
    /// <see cref="ToMesh"/> entrega um `Mesh` do Unity. Como o mundo inteiro fica
    /// sob um nó espelhado (escala -1 em X), o enrolamento anti-horário do three
    /// continua sendo a face da frente — o Unity inverte o culling sozinho para
    /// objetos com escala negativa.
    /// </summary>
    public sealed class MeshData
    {
        public readonly List<Vector3> Vertices = new List<Vector3>();
        public readonly List<Vector3> Normals = new List<Vector3>();
        public readonly List<Vector2> Uvs = new List<Vector2>();
        public List<Color> Colors;
        public readonly List<int> Indices = new List<int>();

        public int VertexCount => Vertices.Count;

        public void Add(Vector3 v, Vector3 n, Vector2 uv)
        {
            Vertices.Add(v);
            Normals.Add(n);
            Uvs.Add(uv);
        }

        public void Tri(int a, int b, int c)
        {
            Indices.Add(a);
            Indices.Add(b);
            Indices.Add(c);
        }

        public MeshData Clone()
        {
            var copy = new MeshData();
            copy.Vertices.AddRange(Vertices);
            copy.Normals.AddRange(Normals);
            copy.Uvs.AddRange(Uvs);
            if (Colors != null) copy.Colors = new List<Color>(Colors);
            copy.Indices.AddRange(Indices);
            return copy;
        }

        /// <summary>Aplica uma matriz a posições e normais (normais pela inversa transposta).</summary>
        public MeshData Transform(Matrix4x4 m)
        {
            Matrix4x4 normalMatrix = m.inverse.transpose;
            for (int i = 0; i < Vertices.Count; i++)
            {
                Vertices[i] = m.MultiplyPoint3x4(Vertices[i]);
                Vector3 n = normalMatrix.MultiplyVector(Normals[i]);
                float len = n.magnitude;
                Normals[i] = len > 1e-12f ? n / len : n;
            }
            return this;
        }

        public MeshData RotateX(float radians) => Transform(Matrix4x4.Rotate(MathUtil.AxisAngle(Vector3.right, radians)));
        public MeshData RotateY(float radians) => Transform(Matrix4x4.Rotate(MathUtil.AxisAngle(Vector3.up, radians)));
        public MeshData RotateZ(float radians) => Transform(Matrix4x4.Rotate(MathUtil.AxisAngle(Vector3.forward, radians)));
        public MeshData Translate(float x, float y, float z) => Transform(Matrix4x4.Translate(new Vector3(x, y, z)));
        public MeshData Scale(float x, float y, float z) => Transform(Matrix4x4.Scale(new Vector3(x, y, z)));

        /// <summary>Pinta todos os vértices (cor LINEAR, como o three guarda).</summary>
        public MeshData SetColor(Color linear)
        {
            Colors = new List<Color>(Vertices.Count);
            for (int i = 0; i < Vertices.Count; i++) Colors.Add(linear);
            return this;
        }

        /// <summary>Anexa outra geometria, opcionalmente transformada e pintada.</summary>
        public void Append(MeshData other, Matrix4x4? matrix = null, Color? linearColor = null)
        {
            int start = Vertices.Count;
            bool useColors = Colors != null || other.Colors != null || linearColor.HasValue;
            if (useColors && Colors == null)
            {
                Colors = new List<Color>(Vertices.Count + other.VertexCount);
                for (int i = 0; i < start; i++) Colors.Add(Color.white);
            }

            Matrix4x4 m = matrix ?? Matrix4x4.identity;
            Matrix4x4 nm = m.inverse.transpose;
            bool identity = !matrix.HasValue;

            for (int i = 0; i < other.Vertices.Count; i++)
            {
                if (identity)
                {
                    Vertices.Add(other.Vertices[i]);
                    Normals.Add(other.Normals[i]);
                }
                else
                {
                    Vertices.Add(m.MultiplyPoint3x4(other.Vertices[i]));
                    Vector3 n = nm.MultiplyVector(other.Normals[i]);
                    float len = n.magnitude;
                    Normals.Add(len > 1e-12f ? n / len : n);
                }
                Uvs.Add(i < other.Uvs.Count ? other.Uvs[i] : Vector2.zero);
                if (useColors)
                {
                    if (linearColor.HasValue) Colors.Add(linearColor.Value);
                    else Colors.Add(other.Colors != null ? other.Colors[i] : Color.white);
                }
            }
            for (int i = 0; i < other.Indices.Count; i++) Indices.Add(other.Indices[i] + start);
        }

        /// <summary>
        /// `computeVertexNormals` do three: soma as normais (ponderadas pela área)
        /// das faces que usam cada vértice. Em geometria sem vértices
        /// compartilhados isso dá sombreamento chapado, como no original.
        /// </summary>
        public MeshData ComputeNormals()
        {
            var accum = new Vector3[Vertices.Count];
            for (int t = 0; t < Indices.Count; t += 3)
            {
                int a = Indices[t], b = Indices[t + 1], c = Indices[t + 2];
                Vector3 face = Vector3.Cross(Vertices[c] - Vertices[b], Vertices[a] - Vertices[b]);
                accum[a] += face;
                accum[b] += face;
                accum[c] += face;
            }
            Normals.Clear();
            for (int i = 0; i < accum.Length; i++)
            {
                float len = accum[i].magnitude;
                Normals.Add(len > 1e-20f ? accum[i] / len : Vector3.up);
            }
            return this;
        }

        /// <summary>`toNonIndexed`: cada canto de triângulo vira um vértice próprio.</summary>
        public MeshData ToNonIndexed()
        {
            var result = new MeshData();
            bool colors = Colors != null;
            if (colors) result.Colors = new List<Color>(Indices.Count);
            for (int i = 0; i < Indices.Count; i++)
            {
                int k = Indices[i];
                result.Vertices.Add(Vertices[k]);
                result.Normals.Add(Normals[k]);
                result.Uvs.Add(k < Uvs.Count ? Uvs[k] : Vector2.zero);
                if (colors) result.Colors.Add(Colors[k]);
                result.Indices.Add(i);
            }
            return result;
        }

        /// <summary>
        /// `side: DoubleSide`: duplica os triângulos com o enrolamento invertido e
        /// a normal negada. É mais barato e mais previsível do que um shader sem
        /// culling, que iluminaria o verso com a normal da frente.
        /// </summary>
        public MeshData MakeDoubleSided()
        {
            int count = Vertices.Count;
            int triCount = Indices.Count;
            for (int i = 0; i < count; i++)
            {
                Vertices.Add(Vertices[i]);
                Normals.Add(-Normals[i]);
                Uvs.Add(i < Uvs.Count ? Uvs[i] : Vector2.zero);
                if (Colors != null) Colors.Add(Colors[i]);
            }
            for (int t = 0; t < triCount; t += 3)
            {
                Indices.Add(Indices[t] + count);
                Indices.Add(Indices[t + 2] + count);
                Indices.Add(Indices[t + 1] + count);
            }
            return this;
        }

        public Mesh ToMesh(string name = "mesh", bool tangents = true)
        {
            var mesh = new Mesh { name = name };
            if (Vertices.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(Vertices);
            mesh.SetNormals(Normals);
            if (Uvs.Count == Vertices.Count) mesh.SetUVs(0, Uvs);
            if (Colors != null && Colors.Count == Vertices.Count) mesh.SetColors(Colors);
            mesh.SetTriangles(Indices, 0, true);
            if (tangents && Uvs.Count == Vertices.Count && Vertices.Count > 0) mesh.RecalculateTangents();
            return mesh;
        }
    }
}
