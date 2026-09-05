using UnityEngine;

namespace Colony
{
    public static class Prims
    {
        public static Transform Box(Transform parent, Vector3 size, Vector3 pos, Material mat, Vector3 euler = default)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "box";
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler);
            go.transform.localScale = size;
            Apply(go, mat);
            return go.transform;
        }

        public static Transform Sphere(Transform parent, float radius, Vector3 pos, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "sphere";
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = Vector3.one * (radius * 2f);
            Apply(go, mat);
            return go.transform;
        }

        public static Transform Cylinder(Transform parent, float radius, float height, Vector3 pos, Material mat, Vector3 euler = default)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = "cyl";
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler);
            go.transform.localScale = new Vector3(radius * 2f, height * 0.5f, radius * 2f);
            Apply(go, mat);
            return go.transform;
        }

        public static Transform Frustum(Transform parent, float rTop, float rBottom, float height, Vector3 pos, Material mat, int sides = 16, Vector3 euler = default)
        {
            var go = new GameObject("frustum");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = MakeFrustum(rTop, rBottom, height, sides);
            var rend = go.AddComponent<MeshRenderer>();
            rend.sharedMaterial = mat;
            var col = go.AddComponent<MeshCollider>();
            col.sharedMesh = filter.sharedMesh;
            return go.transform;
        }

        public static Transform Cone(Transform parent, float radius, float height, Vector3 pos, Material mat, int sides = 12, Vector3 euler = default)
        {
            return Frustum(parent, 0.02f, radius, height, pos, mat, sides, euler);
        }

        public static Transform Torus(Transform parent, float radius, float tube, Vector3 pos, Material mat, Vector3 euler = default)
        {
            var go = new GameObject("torus");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = MakeTorus(radius, tube, 24, 12);
            var rend = go.AddComponent<MeshRenderer>();
            rend.sharedMaterial = mat;
            return go.transform;
        }

        public static Transform Octahedron(Transform parent, float radius, Vector3 pos, Material mat)
        {
            var go = new GameObject("octa");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = MakeOcta(radius);
            var rend = go.AddComponent<MeshRenderer>();
            rend.sharedMaterial = mat;
            return go.transform;
        }

        static void Apply(GameObject go, Material mat)
        {
            var rend = go.GetComponent<MeshRenderer>();
            if (rend) rend.sharedMaterial = mat;
            var col = go.GetComponent<Collider>();
            if (col) Object.Destroy(col);
        }

        static Mesh MakeFrustum(float rTop, float rBottom, float height, int sides)
        {
            var mesh = new Mesh { name = "frustum" };
            var verts = new Vector3[sides * 2 + 2];
            var tris = new int[sides * 12];
            verts[sides * 2] = new Vector3(0, height * 0.5f, 0);
            verts[sides * 2 + 1] = new Vector3(0, -height * 0.5f, 0);
            for (int i = 0; i < sides; i++)
            {
                float a = i / (float)sides * Mathf.PI * 2f;
                verts[i] = new Vector3(Mathf.Cos(a) * rTop, height * 0.5f, Mathf.Sin(a) * rTop);
                verts[i + sides] = new Vector3(Mathf.Cos(a) * rBottom, -height * 0.5f, Mathf.Sin(a) * rBottom);
            }
            int t = 0;
            for (int i = 0; i < sides; i++)
            {
                int n = (i + 1) % sides;
                tris[t++] = i; tris[t++] = n; tris[t++] = i + sides;
                tris[t++] = n; tris[t++] = n + sides; tris[t++] = i + sides;
                tris[t++] = sides * 2; tris[t++] = n; tris[t++] = i;
                tris[t++] = sides * 2 + 1; tris[t++] = i + sides; tris[t++] = n + sides;
            }
            mesh.vertices = verts;
            mesh.triangles = tris;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh MakeTorus(float radius, float tube, int radSeg, int tubeSeg)
        {
            var mesh = new Mesh { name = "torus" };
            var verts = new Vector3[(radSeg + 1) * (tubeSeg + 1)];
            var tris = new int[radSeg * tubeSeg * 6];
            for (int i = 0; i <= radSeg; i++)
            {
                float u = i / (float)radSeg * Mathf.PI * 2f;
                var c = new Vector3(Mathf.Cos(u) * radius, 0, Mathf.Sin(u) * radius);
                for (int j = 0; j <= tubeSeg; j++)
                {
                    float v = j / (float)tubeSeg * Mathf.PI * 2f;
                    var n = new Vector3(Mathf.Cos(u) * Mathf.Cos(v), Mathf.Sin(v), Mathf.Sin(u) * Mathf.Cos(v));
                    verts[i * (tubeSeg + 1) + j] = c + n * tube;
                }
            }
            int t = 0;
            for (int i = 0; i < radSeg; i++)
            {
                for (int j = 0; j < tubeSeg; j++)
                {
                    int a = i * (tubeSeg + 1) + j;
                    int b = a + tubeSeg + 1;
                    tris[t++] = a; tris[t++] = b; tris[t++] = a + 1;
                    tris[t++] = a + 1; tris[t++] = b; tris[t++] = b + 1;
                }
            }
            mesh.vertices = verts;
            mesh.triangles = tris;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh MakeOcta(float r)
        {
            var mesh = new Mesh { name = "octa" };
            mesh.vertices = new[]
            {
                new Vector3(0, r, 0), new Vector3(0, -r, 0),
                new Vector3(r, 0, 0), new Vector3(-r, 0, 0),
                new Vector3(0, 0, r), new Vector3(0, 0, -r)
            };
            mesh.triangles = new[]
            {
                0,2,4, 0,4,3, 0,3,5, 0,5,2,
                1,4,2, 1,3,4, 1,5,3, 1,2,5
            };
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
