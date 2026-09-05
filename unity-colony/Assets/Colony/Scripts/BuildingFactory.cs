using UnityEngine;

namespace Colony
{
    public static class BuildingFactory
    {
        public static Transform Make(string id, Transform parent)
        {
            var root = new GameObject(id).transform;
            root.SetParent(parent, false);
            switch (id)
            {
                case "command": Command(root); break;
                case "citadel": Citadel(root); break;
                case "archive": Archive(root); break;
                case "defense_hub": DefenseHub(root); break;
                case "shipyard": Shipyard(root); break;
                case "energy_array": Energy(root); break;
                case "fusion": Fusion(root); break;
                case "shield": Shield(root); break;
                case "quantum_lab": Quantum(root); break;
                case "jumpgate": Jumpgate(root); break;
                case "robotics": Robotics(root); break;
                case "nanite": Nanite(root); break;
                case "matter_mine": Mine(root); break;
                case "helium_well": Helium(root); break;
                case "titan_extractor": Titan(root); break;
                case "uplink": Crystal(root); break;
                case "diamond_forge": Diamond(root); break;
                case "silo": Silo(root); break;
                case "spy_center": Spy(root); break;
                case "beacon": Beacon(root); break;
                case "colony_dock": Dock(root); break;
                case "habitat": Habitat(root); break;
                default: Prims.Box(root, new Vector3(2.4f, 1.2f, 2f), new Vector3(0, 0.7f, 0), Mats.Steel); break;
            }
            return root;
        }

        static void Tower(Transform g, float x, float z, float h, float r, Material accent)
        {
            Prims.Cylinder(g, r, h, new Vector3(x, h * 0.5f + 0.18f, z), Mats.Steel);
            Prims.Cylinder(g, r * 0.92f, 0.12f, new Vector3(x, h * 0.62f, z), accent);
            Prims.Sphere(g, r * 0.18f, new Vector3(x, h + 0.72f, z), accent);
        }

        static void Command(Transform g)
        {
            Prims.Cylinder(g, 2.2f, 0.5f, new Vector3(0, 0.32f, 0), Mats.Dark);
            Prims.Cylinder(g, 1.85f, 1.1f, new Vector3(0, 1.05f, 0), Mats.Steel);
            Prims.Sphere(g, 1.2f, new Vector3(0, 2.05f, 0), Mats.Glass);
            Prims.Torus(g, 1.32f, 0.11f, new Vector3(0, 2.0f, 0), Mats.Cyan, new Vector3(90, 0, 0));
            for (int i = 0; i < 4; i++)
            {
                float a = i * Mathf.PI * 0.5f + Mathf.PI * 0.25f;
                Tower(g, Mathf.Cos(a) * 1.72f, Mathf.Sin(a) * 1.72f, 2.15f, 0.3f, Mats.Cyan);
            }
        }

