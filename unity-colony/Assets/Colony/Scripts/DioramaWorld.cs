using UnityEngine;
using UnityEngine.Rendering;

namespace Colony
{
    // Fixed-perspective 2.5D scene: approved art, individual polygon meshes and
    // colliders, live surface lighting, and independently animated scene objects.
    public class DioramaWorld
    {
        public Transform Root { get; private set; }
        public Transform Plate { get; private set; }
        public float Width { get; private set; }
        public float Height { get; private set; }
        public bool Mobile => Screen.height > Screen.width;
        public Material Surface { get; private set; }

        public static DioramaWorld Build(Transform parent)
        {
            var world = new DioramaWorld();
            world.Root = new GameObject("LivingColony").transform;
            world.Root.SetParent(parent, false);
            var texture = Resources.Load<Texture2D>("Vista/colony-approved");
            if (!texture) throw new System.Exception("Approved colony artwork is missing.");
            world.Height = 20f;
            world.Width = world.Height * texture.width / texture.height;
            world.Surface = new Material(Resources.Load<Shader>("ColonySurface"));
            world.Surface.mainTexture = texture;
            var plate = new GameObject("Landscape");
            plate.transform.SetParent(world.Root, false);
            world.Plate = plate.transform;
            var mesh = new Mesh { name = "Landscape" };
            mesh.vertices = new[] { world.UvToLocal(new Vector2(0,0)), world.UvToLocal(new Vector2(1,0)), world.UvToLocal(new Vector2(1,1)), world.UvToLocal(new Vector2(0,1)) };
            mesh.uv = new[] { new Vector2(0,1), new Vector2(1,1), new Vector2(1,0), new Vector2(0,0) };
            mesh.triangles = new[] { 0,1,2,0,2,3 };
            mesh.RecalculateBounds();
            plate.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = plate.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = world.Surface;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            RenderSettings.fog = false;
            Shader.SetGlobalFloat("_ColonyMotion", 1f);
            return world;
        }
        public void ApplyAspect(bool mobile) { }
        public Vector3 UvToLocal(Vector2 uv) => new Vector3((uv.x - .5f) * Width, (.5f - uv.y) * Height, 0);
        public Vector2 PlotUv(PlotSpec spec) => spec.Desk;
    }
}
