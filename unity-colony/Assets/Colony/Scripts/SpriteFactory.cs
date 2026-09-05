using UnityEngine;

namespace Colony
{
    public static class SpriteFactory
    {
        static Shader _sprite;
        static Shader _ground;
        static Mesh _quad;

        public static Transform GroundPlane(float worldSize, float tiles, Transform parent)
        {
            Ensure();
            var go = new GameObject("ground");
            go.transform.SetParent(parent, false);
            go.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            go.transform.localScale = new Vector3(worldSize, worldSize, 1f);
            go.AddComponent<MeshFilter>().sharedMesh = Quad();
            var rend = go.AddComponent<MeshRenderer>();
            var mat = new Material(_ground != null ? _ground : _sprite);
            var tex = Resources.Load<Texture2D>("Top/ground");
            if (tex != null)
            {
                tex.wrapMode = TextureWrapMode.Repeat;
                tex.filterMode = FilterMode.Bilinear;
                mat.SetTexture("_MainTex", tex);
            }
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            mat.SetTextureScale("_MainTex", new Vector2(tiles, tiles));
            rend.sharedMaterial = mat;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go.transform;
        }

        public static Transform Building(string id, string size, Transform parent)
        {
            float d = PlotLayout.Radius(size) * 2.08f;
            var t = Cutout(id, d, parent);
            t.localPosition = new Vector3(0f, 0.08f, 0f);
            return t;
        }

        public static Transform Pad(string size, Transform parent)
        {
            float d = PlotLayout.Radius(size) * 2.15f;
            var t = Cutout("pad", d, parent);
            t.localPosition = new Vector3(0f, 0.03f, 0f);
            return t;
        }

        public static void Tint(Transform t, Color color)
        {
            if (t == null) return;
            var rend = t.GetComponent<MeshRenderer>();
            if (rend && rend.material && rend.material.HasProperty("_Color"))
                rend.material.SetColor("_Color", color);
        }

        static Transform Cutout(string resource, float worldSize, Transform parent)
        {
            Ensure();
            var go = new GameObject(resource);
            go.transform.SetParent(parent, false);
            go.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            go.transform.localScale = new Vector3(worldSize, worldSize, 1f);
            go.AddComponent<MeshFilter>().sharedMesh = Quad();
            var rend = go.AddComponent<MeshRenderer>();
            var mat = new Material(_sprite);
            var tex = Resources.Load<Texture2D>("Top/" + resource);
            if (tex != null)
            {
                tex.wrapMode = TextureWrapMode.Clamp;
                tex.filterMode = FilterMode.Bilinear;
                mat.SetTexture("_MainTex", tex);
            }
            if (mat.HasProperty("_Cutoff")) mat.SetFloat("_Cutoff", 0.08f);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            rend.sharedMaterial = mat;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go.transform;
        }

        static void Ensure()
        {
            if (_sprite == null)
                _sprite = Resources.Load<Shader>("ColonySprite") ?? Shader.Find("Colony/Sprite");
            if (_ground == null)
                _ground = Resources.Load<Shader>("ColonyGround") ?? Shader.Find("Colony/Ground");
            if (_sprite == null) _sprite = Shader.Find("Unlit/Texture");
        }

        static Mesh Quad()
        {
            if (_quad != null) return _quad;
            _quad = new Mesh { name = "ground-quad" };
            _quad.vertices = new[]
            {
                new Vector3(-0.5f, -0.5f, 0f),
                new Vector3(0.5f, -0.5f, 0f),
                new Vector3(-0.5f, 0.5f, 0f),
                new Vector3(0.5f, 0.5f, 0f)
            };
            _quad.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
            _quad.triangles = new[] { 0, 2, 1, 2, 3, 1 };
            _quad.RecalculateNormals();
            _quad.RecalculateBounds();
            return _quad;
        }
    }
}
