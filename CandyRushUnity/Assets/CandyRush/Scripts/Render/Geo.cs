using System;
using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Os geradores de geometria do three.js (r169), portados um a um: mesmos
    /// vértices, mesmas normais, mesmos UVs e mesma ordem. Mantê-los idênticos é
    /// o que deixa o cenário, que foi todo ajustado a olho no navegador, cair no
    /// mesmo lugar aqui.
    /// </summary>
    public static class Geo
    {
        const float TwoPi = Mathf.PI * 2f;

        // ------------------------------------------------------------ plano ---

        public static MeshData Plane(float width, float height, int gridX = 1, int gridY = 1)
        {
            var g = new MeshData();
            float wh = width / 2f, hh = height / 2f;
            int gx1 = gridX + 1, gy1 = gridY + 1;
            float sw = width / gridX, sh = height / gridY;
            for (int iy = 0; iy < gy1; iy++)
            {
                float y = iy * sh - hh;
                for (int ix = 0; ix < gx1; ix++)
                {
                    float x = ix * sw - wh;
                    g.Add(new Vector3(x, -y, 0), new Vector3(0, 0, 1), new Vector2((float)ix / gridX, 1f - (float)iy / gridY));
                }
            }
            for (int iy = 0; iy < gridY; iy++)
            {
                for (int ix = 0; ix < gridX; ix++)
                {
                    int a = ix + gx1 * iy;
                    int b = ix + gx1 * (iy + 1);
                    int c = ix + 1 + gx1 * (iy + 1);
                    int d = ix + 1 + gx1 * iy;
                    g.Tri(a, b, d);
                    g.Tri(b, c, d);
                }
            }
            return g;
        }

        public static MeshData Circle(float radius, int segments, float thetaStart = 0, float thetaLength = TwoPi)
        {
            var g = new MeshData();
            g.Add(Vector3.zero, new Vector3(0, 0, 1), new Vector2(0.5f, 0.5f));
            for (int s = 0; s <= segments; s++)
            {
                float segment = thetaStart + (float)s / segments * thetaLength;
                float x = radius * Mathf.Cos(segment);
                float y = radius * Mathf.Sin(segment);
                g.Add(new Vector3(x, y, 0), new Vector3(0, 0, 1), new Vector2((x / radius + 1) / 2f, (y / radius + 1) / 2f));
            }
            for (int i = 1; i <= segments; i++) g.Tri(i, i + 1, 0);
            return g;
        }

        // ------------------------------------------------------------ caixa ---

        public static MeshData Box(float width, float height, float depth, int ws = 1, int hs = 1, int ds = 1)
        {
            var g = new MeshData();
            BuildPlane(g, 2, 1, 0, -1, -1, depth, height, width, ds, hs);
            BuildPlane(g, 2, 1, 0, 1, -1, depth, height, -width, ds, hs);
            BuildPlane(g, 0, 2, 1, 1, 1, width, depth, height, ws, ds);
            BuildPlane(g, 0, 2, 1, 1, -1, width, depth, -height, ws, ds);
            BuildPlane(g, 0, 1, 2, 1, -1, width, height, depth, ws, hs);
            BuildPlane(g, 0, 1, 2, -1, -1, width, height, -depth, ws, hs);
            return g;
        }

        static void BuildPlane(MeshData g, int u, int v, int w, float udir, float vdir,
            float width, float height, float depth, int gridX, int gridY)
        {
            float segW = width / gridX, segH = height / gridY;
            float wh = width / 2f, hh = height / 2f, dh = depth / 2f;
            int gx1 = gridX + 1, gy1 = gridY + 1;
            int start = g.VertexCount;
            for (int iy = 0; iy < gy1; iy++)
            {
                float y = iy * segH - hh;
                for (int ix = 0; ix < gx1; ix++)
                {
                    float x = ix * segW - wh;
                    Vector3 vec = Vector3.zero, nor = Vector3.zero;
                    vec[u] = x * udir;
                    vec[v] = y * vdir;
                    vec[w] = dh;
                    nor[w] = depth > 0 ? 1 : -1;
                    g.Add(vec, nor, new Vector2((float)ix / gridX, 1f - (float)iy / gridY));
                }
            }
            for (int iy = 0; iy < gridY; iy++)
            {
                for (int ix = 0; ix < gridX; ix++)
                {
                    int a = start + ix + gx1 * iy;
                    int b = start + ix + gx1 * (iy + 1);
                    int c = start + (ix + 1) + gx1 * (iy + 1);
                    int d = start + (ix + 1) + gx1 * iy;
                    g.Tri(a, b, d);
                    g.Tri(b, c, d);
                }
            }
        }

        /// <summary>`RoundedBoxGeometry` de three/examples.</summary>
        public static MeshData RoundedBox(float width, float height, float depth, int segments = 2, float radius = 0.1f)
        {
            segments = segments * 2 + 1;
            radius = Mathf.Min(width / 2f, Mathf.Min(height / 2f, Mathf.Min(depth / 2f, radius)));
            MeshData box = Box(1, 1, 1, segments, segments, segments);
            if (segments == 1) return box;

            MeshData g = box.ToNonIndexed();
            var half = new Vector3(width, height, depth) / 2f - Vector3.one * radius;
            int faceVerts = g.VertexCount / 6;
            float halfSegmentSize = 0.5f / segments;

            for (int i = 0; i < g.VertexCount; i++)
            {
                Vector3 position = g.Vertices[i];
                Vector3 normal = position;
                normal.x -= MathUtil.Sign(normal.x) * halfSegmentSize;
                normal.y -= MathUtil.Sign(normal.y) * halfSegmentSize;
                normal.z -= MathUtil.Sign(normal.z) * halfSegmentSize;
                normal.Normalize();

                g.Vertices[i] = new Vector3(
                    half.x * MathUtil.Sign(position.x) + normal.x * radius,
                    half.y * MathUtil.Sign(position.y) + normal.y * radius,
                    half.z * MathUtil.Sign(position.z) + normal.z * radius);
                g.Normals[i] = normal;

                int side = i / faceVerts;
                Vector2 uv;
                switch (side)
                {
                    case 0:
                        uv = new Vector2(RoundedUv(new Vector3(1, 0, 0), normal, 2, 1, radius, depth),
                            1f - RoundedUv(new Vector3(1, 0, 0), normal, 1, 2, radius, height));
                        break;
                    case 1:
                        uv = new Vector2(1f - RoundedUv(new Vector3(-1, 0, 0), normal, 2, 1, radius, depth),
                            1f - RoundedUv(new Vector3(-1, 0, 0), normal, 1, 2, radius, height));
                        break;
                    case 2:
                        uv = new Vector2(1f - RoundedUv(new Vector3(0, 1, 0), normal, 0, 2, radius, width),
                            RoundedUv(new Vector3(0, 1, 0), normal, 2, 0, radius, depth));
                        break;
                    case 3:
                        uv = new Vector2(1f - RoundedUv(new Vector3(0, -1, 0), normal, 0, 2, radius, width),
                            1f - RoundedUv(new Vector3(0, -1, 0), normal, 2, 0, radius, depth));
                        break;
                    case 4:
                        uv = new Vector2(1f - RoundedUv(new Vector3(0, 0, 1), normal, 0, 1, radius, width),
                            1f - RoundedUv(new Vector3(0, 0, 1), normal, 1, 0, radius, height));
                        break;
                    default:
                        uv = new Vector2(RoundedUv(new Vector3(0, 0, -1), normal, 0, 1, radius, width),
                            1f - RoundedUv(new Vector3(0, 0, -1), normal, 1, 0, radius, height));
                        break;
                }
                g.Uvs[i] = uv;
            }
            return g;
        }

        static float RoundedUv(Vector3 faceDir, Vector3 normal, int uvAxis, int projectionAxis, float radius, float sideLength)
        {
            float totArcLength = 2f * Mathf.PI * radius / 4f;
            float centerLength = Mathf.Max(sideLength - 2f * radius, 0f);
            float halfArc = Mathf.PI / 4f;
            Vector3 temp = normal;
            temp[projectionAxis] = 0;
            float len = temp.magnitude;
            temp = len > 0 ? temp / len : Vector3.zero;
            float arcUvRatio = 0.5f * totArcLength / (totArcLength + centerLength);
            float angle = AngleTo(temp, faceDir);
            float arcAngleRatio = 1f - angle / halfArc;
            if (MathUtil.Sign(temp[uvAxis]) == 1f) return arcAngleRatio * arcUvRatio;
            float lenUv = centerLength / (totArcLength + centerLength);
            return lenUv + arcUvRatio + arcUvRatio * (1f - arcAngleRatio);
        }

        static float AngleTo(Vector3 a, Vector3 b)
        {
            float denominator = Mathf.Sqrt(a.sqrMagnitude * b.sqrMagnitude);
            if (denominator == 0) return Mathf.PI / 2f;
            return Mathf.Acos(Mathf.Clamp(Vector3.Dot(a, b) / denominator, -1f, 1f));
        }

        // ----------------------------------------------------------- esfera ---

        public static MeshData Sphere(float radius = 1, int widthSegments = 32, int heightSegments = 16,
            float phiStart = 0, float phiLength = TwoPi, float thetaStart = 0, float thetaLength = Mathf.PI)
        {
            widthSegments = Mathf.Max(3, widthSegments);
            heightSegments = Mathf.Max(2, heightSegments);
            float thetaEnd = Mathf.Min(thetaStart + thetaLength, Mathf.PI);
            var g = new MeshData();
            var grid = new int[heightSegments + 1][];
            int index = 0;

            for (int iy = 0; iy <= heightSegments; iy++)
            {
                var row = new int[widthSegments + 1];
                float v = (float)iy / heightSegments;
                float uOffset = 0;
                if (iy == 0 && thetaStart == 0) uOffset = 0.5f / widthSegments;
                else if (iy == heightSegments && Mathf.Approximately(thetaEnd, Mathf.PI)) uOffset = -0.5f / widthSegments;

                for (int ix = 0; ix <= widthSegments; ix++)
                {
                    float u = (float)ix / widthSegments;
                    float sinT = Mathf.Sin(thetaStart + v * thetaLength);
                    var vertex = new Vector3(
                        -radius * Mathf.Cos(phiStart + u * phiLength) * sinT,
                        radius * Mathf.Cos(thetaStart + v * thetaLength),
                        radius * Mathf.Sin(phiStart + u * phiLength) * sinT);
                    g.Add(vertex, vertex.normalized, new Vector2(u + uOffset, 1 - v));
                    row[ix] = index++;
                }
                grid[iy] = row;
            }

            for (int iy = 0; iy < heightSegments; iy++)
            {
                for (int ix = 0; ix < widthSegments; ix++)
                {
                    int a = grid[iy][ix + 1];
                    int b = grid[iy][ix];
                    int c = grid[iy + 1][ix];
                    int d = grid[iy + 1][ix + 1];
                    if (iy != 0 || thetaStart > 0) g.Tri(a, b, d);
                    if (iy != heightSegments - 1 || thetaEnd < Mathf.PI - 1e-6f) g.Tri(b, c, d);
                }
            }
            return g;
        }

        // --------------------------------------------------------- cilindro ---

        public static MeshData Cylinder(float radiusTop = 1, float radiusBottom = 1, float height = 1,
            int radialSegments = 32, int heightSegments = 1, bool openEnded = false,
            float thetaStart = 0, float thetaLength = TwoPi)
        {
            var g = new MeshData();
            float halfHeight = height / 2f;
            var indexArray = new List<int[]>();
            int index = 0;

            float slope = (radiusBottom - radiusTop) / height;
            for (int y = 0; y <= heightSegments; y++)
            {
                var row = new int[radialSegments + 1];
                float v = (float)y / heightSegments;
                float radius = v * (radiusBottom - radiusTop) + radiusTop;
                for (int x = 0; x <= radialSegments; x++)
                {
                    float u = (float)x / radialSegments;
                    float theta = u * thetaLength + thetaStart;
                    float sinT = Mathf.Sin(theta), cosT = Mathf.Cos(theta);
                    g.Add(new Vector3(radius * sinT, -v * height + halfHeight, radius * cosT),
                        new Vector3(sinT, slope, cosT).normalized,
                        new Vector2(u, 1 - v));
                    row[x] = index++;
                }
                indexArray.Add(row);
            }
            for (int x = 0; x < radialSegments; x++)
            {
                for (int y = 0; y < heightSegments; y++)
                {
                    int a = indexArray[y][x];
                    int b = indexArray[y + 1][x];
                    int c = indexArray[y + 1][x + 1];
                    int d = indexArray[y][x + 1];
                    if (radiusTop > 0 || y != 0) g.Tri(a, b, d);
                    if (radiusBottom > 0 || y != heightSegments - 1) g.Tri(b, c, d);
                }
            }

            if (!openEnded)
            {
                if (radiusTop > 0) CylinderCap(g, true, radiusTop, halfHeight, radialSegments, thetaStart, thetaLength);
                if (radiusBottom > 0) CylinderCap(g, false, radiusBottom, halfHeight, radialSegments, thetaStart, thetaLength);
            }
            return g;
        }

        static void CylinderCap(MeshData g, bool top, float radius, float halfHeight, int radialSegments,
            float thetaStart, float thetaLength)
        {
            float sign = top ? 1 : -1;
            int centerStart = g.VertexCount;
            for (int x = 1; x <= radialSegments; x++)
                g.Add(new Vector3(0, halfHeight * sign, 0), new Vector3(0, sign, 0), new Vector2(0.5f, 0.5f));
            int centerEnd = g.VertexCount;
            for (int x = 0; x <= radialSegments; x++)
            {
                float u = (float)x / radialSegments;
                float theta = u * thetaLength + thetaStart;
                float cosT = Mathf.Cos(theta), sinT = Mathf.Sin(theta);
                g.Add(new Vector3(radius * sinT, halfHeight * sign, radius * cosT), new Vector3(0, sign, 0),
                    new Vector2(cosT * 0.5f + 0.5f, sinT * 0.5f * sign + 0.5f));
            }
            for (int x = 0; x < radialSegments; x++)
            {
                int c = centerStart + x;
                int i = centerEnd + x;
                if (top) g.Tri(i, i + 1, c);
                else g.Tri(i + 1, i, c);
            }
        }

        public static MeshData Cone(float radius = 1, float height = 1, int radialSegments = 32, int heightSegments = 1,
            bool openEnded = false) =>
            Cylinder(0, radius, height, radialSegments, heightSegments, openEnded);

        // ------------------------------------------------------------- toro ---

        public static MeshData Torus(float radius = 1, float tube = 0.4f, int radialSegments = 12,
            int tubularSegments = 48, float arc = TwoPi)
        {
            var g = new MeshData();
            for (int j = 0; j <= radialSegments; j++)
            {
                for (int i = 0; i <= tubularSegments; i++)
                {
                    float u = (float)i / tubularSegments * arc;
                    float v = (float)j / radialSegments * TwoPi;
                    var vertex = new Vector3(
                        (radius + tube * Mathf.Cos(v)) * Mathf.Cos(u),
                        (radius + tube * Mathf.Cos(v)) * Mathf.Sin(u),
                        tube * Mathf.Sin(v));
                    var center = new Vector3(radius * Mathf.Cos(u), radius * Mathf.Sin(u), 0);
                    g.Add(vertex, (vertex - center).normalized,
                        new Vector2((float)i / tubularSegments, (float)j / radialSegments));
                }
            }
            for (int j = 1; j <= radialSegments; j++)
            {
                for (int i = 1; i <= tubularSegments; i++)
                {
                    int a = (tubularSegments + 1) * j + i - 1;
                    int b = (tubularSegments + 1) * (j - 1) + i - 1;
                    int c = (tubularSegments + 1) * (j - 1) + i;
                    int d = (tubularSegments + 1) * j + i;
                    g.Tri(a, b, d);
                    g.Tri(b, c, d);
                }
            }
            return g;
        }

        // ------------------------------------------------------------ torno ---

        public static MeshData Lathe(IList<Vector2> points, int segments = 12, float phiStart = 0, float phiLength = TwoPi)
        {
            var g = new MeshData();
            phiLength = Mathf.Clamp(phiLength, 0, TwoPi);
            float inverseSegments = 1f / segments;
            var initNormals = new Vector3[points.Count];
            Vector3 prevNormal = Vector3.zero;

            for (int j = 0; j < points.Count; j++)
            {
                if (j == 0)
                {
                    float dx = points[j + 1].x - points[j].x;
                    float dy = points[j + 1].y - points[j].y;
                    var normal = new Vector3(dy, -dx, 0);
                    prevNormal = normal;
                    initNormals[j] = normal.normalized;
                }
                else if (j == points.Count - 1)
                {
                    initNormals[j] = prevNormal.normalized;
                }
                else
                {
                    float dx = points[j + 1].x - points[j].x;
                    float dy = points[j + 1].y - points[j].y;
                    var normal = new Vector3(dy, -dx, 0);
                    Vector3 cur = normal;
                    normal += prevNormal;
                    initNormals[j] = normal.normalized;
                    prevNormal = cur;
                }
            }

            for (int i = 0; i <= segments; i++)
            {
                float phi = phiStart + i * inverseSegments * phiLength;
                float sin = Mathf.Sin(phi), cos = Mathf.Cos(phi);
                for (int j = 0; j < points.Count; j++)
                {
                    var vertex = new Vector3(points[j].x * sin, points[j].y, points[j].x * cos);
                    var n = new Vector3(initNormals[j].x * sin, initNormals[j].y, initNormals[j].x * cos);
                    float len = n.magnitude;
                    g.Add(vertex, len > 0 ? n / len : Vector3.up,
                        new Vector2((float)i / segments, (float)j / (points.Count - 1)));
                }
            }

            for (int i = 0; i < segments; i++)
            {
                for (int j = 0; j < points.Count - 1; j++)
                {
                    int b0 = j + i * points.Count;
                    int a = b0, b = b0 + points.Count, c = b0 + points.Count + 1, d = b0 + 1;
                    g.Tri(a, b, d);
                    g.Tri(c, d, b);
                }
            }
            return g;
        }

        /// <summary>`CapsuleGeometry` do r169: um torno do contorno de duas meias-luas.</summary>
        public static MeshData Capsule(float radius = 1, float length = 1, int capSegments = 4, int radialSegments = 8)
        {
            var points = new List<Vector2>();
            AddArcPoints(points, 0, -length / 2f, radius, Mathf.PI * 1.5f, 0, capSegments * 2);
            AddPoint(points, new Vector2(radius, -length / 2f));
            AddPoint(points, new Vector2(radius, length / 2f));
            AddArcPoints(points, 0, length / 2f, radius, 0, Mathf.PI * 0.5f, capSegments * 2);
            return Lathe(points, radialSegments);
        }

        /// <summary>Pontos de um `EllipseCurve` (arco anti-horário) no estilo `getPoints`.</summary>
        public static void AddArcPoints(List<Vector2> points, float cx, float cy, float radius,
            float startAngle, float endAngle, int resolution, bool clockwise = false)
        {
            float delta = endAngle - startAngle;
            bool samePoints = Mathf.Abs(delta) < 1e-7f;
            while (delta < 0) delta += TwoPi;
            while (delta > TwoPi) delta -= TwoPi;
            if (delta < 1e-7f) delta = samePoints ? 0 : TwoPi;
            if (clockwise && !samePoints) delta = Mathf.Approximately(delta, TwoPi) ? -TwoPi : delta - TwoPi;
            for (int d = 0; d <= resolution; d++)
            {
                float angle = startAngle + (float)d / resolution * delta;
                AddPoint(points, new Vector2(cx + radius * Mathf.Cos(angle), cy + radius * Mathf.Sin(angle)));
            }
        }

        /// <summary>Acrescenta um ponto pulando repetições, como `Path.getPoints`.</summary>
        public static void AddPoint(List<Vector2> points, Vector2 p)
        {
            if (points.Count > 0 && (points[points.Count - 1] - p).sqrMagnitude < 1e-12f) return;
            points.Add(p);
        }

        /// <summary>Curva Bézier cúbica no estilo `bezierCurveTo`.</summary>
        public static void AddBezierPoints(List<Vector2> points, Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, int resolution)
        {
            for (int d = 0; d <= resolution; d++)
            {
                float t = (float)d / resolution;
                float k = 1 - t;
                Vector2 p = k * k * k * p0 + 3 * k * k * t * p1 + 3 * k * t * t * p2 + t * t * t * p3;
                AddPoint(points, p);
            }
        }

        // -------------------------------------------------------- octaedro ---

        public static MeshData Octahedron(float radius = 1)
        {
            Vector3[] v =
            {
                new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0),
                new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1),
            };
            int[] idx = { 0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2 };
            var g = new MeshData();
            for (int i = 0; i < idx.Length; i++)
            {
                g.Add(v[idx[i]] * radius, Vector3.up, Vector2.zero);
                g.Indices.Add(i);
            }
            return g.ComputeNormals();
        }

        // ------------------------------------------------------- extrusão ---

        /// <summary>
        /// `ExtrudeGeometry` para um contorno sem furos, com bisel opcional.
        /// Sai sem índice e com normais chapadas, como no three.
        /// </summary>
        public static MeshData Extrude(List<Vector2> shape, float depth, bool bevel = false,
            float bevelThickness = 0.2f, float bevelSize = 0.1f, int bevelSegments = 3)
        {
            var contour = new List<Vector2>(shape);
            if (contour.Count > 2 && (contour[0] - contour[contour.Count - 1]).sqrMagnitude < 1e-12f)
                contour.RemoveAt(contour.Count - 1);
            if (!IsClockWise(contour)) contour.Reverse();

            if (!bevel)
            {
                bevelSegments = 0;
                bevelThickness = 0;
                bevelSize = 0;
            }

            int vlen = contour.Count;
            var movements = new Vector2[vlen];
            for (int i = 0, j = vlen - 1, k = 1; i < vlen; i++, j++, k++)
            {
                if (j == vlen) j = 0;
                if (k == vlen) k = 0;
                movements[i] = BevelVec(contour[i], contour[j], contour[k]);
            }

            var layers = new List<Vector3>();
            for (int b = 0; b < bevelSegments; b++)
            {
                float t = (float)b / bevelSegments;
                float z = bevelThickness * Mathf.Cos(t * Mathf.PI / 2f);
                float bs = bevelSize * Mathf.Sin(t * Mathf.PI / 2f);
                for (int i = 0; i < vlen; i++)
                {
                    Vector2 p = contour[i] + movements[i] * bs;
                    layers.Add(new Vector3(p.x, p.y, -z));
                }
            }
            for (int i = 0; i < vlen; i++)
            {
                Vector2 p = contour[i] + movements[i] * bevelSize;
                layers.Add(new Vector3(p.x, p.y, 0));
            }
            for (int i = 0; i < vlen; i++)
            {
                Vector2 p = contour[i] + movements[i] * bevelSize;
                layers.Add(new Vector3(p.x, p.y, depth));
            }
            for (int b = bevelSegments - 1; b >= 0; b--)
            {
                float t = (float)b / bevelSegments;
                float z = bevelThickness * Mathf.Cos(t * Mathf.PI / 2f);
                float bs = bevelSize * Mathf.Sin(t * Mathf.PI / 2f);
                for (int i = 0; i < vlen; i++)
                {
                    Vector2 p = contour[i] + movements[i] * bs;
                    layers.Add(new Vector3(p.x, p.y, depth + z));
                }
            }
            int layerCount = layers.Count / vlen;

            var triangles = Triangulate(contour);
            var g = new MeshData();
            void Face(int a, int b, int c)
            {
                int start = g.VertexCount;
                g.Add(layers[a], Vector3.up, new Vector2(layers[a].x, layers[a].y));
                g.Add(layers[b], Vector3.up, new Vector2(layers[b].x, layers[b].y));
                g.Add(layers[c], Vector3.up, new Vector2(layers[c].x, layers[c].y));
                g.Tri(start, start + 1, start + 2);
            }

            int topOffset = vlen * (layerCount - 1);
            for (int t = 0; t < triangles.Count; t += 3)
            {
                int a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
                Face(c, b, a);
                Face(a + topOffset, b + topOffset, c + topOffset);
            }

            for (int i = 0; i < vlen; i++)
            {
                int j = i;
                int k = i - 1;
                if (k < 0) k = vlen - 1;
                for (int s = 0; s < layerCount - 1; s++)
                {
                    int a = j + vlen * s;
                    int b = k + vlen * s;
                    int c = k + vlen * (s + 1);
                    int d = j + vlen * (s + 1);
                    Face(a, b, d);
                    Face(b, c, d);
                }
            }
            return g.ComputeNormals();
        }

        static Vector2 BevelVec(Vector2 inPt, Vector2 inPrev, Vector2 inNext)
        {
            float vPrevX = inPt.x - inPrev.x, vPrevY = inPt.y - inPrev.y;
            float vNextX = inNext.x - inPt.x, vNextY = inNext.y - inPt.y;
            float vPrevLenSq = vPrevX * vPrevX + vPrevY * vPrevY;
            float collinear0 = vPrevX * vNextY - vPrevY * vNextX;
            float transX, transY, shrinkBy;

            if (Mathf.Abs(collinear0) > 1e-7f)
            {
                float vPrevLen = Mathf.Sqrt(vPrevLenSq);
                float vNextLen = Mathf.Sqrt(vNextX * vNextX + vNextY * vNextY);
                float prevShiftX = inPrev.x - vPrevY / vPrevLen;
                float prevShiftY = inPrev.y + vPrevX / vPrevLen;
                float nextShiftX = inNext.x - vNextY / vNextLen;
                float nextShiftY = inNext.y + vNextX / vNextLen;
                float sf = ((nextShiftX - prevShiftX) * vNextY - (nextShiftY - prevShiftY) * vNextX) /
                           (vPrevX * vNextY - vPrevY * vNextX);
                transX = prevShiftX + vPrevX * sf - inPt.x;
                transY = prevShiftY + vPrevY * sf - inPt.y;
                float transLenSq = transX * transX + transY * transY;
                if (transLenSq <= 2) return new Vector2(transX, transY);
                shrinkBy = Mathf.Sqrt(transLenSq / 2f);
            }
            else
            {
                bool directionEq = false;
                if (vPrevX > 1e-7f) { if (vNextX > 1e-7f) directionEq = true; }
                else if (vPrevX < -1e-7f) { if (vNextX < -1e-7f) directionEq = true; }
                else if (MathUtil.Sign(vPrevY) == MathUtil.Sign(vNextY)) directionEq = true;

                if (directionEq)
                {
                    transX = -vPrevY;
                    transY = vPrevX;
                    shrinkBy = Mathf.Sqrt(vPrevLenSq);
                }
                else
                {
                    transX = vPrevX;
                    transY = vPrevY;
                    shrinkBy = Mathf.Sqrt(vPrevLenSq / 2f);
                }
            }
            return new Vector2(transX / shrinkBy, transY / shrinkBy);
        }

        public static float SignedArea(IList<Vector2> contour)
        {
            float a = 0;
            int n = contour.Count;
            for (int p = n - 1, q = 0; q < n; p = q++)
                a += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
            return a * 0.5f;
        }

        public static bool IsClockWise(IList<Vector2> contour) => SignedArea(contour) < 0;

        /// <summary>
        /// Triangulação por corte de orelhas de um polígono simples. Devolve
        /// triângulos anti-horários (área positiva), que é o que a tampa de cima
        /// da extrusão espera.
        /// </summary>
        public static List<int> Triangulate(IList<Vector2> contour)
        {
            var result = new List<int>();
            int n = contour.Count;
            if (n < 3) return result;

            var remaining = new List<int>(n);
            if (SignedArea(contour) > 0) for (int i = 0; i < n; i++) remaining.Add(i);
            else for (int i = n - 1; i >= 0; i--) remaining.Add(i);

            int guard = 0;
            while (remaining.Count > 3 && guard++ < n * n)
            {
                bool clipped = false;
                for (int i = 0; i < remaining.Count; i++)
                {
                    int ia = remaining[(i + remaining.Count - 1) % remaining.Count];
                    int ib = remaining[i];
                    int ic = remaining[(i + 1) % remaining.Count];
                    Vector2 a = contour[ia], b = contour[ib], c = contour[ic];
                    float cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
                    if (cross <= 1e-9f) continue;

                    bool containsOther = false;
                    for (int k = 0; k < remaining.Count; k++)
                    {
                        int ik = remaining[k];
                        if (ik == ia || ik == ib || ik == ic) continue;
                        if (PointInTriangle(contour[ik], a, b, c)) { containsOther = true; break; }
                    }
                    if (containsOther) continue;

                    result.Add(ia);
                    result.Add(ib);
                    result.Add(ic);
                    remaining.RemoveAt(i);
                    clipped = true;
                    break;
                }

                if (!clipped)
                {
                    // Polígono degenerado (pontos colineares): remove o vértice
                    // mais "reto" em vez de travar.
                    int worst = 0;
                    float best = float.MaxValue;
                    for (int i = 0; i < remaining.Count; i++)
                    {
                        Vector2 a = contour[remaining[(i + remaining.Count - 1) % remaining.Count]];
                        Vector2 b = contour[remaining[i]];
                        Vector2 c = contour[remaining[(i + 1) % remaining.Count]];
                        float cross = Mathf.Abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
                        if (cross < best) { best = cross; worst = i; }
                    }
                    remaining.RemoveAt(worst);
                }
            }
            if (remaining.Count == 3)
            {
                Vector2 a = contour[remaining[0]], b = contour[remaining[1]], c = contour[remaining[2]];
                float cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
                if (cross > 0) { result.Add(remaining[0]); result.Add(remaining[1]); result.Add(remaining[2]); }
                else if (cross < 0) { result.Add(remaining[0]); result.Add(remaining[2]); result.Add(remaining[1]); }
            }
            return result;
        }

        static bool PointInTriangle(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
        {
            float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
            float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
            float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
            bool hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
            bool hasPos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(hasNeg && hasPos);
        }

        // ------------------------------------------------------------- tubo ---

        /// <summary>`TubeGeometry` ao longo de uma Catmull-Rom aberta (centrípeta).</summary>
        public static MeshData Tube(IList<Vector3> curvePoints, int tubularSegments, float radius, int radialSegments)
        {
            var curve = new CatmullRomCurve3(curvePoints, false);
            ComputeFrenetFrames(curve, tubularSegments, out var normals, out var binormals);

            var g = new MeshData();
            for (int i = 0; i <= tubularSegments; i++)
            {
                Vector3 p = curve.GetPointAt((float)i / tubularSegments);
                Vector3 n = normals[i];
                Vector3 b = binormals[i];
                for (int j = 0; j <= radialSegments; j++)
                {
                    float v = (float)j / radialSegments * TwoPi;
                    float sin = Mathf.Sin(v);
                    float cos = -Mathf.Cos(v);
                    Vector3 normal = (cos * n + sin * b).normalized;
                    g.Add(p + radius * normal, normal, new Vector2((float)i / tubularSegments, (float)j / radialSegments));
                }
            }
            for (int j = 1; j <= tubularSegments; j++)
            {
                for (int i = 1; i <= radialSegments; i++)
                {
                    int a = (radialSegments + 1) * (j - 1) + (i - 1);
                    int b = (radialSegments + 1) * j + (i - 1);
                    int c = (radialSegments + 1) * j + i;
                    int d = (radialSegments + 1) * (j - 1) + i;
                    g.Tri(a, b, d);
                    g.Tri(b, c, d);
                }
            }
            return g;
        }

        static void ComputeFrenetFrames(CatmullRomCurve3 curve, int segments, out Vector3[] normals, out Vector3[] binormals)
        {
            var tangents = new Vector3[segments + 1];
            normals = new Vector3[segments + 1];
            binormals = new Vector3[segments + 1];
            for (int i = 0; i <= segments; i++) tangents[i] = curve.GetTangentAt((float)i / segments);

            float min = float.MaxValue;
            float tx = Mathf.Abs(tangents[0].x), ty = Mathf.Abs(tangents[0].y), tz = Mathf.Abs(tangents[0].z);
            Vector3 normal = Vector3.zero;
            if (tx <= min) { min = tx; normal = new Vector3(1, 0, 0); }
            if (ty <= min) { min = ty; normal = new Vector3(0, 1, 0); }
            if (tz <= min) normal = new Vector3(0, 0, 1);

            Vector3 vec = Vector3.Cross(tangents[0], normal).normalized;
            normals[0] = Vector3.Cross(tangents[0], vec);
            binormals[0] = Vector3.Cross(tangents[0], normals[0]);

            for (int i = 1; i <= segments; i++)
            {
                normals[i] = normals[i - 1];
                vec = Vector3.Cross(tangents[i - 1], tangents[i]);
                if (vec.magnitude > 1e-7f)
                {
                    vec.Normalize();
                    float theta = Mathf.Acos(Mathf.Clamp(Vector3.Dot(tangents[i - 1], tangents[i]), -1, 1));
                    normals[i] = MathUtil.AxisAngle(vec, theta) * normals[i];
                }
                binormals[i] = Vector3.Cross(tangents[i], normals[i]);
            }
        }
    }

    /// <summary>
    /// `CatmullRomCurve3` do three, variante centrípeta, com a reparametrização
    /// por comprimento de arco (`getPointAt`, `getSpacedPoints`). É a base do
    /// traçado inteiro: o jeito como os pontos são espaçados define onde cai
    /// cada barreira, cada poste e cada moeda.
    /// </summary>
    public sealed class CatmullRomCurve3
    {
        readonly List<Vector3> points;
        readonly bool closed;
        double[] lengths;
        public int ArcLengthDivisions = 200;

        public CatmullRomCurve3(IList<Vector3> points, bool closed)
        {
            this.points = new List<Vector3>(points);
            this.closed = closed;
        }

        public Vector3 GetPoint(double t)
        {
            int l = points.Count;
            double p = (l - (closed ? 0 : 1)) * t;
            int intPoint = (int)Math.Floor(p);
            double weight = p - intPoint;

            if (closed) intPoint += intPoint > 0 ? 0 : (int)(Math.Floor(Math.Abs(intPoint) / (double)l) + 1) * l;
            else if (weight == 0 && intPoint == l - 1)
            {
                intPoint = l - 2;
                weight = 1;
            }

            Vector3 p0, p3;
            if (closed || intPoint > 0) p0 = points[(intPoint - 1) % l];
            else p0 = points[0] - points[1] + points[0];
            Vector3 p1 = points[intPoint % l];
            Vector3 p2 = points[(intPoint + 1) % l];
            if (closed || intPoint + 2 < l) p3 = points[(intPoint + 2) % l];
            else p3 = points[l - 1] - points[l - 2] + points[l - 1];

            double dt0 = Math.Pow((p1 - p0).sqrMagnitude, 0.25);
            double dt1 = Math.Pow((p2 - p1).sqrMagnitude, 0.25);
            double dt2 = Math.Pow((p3 - p2).sqrMagnitude, 0.25);
            if (dt1 < 1e-4) dt1 = 1.0;
            if (dt0 < 1e-4) dt0 = dt1;
            if (dt2 < 1e-4) dt2 = dt1;

            return new Vector3(
                (float)Poly(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, weight),
                (float)Poly(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2, weight),
                (float)Poly(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, weight));
        }

        static double Poly(double x0, double x1, double x2, double x3, double dt0, double dt1, double dt2, double t)
        {
            double t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
            double t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
            t1 *= dt1;
            t2 *= dt1;
            double c0 = x1, c1 = t1;
            double c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
            double c3 = 2 * x1 - 2 * x2 + t1 + t2;
            double tt = t * t;
            return c0 + c1 * t + c2 * tt + c3 * tt * t;
        }

        double[] GetLengths()
        {
            if (lengths != null) return lengths;
            int divisions = ArcLengthDivisions;
            lengths = new double[divisions + 1];
            Vector3 last = GetPoint(0);
            double sum = 0;
            lengths[0] = 0;
            for (int p = 1; p <= divisions; p++)
            {
                Vector3 current = GetPoint((double)p / divisions);
                sum += (current - last).magnitude;
                lengths[p] = sum;
                last = current;
            }
            return lengths;
        }

        public double UToT(double u)
        {
            double[] arc = GetLengths();
            int il = arc.Length;
            double target = u * arc[il - 1];
            int low = 0, high = il - 1, i = 0;
            while (low <= high)
            {
                i = low + (high - low) / 2;
                double comparison = arc[i] - target;
                if (comparison < 0) low = i + 1;
                else if (comparison > 0) high = i - 1;
                else { high = i; break; }
            }
            i = high;
            if (i < 0) return 0;
            if (arc[i] == target) return (double)i / (il - 1);
            if (i + 1 >= il) return 1;
            double before = arc[i];
            double after = arc[i + 1];
            double fraction = (target - before) / (after - before);
            return (i + fraction) / (il - 1);
        }

        public Vector3 GetPointAt(double u) => GetPoint(UToT(u));

        public Vector3 GetTangentAt(double u)
        {
            double t = UToT(u);
            const double delta = 0.0001;
            double t1 = t - delta, t2 = t + delta;
            if (t1 < 0) t1 = 0;
            if (t2 > 1) t2 = 1;
            return (GetPoint(t2) - GetPoint(t1)).normalized;
        }

        public List<Vector3> GetSpacedPoints(int divisions)
        {
            var result = new List<Vector3>(divisions + 1);
            for (int d = 0; d <= divisions; d++) result.Add(GetPointAt((double)d / divisions));
            return result;
        }
    }
}
