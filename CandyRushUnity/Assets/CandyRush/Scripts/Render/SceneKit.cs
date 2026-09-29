using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CandyRush
{
    /// <summary>
    /// O jeito three.js de montar cena (`new Group()`, `new Mesh(g, m)`,
    /// `position.set`, `rotation.y = ...`) traduzido para GameObjects.
    ///
    /// Tudo é criado em coordenadas LOCAIS do three: os nós vivem sob a raiz
    /// espelhada do mundo, então os números do original servem sem mudança.
    /// </summary>
    public static class SceneKit
    {
        public static Transform Node(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go.transform;
        }

        /// <summary>O `new Mesh(geometry, material)` pendurado num pai.</summary>
        public static Transform Mesh(Transform parent, MeshData geometry, Mat material,
            bool castShadow = false, bool receiveShadow = true, string name = "mesh")
        {
            MeshData data = geometry;
            if (material.DoubleSided) data = geometry.Clone().MakeDoubleSided();
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = data.ToMesh(name);
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material.Material;
            renderer.shadowCastingMode = castShadow ? ShadowCastingMode.On : ShadowCastingMode.Off;
            renderer.receiveShadows = receiveShadow;
            return go.transform;
        }

        /// <summary>Mesma coisa, reaproveitando uma malha do Unity já pronta.</summary>
        public static Transform Mesh(Transform parent, Mesh mesh, Mat material,
            bool castShadow = false, bool receiveShadow = true, string name = "mesh")
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material.Material;
            renderer.shadowCastingMode = castShadow ? ShadowCastingMode.On : ShadowCastingMode.Off;
            renderer.receiveShadows = receiveShadow;
            return go.transform;
        }

        public static Transform At(this Transform t, float x, float y, float z)
        {
            t.localPosition = new Vector3(x, y, z);
            return t;
        }

        public static Transform At(this Transform t, Vector3 position)
        {
            t.localPosition = position;
            return t;
        }

        /// <summary>`rotation.set(x, y, z)` com a ordem XYZ do three, em radianos.</summary>
        public static Transform Rot(this Transform t, float x, float y, float z)
        {
            t.localRotation = MathUtil.EulerXYZ(x, y, z);
            return t;
        }

        public static Transform RotY(this Transform t, float y)
        {
            t.localRotation = MathUtil.AxisAngle(Vector3.up, y);
            return t;
        }

        public static Transform Scl(this Transform t, float x, float y, float z)
        {
            t.localScale = new Vector3(x, y, z);
            return t;
        }

        public static Transform Scl(this Transform t, float s)
        {
            t.localScale = new Vector3(s, s, s);
            return t;
        }
    }

    /// <summary>
    /// O substituto do `InstancedMesh` para peças PARADAS: cada instância é
    /// assada na geometria e tudo vira uma malha só. Uma chamada de desenho por
    /// balde, como no original.
    /// </summary>
    public sealed class Batch
    {
        readonly MeshData data = new MeshData();
        readonly Mat material;
        readonly string name;

        public Batch(Mat material, string name)
        {
            this.material = material;
            this.name = name;
        }

        public int Count { get; private set; }

        public void Add(MeshData geometry, Matrix4x4 matrix, Color? linearColor = null)
        {
            data.Append(geometry, matrix, linearColor);
            Count++;
        }

        /// <summary>Instância como no `addInstances`: posição, rumo em Y e escala uniforme.</summary>
        public void Add(MeshData geometry, Vector3 position, float headingY, float scale, Color? linearColor = null)
        {
            Add(geometry, Matrix4x4.TRS(position, MathUtil.AxisAngle(Vector3.up, headingY), Vector3.one * scale), linearColor);
        }

        public Transform Flush(Transform parent, bool castShadow, bool receiveShadow = true)
        {
            if (Count == 0) return null;
            return SceneKit.Mesh(parent, data, material, castShadow, receiveShadow, name);
        }
    }
}
