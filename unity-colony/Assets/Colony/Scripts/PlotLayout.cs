using UnityEngine;

namespace Colony
{
    public readonly struct PlotSpec
    {
        public readonly string Id;
        public readonly string Size;
        public readonly Vector3 Position;
        public PlotSpec(string id, string size, float x, float z)
        {
            Id = id;
            Size = size;
            Position = new Vector3(x, 0f, z);
        }
    }

    public static class PlotLayout
    {
        const float S = 4.6f;

        public static readonly PlotSpec[] All =
        {
            new PlotSpec("citadel", "large", -2f * S, 2f * S),
            new PlotSpec("jumpgate", "medium", -1f * S, 2f * S),
            new PlotSpec("fusion", "medium", 0f, 2f * S),
            new PlotSpec("silo", "medium", 1f * S, 2f * S),
            new PlotSpec("quantum_lab", "medium", 2f * S, 2f * S),

            new PlotSpec("spy_center", "micro", -2f * S, 1f * S),
            new PlotSpec("uplink", "mini", -1f * S, 1f * S),
            new PlotSpec("command", "capital", 0f, 1f * S),
            new PlotSpec("archive", "large", 1f * S, 1f * S),
            new PlotSpec("energy_array", "large", 2f * S, 1f * S),

            new PlotSpec("titan_extractor", "mini", -2f * S, 0f),
            new PlotSpec("helium_well", "mini", -1f * S, 0f),
            new PlotSpec("robotics", "medium", 0f, 0f),
            new PlotSpec("nanite", "medium", 1f * S, 0f),
            new PlotSpec("shipyard", "large", 2f * S, 0f),

            new PlotSpec("matter_mine", "mini", -2f * S, -1f * S),
            new PlotSpec("habitat", "micro", -1f * S, -1f * S),
            new PlotSpec("colony_dock", "micro", 0f, -1f * S),
            new PlotSpec("beacon", "micro", 1f * S, -1f * S),
            new PlotSpec("shield", "medium", 2f * S, -1f * S),

            new PlotSpec("diamond_forge", "mini", -0.7f * S, -2f * S),
            new PlotSpec("defense_hub", "large", 0.7f * S, -2f * S),
        };

        public static float Radius(string size)
        {
            switch (size)
            {
                case "capital": return 2.05f;
                case "large": return 1.75f;
                case "medium": return 1.5f;
                default: return 1.28f;
            }
        }
    }
}
