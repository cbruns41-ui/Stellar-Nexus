using UnityEngine;

namespace Colony
{
    public static class SpaceEnvironment
    {
        public static void Build(Transform parent)
        {
            var ground = SpriteFactory.GroundPlane(56f, 10f, parent);
            ground.localPosition = Vector3.zero;

            var sun = new GameObject("Sun");
            sun.transform.SetParent(parent, false);
            sun.transform.rotation = Quaternion.Euler(90f, 20f, 0f);
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.96f, 0.9f);
            light.intensity = 1.15f;
            light.shadows = LightShadows.None;

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.42f, 0.4f, 0.38f);
            RenderSettings.fog = false;
        }
    }
}