        static void Citadel(Transform g)
        {
            Prims.Box(g, new Vector3(3.35f, 0.7f, 2.7f), new Vector3(0, 0.55f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(1.6f, 1.4f, 1.45f), new Vector3(0, 1.4f, 0), Mats.Dark);
            Prims.Cone(g, 0.7f, 0.75f, new Vector3(0, 2.45f, 0), Mats.Red);
            foreach (var p in new[] { new Vector2(-1.25f, -0.9f), new Vector2(1.25f, -0.9f), new Vector2(-1.25f, 0.9f), new Vector2(1.25f, 0.9f) })
                Tower(g, p.x, p.y, 2.05f, 0.48f, Mats.Red);
        }

        static void Archive(Transform g)
        {
            Prims.Box(g, new Vector3(3f, 0.65f, 2.2f), new Vector3(0, 0.5f, 0), Mats.Steel);
            Tower(g, -1f, 0, 2.15f, 0.54f, Mats.Blue);
            Tower(g, 1f, 0, 2.15f, 0.54f, Mats.Violet);
            Prims.Sphere(g, 0.55f, new Vector3(0, 1.42f, 0), Mats.Glass);
            Prims.Torus(g, 0.72f, 0.07f, new Vector3(0, 1.42f, 0), Mats.Cyan);
        }

        static void DefenseHub(Transform g)
        {
            Prims.Box(g, new Vector3(3.4f, 0.75f, 2.45f), new Vector3(0, 0.55f, 0), Mats.Steel);
            Prims.Cylinder(g, 1.15f, 0.8f, new Vector3(0, 1.12f, 0), Mats.Dark);
            Prims.Cylinder(g, 0.14f, 1.55f, new Vector3(-0.52f, 2.0f, -0.25f), Mats.Trim, new Vector3(64f, 0, 0));
            Prims.Cylinder(g, 0.14f, 1.55f, new Vector3(0.52f, 2.0f, -0.25f), Mats.Trim, new Vector3(64f, 0, 0));
            Prims.Torus(g, 1.12f, 0.09f, new Vector3(0, 1.45f, 0), Mats.Red, new Vector3(90, 0, 0));
        }

        static void Shipyard(Transform g)
        {
            Prims.Cylinder(g, 2.35f, 0.25f, new Vector3(0, 0.13f, 0), Mats.Dark);
            Prims.Box(g, new Vector3(0.36f, 1.7f, 3.2f), new Vector3(-1.65f, 1.04f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(0.36f, 1.7f, 3.2f), new Vector3(1.65f, 1.04f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(3.65f, 0.34f, 0.42f), new Vector3(0, 1.78f, 1.25f), Mats.Trim);
            Prims.Cone(g, 0.52f, 2.5f, new Vector3(0, 1.05f, 0.2f), Mats.Trim, 8, new Vector3(90, 0, 0));
            Prims.Box(g, new Vector3(2.05f, 0.12f, 0.5f), new Vector3(0, 1.25f, 0.1f), Mats.Steel);
        }

        static void Energy(Transform g)
        {
            Prims.Box(g, new Vector3(3.1f, 0.55f, 2.5f), new Vector3(0, 0.45f, 0), Mats.Steel);
            foreach (var p in new[] { new Vector2(-1f, -0.65f), new Vector2(1f, -0.65f), new Vector2(-1f, 0.65f), new Vector2(1f, 0.65f) })
                Tower(g, p.x, p.y, 1.8f, 0.38f, Mats.Green);
            Prims.Sphere(g, 0.72f, new Vector3(0, 1.7f, 0), Mats.Green);
            Prims.Torus(g, 1.02f, 0.09f, new Vector3(0, 1.7f, 0), Mats.Trim);
        }

        static void Fusion(Transform g)
        {
            Prims.Cylinder(g, 2.0f, 0.48f, new Vector3(0, 0.25f, 0), Mats.Dark);
            Prims.Cylinder(g, 0.85f, 2.2f, new Vector3(0, 1.48f, 0), Mats.Steel);
            Prims.Torus(g, 1.22f, 0.11f, new Vector3(0, 1.25f, 0), Mats.Cyan, new Vector3(90, 0, 0));
            Prims.Torus(g, 1.22f, 0.11f, new Vector3(0, 1.77f, 0), Mats.Green, new Vector3(90, 0, 0));
            Prims.Torus(g, 1.22f, 0.11f, new Vector3(0, 2.29f, 0), Mats.Cyan, new Vector3(90, 0, 0));
            Prims.Sphere(g, 0.45f, new Vector3(0, 1.75f, 0), Mats.Green);
        }

        static void Shield(Transform g)
        {
            Prims.Box(g, new Vector3(2.8f, 0.55f, 2.4f), new Vector3(0, 0.45f, 0), Mats.Steel);
            foreach (var p in new[] { new Vector2(-1f, -0.75f), new Vector2(1f, -0.75f), new Vector2(-1f, 0.75f), new Vector2(1f, 0.75f) })
            {
                Tower(g, p.x, p.y, 1.25f, 0.28f, Mats.Cyan);
                Prims.Cone(g, 0.28f, 0.5f, new Vector3(p.x, 1.9f, p.y), Mats.Cyan);
            }
            Prims.Sphere(g, 1.65f, new Vector3(0, 0.7f, 0), Mats.Shield);
        }

        static void Quantum(Transform g)
        {
            Prims.Box(g, new Vector3(2.8f, 0.6f, 2.2f), new Vector3(0, 0.48f, 0), Mats.Steel);
            Tower(g, -0.85f, 0, 2.4f, 0.55f, Mats.Violet);
            Tower(g, 0.85f, 0, 1.8f, 0.65f, Mats.Cyan);
            Prims.Sphere(g, 0.5f, new Vector3(0.85f, 2.55f, 0), Mats.Violet);
        }

        static void Jumpgate(Transform g)
        {
            Prims.Cylinder(g, 2.1f, 0.25f, new Vector3(0, 0.13f, 0), Mats.Dark);
            Prims.Torus(g, 1.65f, 0.25f, new Vector3(0, 1.92f, 0), Mats.Steel);
            Prims.Torus(g, 1.38f, 0.07f, new Vector3(0, 1.92f, 0), Mats.Cyan);
            Prims.Box(g, new Vector3(0.55f, 1.2f, 0.8f), new Vector3(-1.65f, 0.65f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(0.55f, 1.2f, 0.8f), new Vector3(1.65f, 0.65f, 0), Mats.Steel);
            Prims.Sphere(g, 1.15f, new Vector3(0, 1.92f, 0), Mats.Portal);
        }

        static void Robotics(Transform g)
        {
            Prims.Box(g, new Vector3(3.1f, 0.8f, 2.5f), new Vector3(0, 0.55f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(1.15f, 1.3f, 1.25f), new Vector3(-0.75f, 1.3f, 0), Mats.Dark);
            Tower(g, 1f, 0, 1.75f, 0.48f, Mats.Amber);
            foreach (var x in new[] { -1.3f, 0f, 1.3f })
                Prims.Cylinder(g, 0.14f, 1.25f, new Vector3(x, 1.65f, 0.1f), Mats.Trim, new Vector3(0, 0, 35));
        }

        static void Nanite(Transform g)
        {
            Prims.Box(g, new Vector3(2.9f, 0.55f, 2.3f), new Vector3(0, 0.45f, 0), Mats.Steel);
            for (int i = 0; i < 6; i++)
            {
                float a = i * Mathf.PI / 3f;
                Prims.Sphere(g, 0.48f, new Vector3(Mathf.Cos(a) * 1.05f, 1.18f, Mathf.Sin(a) * 0.82f), i % 2 == 0 ? Mats.Violet : Mats.Cyan);
            }
            Prims.Cylinder(g, 0.65f, 1.8f, new Vector3(0, 1.3f, 0), Mats.Glass);
        }

        static void Mine(Transform g)
        {
            Prims.Cylinder(g, 1.95f, 0.24f, new Vector3(0, 0.13f, 0), Mats.Dark);
            Prims.Box(g, new Vector3(1.65f, 0.85f, 1.45f), new Vector3(-0.55f, 0.65f, 0), Mats.Steel);
            Prims.Cone(g, 0.42f, 2.2f, new Vector3(0.85f, 1.05f, -0.15f), Mats.Trim, 10, new Vector3(0, 0, -55));
            Prims.Sphere(g, 0.35f, new Vector3(-1.4f, 0.35f, 0.8f), Mats.Ore);
            Prims.Sphere(g, 0.35f, new Vector3(-1.05f, 0.35f, 1.1f), Mats.Ore);
            Prims.Box(g, new Vector3(2.1f, 0.18f, 0.5f), new Vector3(0.2f, 0.48f, 1.1f), Mats.Amber);
        }

        static void Helium(Transform g)
        {
            Prims.Cylinder(g, 1.85f, 0.22f, new Vector3(0, 0.12f, 0), Mats.Dark);
            Prims.Cylinder(g, 0.54f, 1.65f, new Vector3(-0.72f, 1.02f, 0), Mats.Steel);
            Prims.Cylinder(g, 0.54f, 1.65f, new Vector3(0.72f, 1.02f, 0), Mats.Steel);
            Prims.Torus(g, 0.51f, 0.06f, new Vector3(-0.72f, 1.28f, 0), Mats.Green, new Vector3(90, 0, 0));
            Prims.Torus(g, 0.51f, 0.06f, new Vector3(0.72f, 1.28f, 0), Mats.Green, new Vector3(90, 0, 0));
            Prims.Box(g, new Vector3(1.5f, 0.16f, 0.18f), new Vector3(0, 1.85f, 0.1f), Mats.Trim);
        }

        static void Titan(Transform g)
        {
            Prims.Box(g, new Vector3(2.8f, 0.5f, 2.25f), new Vector3(0, 0.42f, 0), Mats.Steel);
            Tower(g, -0.9f, 0, 2.2f, 0.35f, Mats.Amber);
            Prims.Box(g, new Vector3(2.4f, 0.24f, 0.3f), new Vector3(0.35f, 2.0f, 0), Mats.Trim, new Vector3(0, 0, -12));
            Prims.Box(g, new Vector3(0.2f, 1.5f, 0.2f), new Vector3(1.48f, 1.32f, 0), Mats.Amber);
        }

        static void Crystal(Transform g)
        {
            Prims.Cylinder(g, 1.85f, 0.25f, new Vector3(0, 0.13f, 0), Mats.Dark);
            Prims.Cone(g, 0.42f, 2.8f, new Vector3(0, 1.6f, 0), Mats.Violet, 6);
            Prims.Cone(g, 0.36f, 1.9f, new Vector3(-0.8f, 1.15f, 0.35f), Mats.Violet, 6);
            Prims.Cone(g, 0.36f, 2.15f, new Vector3(0.82f, 1.28f, 0.42f), Mats.Cyan, 6);
            Prims.Cone(g, 0.3f, 1.45f, new Vector3(-0.45f, 0.93f, -0.68f), Mats.Violet, 6);
            Prims.Torus(g, 1.45f, 0.08f, new Vector3(0, 0.45f, 0), Mats.Cyan, new Vector3(90, 0, 0));
        }

        static void Diamond(Transform g)
        {
            Prims.Box(g, new Vector3(2.9f, 0.75f, 2.4f), new Vector3(0, 0.55f, 0), Mats.Steel);
            Prims.Cylinder(g, 1.05f, 1.55f, new Vector3(0, 1.34f, 0), Mats.Dark);
            Prims.Torus(g, 1.0f, 0.12f, new Vector3(0, 1.55f, 0), Mats.Amber, new Vector3(90, 0, 0));
            Prims.Octahedron(g, 0.62f, new Vector3(0, 2.5f, 0), Mats.Violet);
        }

        static void Silo(Transform g)
        {
            Prims.Cylinder(g, 2.0f, 0.22f, new Vector3(0, 0.12f, 0), Mats.Dark);
            foreach (var s in new[] { new Vector3(-0.8f, 1.9f, -0.55f), new Vector3(0.8f, 2.25f, -0.55f), new Vector3(-0.8f, 1.5f, 0.65f), new Vector3(0.8f, 1.75f, 0.65f) })
            {
                Prims.Cylinder(g, 0.5f, s.y, new Vector3(s.x, s.y * 0.5f + 0.22f, s.z), Mats.Steel);
                Prims.Cone(g, 0.47f, 0.55f, new Vector3(s.x, s.y + 0.5f, s.z), Mats.Trim);
            }
        }

        static void Spy(Transform g)
        {
            Prims.Box(g, new Vector3(2.65f, 0.55f, 2.15f), new Vector3(0, 0.45f, 0), Mats.Steel);
            Prims.Box(g, new Vector3(1.2f, 1.35f, 1.1f), new Vector3(0, 1.18f, 0), Mats.Dark);
            Prims.Sphere(g, 0.55f, new Vector3(0, 2.35f, 0), Mats.Violet);
            Prims.Cone(g, 0.26f, 1.2f, new Vector3(-0.82f, 1.25f, 0.2f), Mats.Violet);
            Prims.Cone(g, 0.26f, 1.2f, new Vector3(0.82f, 1.25f, 0.2f), Mats.Violet);
        }

        static void Beacon(Transform g)
        {
            Prims.Cylinder(g, 1.4f, 0.32f, new Vector3(0, 0.17f, 0), Mats.Dark);
            for (int i = 0; i < 4; i++)
                Prims.Cylinder(g, 0.42f - i * 0.07f, 0.65f, new Vector3(0, 0.66f + i * 0.55f, 0), i % 2 == 0 ? Mats.Steel : Mats.Trim);
            Prims.Torus(g, 0.72f, 0.08f, new Vector3(0, 2.38f, 0), Mats.Cyan, new Vector3(90, 0, 0));
            Prims.Sphere(g, 0.28f, new Vector3(0, 2.72f, 0), Mats.Cyan);
        }

        static void Dock(Transform g)
        {
            Prims.Cylinder(g, 2.15f, 0.22f, new Vector3(0, 0.12f, 0), Mats.Dark);
            Prims.Torus(g, 1.65f, 0.08f, new Vector3(0, 0.27f, 0), Mats.Cyan, new Vector3(90, 0, 0));
            Tower(g, -1.55f, 0.55f, 1.25f, 0.3f, Mats.Cyan);
            Tower(g, 1.55f, 0.55f, 1.25f, 0.3f, Mats.Cyan);
            Prims.Cone(g, 0.42f, 1.9f, new Vector3(0, 0.8f, 0), Mats.Steel, 6, new Vector3(90, 0, 0));
        }

        static void Habitat(Transform g)
        {
            Prims.Cylinder(g, 2.0f, 0.22f, new Vector3(0, 0.12f, 0), Mats.Dark);
            Prims.Sphere(g, 0.8f, new Vector3(-0.75f, 0.55f, 0), Mats.Glass);
            Prims.Sphere(g, 0.7f, new Vector3(0.72f, 0.5f, 0.15f), Mats.Glass);
            Prims.Sphere(g, 0.55f, new Vector3(0, 0.45f, -0.78f), Mats.Green);
            Prims.Box(g, new Vector3(2.1f, 0.16f, 0.3f), new Vector3(0, 0.25f, 0.5f), Mats.Trim);
        }
    }
}
