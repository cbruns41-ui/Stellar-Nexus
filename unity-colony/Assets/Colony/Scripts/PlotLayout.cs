using System;
using UnityEngine;

namespace Colony
{
    [Serializable] public class PlotSpec
    {
        public string id, name, size;
        public float x, y;
        public Vector2[] outline;
        public string Id => id;
        public string Size => size;
        public Vector2 Desk => new Vector2(x, y);
        public Vector2 Mob => Desk;
    }
    public static class PlotLayout
    {
        [Serializable] class Layout { public PlotSpec[] plots; }
        static PlotSpec[] _all;
        public static PlotSpec[] All => _all ?? (_all = JsonUtility.FromJson<Layout>(
            Resources.Load<TextAsset>("colony-layout").text).plots);
        public static float Radius(string size) => size == "capital" ? .055f : size == "large" ? .045f : .032f;
        public static float SpriteScale(string size) => Radius(size) * 2f;
    }
}
