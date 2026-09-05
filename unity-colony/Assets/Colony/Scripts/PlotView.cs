using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Colony
{
    public class PlotView : MonoBehaviour
    {
        public string Id;
        public int Level;
        public bool Locked, Busy, Selected, Active, Idle;
        public string Size;
        public Vector3 Anchor { get; private set; }
        DioramaWorld _world;
        PlotSpec _spec;
        MeshRenderer _renderer;
        MaterialPropertyBlock _properties;
        LineRenderer _outline;

        public static PlotView Spawn(DioramaWorld world, Transform parent, PlotSpec spec)
        {
            var go = new GameObject("Building-" + spec.Id);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0, 0, -.04f);
            var view = go.AddComponent<PlotView>();
            view.Id = spec.Id; view.Size = spec.Size; view._world = world; view._spec = spec;
            view.Anchor = world.UvToLocal(spec.Desk) + new Vector3(0, 0, -.1f);
            var vertices = new Vector3[spec.outline.Length];
            var uvs = new Vector2[vertices.Length];
            for (int i=0; i<vertices.Length; i++) {
                vertices[i] = world.UvToLocal(spec.outline[i]);
                uvs[i] = new Vector2(spec.outline[i].x, 1-spec.outline[i].y);
            }
            var mesh = new Mesh { name = spec.Id + "-footprint" };
            mesh.vertices = vertices; mesh.uv = uvs;
            mesh.triangles = Triangulate(spec.outline);
            mesh.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            view._renderer = go.AddComponent<MeshRenderer>();
            view._renderer.sharedMaterial = world.Surface;
            view._renderer.shadowCastingMode = ShadowCastingMode.Off;
            view._renderer.receiveShadows = false;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
            view._properties = new MaterialPropertyBlock();
            var outline = new GameObject("Selection").AddComponent<LineRenderer>();
            outline.transform.SetParent(go.transform, false);
            outline.useWorldSpace = false; outline.loop = true;
            outline.positionCount = vertices.Length;
            for (int i=0; i<vertices.Length; i++) outline.SetPosition(i, vertices[i] + new Vector3(0,0,-.025f));
            outline.sharedMaterial = new Material(Resources.Load<Shader>("ColonyTrail"));
            outline.startColor = outline.endColor = new Color(.55f,.86f,.94f,.58f);
            outline.widthMultiplier = .021f;
            outline.numCornerVertices = 3; outline.enabled = false;
            view._outline = outline;
            view.Apply(0, false, false, false);
            return view;
        }

        public void Relayout() { }
        public void Apply(int level, bool locked, bool busy, bool selected, bool active = false, bool idle = false)
        {
            Level = Mathf.Max(0,level); Locked = locked; Busy = busy;
            Selected = selected; Active = active; Idle = idle;
            _properties.SetFloat("_Dormant", Level == 0 ? 1f : 0f);
            _properties.SetFloat("_Active", active ? 1f : 0f);
            _properties.SetFloat("_Selected", selected ? 1f : 0f);
            _properties.SetFloat("_Busy", busy ? 1f : 0f);
            _renderer.SetPropertyBlock(_properties);
            _outline.enabled = selected;
        }

        // Ear clipping preserves concave roof silhouettes, so adjacent buildings
        // do not accidentally share the rectangular hit regions used previously.
        static int[] Triangulate(Vector2[] p)
        {
            var remaining = new List<int>();
            float area = 0;
            for (int i=0;i<p.Length;i++) area += p[i].x*p[(i+1)%p.Length].y-p[(i+1)%p.Length].x*p[i].y;
            for (int i=0;i<p.Length;i++) remaining.Add(area>0 ? i : p.Length-1-i);
            var triangles = new List<int>();
            int guard = p.Length*p.Length;
            while (remaining.Count>2 && guard-->0) {
                bool clipped = false;
                for (int k=0;k<remaining.Count;k++) {
                    int a=remaining[(k+remaining.Count-1)%remaining.Count], b=remaining[k], c=remaining[(k+1)%remaining.Count];
                    if (Cross(p[b]-p[a],p[c]-p[b])<=.0000001f) continue;
                    bool contains=false;
                    foreach (int n in remaining) {
                        if(n==a||n==b||n==c) continue;
                        if(Cross(p[b]-p[a],p[n]-p[a])>=0 && Cross(p[c]-p[b],p[n]-p[b])>=0 && Cross(p[a]-p[c],p[n]-p[c])>=0) { contains=true; break; }
                    }
                    if(contains) continue;
                    triangles.Add(a); triangles.Add(b); triangles.Add(c);
                    remaining.RemoveAt(k); clipped=true; break;
                }
                if(!clipped) throw new System.Exception("Invalid building footprint");
            }
            return triangles.ToArray();
        }
        static float Cross(Vector2 a, Vector2 b) => a.x*b.y-a.y*b.x;
    }
}
