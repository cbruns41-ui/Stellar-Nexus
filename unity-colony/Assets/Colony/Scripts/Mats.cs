using UnityEngine;

namespace Colony
{
    public static class Mats
    {
        public static Material Steel, Dark, Trim, Cyan, Blue, Green, Violet, Amber, Red;
        public static Material Glass, Shield, Portal, Hologram, Pad, Selected, SelectGlow, Road, Ore, Platform, Trail, ShadowBlob;

        static Shader LitShader;
        static Shader UnlitShader;
        static Shader SkyShader;

        public static void Ensure()
        {
            if (Steel != null) return;
            LitShader = Resources.Load<Shader>("ColonyLit") ?? Shader.Find("Colony/Lit") ?? Shader.Find("Unlit/Color");
            UnlitShader = Resources.Load<Shader>("ColonyUnlit") ?? Shader.Find("Colony/Unlit") ?? Shader.Find("Unlit/Color");
            SkyShader = Resources.Load<Shader>("ColonySky") ?? Shader.Find("Colony/Sky") ?? UnlitShader;
            if (LitShader == null) throw new System.Exception("ColonyLit shader missing.");

            Steel = LitCol(new Color(0.22f, 0.30f, 0.34f), Color.black);
            Dark = LitCol(new Color(0.08f, 0.12f, 0.15f), Color.black);
            Trim = LitCol(new Color(0.62f, 0.70f, 0.74f), Color.black);
            Cyan = LitCol(new Color(0.10f, 0.38f, 0.46f), new Color(0.25f, 0.85f, 1f) * 0.55f);
            Blue = LitCol(new Color(0.10f, 0.28f, 0.52f), new Color(0.15f, 0.50f, 0.90f) * 0.4f);
            Green = LitCol(new Color(0.10f, 0.40f, 0.28f), new Color(0.25f, 0.90f, 0.55f) * 0.5f);
            Violet = LitCol(new Color(0.34f, 0.18f, 0.52f), new Color(0.75f, 0.40f, 1f) * 0.5f);
            Amber = LitCol(new Color(0.50f, 0.30f, 0.10f), new Color(1f, 0.62f, 0.22f) * 0.45f);
            Red = LitCol(new Color(0.48f, 0.14f, 0.16f), new Color(1f, 0.30f, 0.28f) * 0.4f);
            Glass = LitCol(new Color(0.28f, 0.62f, 0.74f), new Color(0.15f, 0.45f, 0.55f) * 0.35f);
            Shield = UnlitCol(new Color(0.21f, 0.80f, 1f, 0.18f));
            Portal = UnlitCol(new Color(0.31f, 0.92f, 1f, 0.40f));
            Hologram = UnlitCol(new Color(0.33f, 0.92f, 1f, 0.70f));
            Pad = LitCol(new Color(0.12f, 0.20f, 0.24f), Color.black);
            Selected = LitCol(new Color(0.14f, 0.46f, 0.56f), new Color(0.25f, 0.90f, 1f) * 0.7f);
            SelectGlow = UnlitCol(new Color(0.22f, 0.92f, 1f, 0.32f));
            Road = LitCol(new Color(0.07f, 0.10f, 0.12f), Color.black);
            Ore = LitCol(new Color(0.42f, 0.46f, 0.48f), Color.black);
            Platform = LitCol(new Color(0.28f, 0.32f, 0.36f), Color.black);
            var trailSh = Resources.Load<Shader>("ColonyTrail") ?? Shader.Find("Colony/Trail") ?? UnlitShader;
            Trail = new Material(trailSh);
            if (Trail.HasProperty("_Color")) Trail.SetColor("_Color", new Color(0.4f, 0.92f, 1f, 1f));
            ShadowBlob = UnlitCol(new Color(0f, 0f, 0f, 0.38f));
        }

        public static Material Sky(Texture tex)
        {
            Ensure();
            var m = new Material(SkyShader != null ? SkyShader : UnlitShader);
            if (tex && m.HasProperty("_MainTex")) m.SetTexture("_MainTex", tex);
            if (m.HasProperty("_Color")) m.SetColor("_Color", Color.white);
            return m;
        }

        static Material LitCol(Color color, Color emission)
        {
            var m = new Material(LitShader);
            if (m.HasProperty("_Color")) m.SetColor("_Color", color);
            if (m.HasProperty("_Emission")) m.SetColor("_Emission", emission);
            return m;
        }

        static Material UnlitCol(Color color)
        {
            var m = new Material(UnlitShader != null ? UnlitShader : LitShader);
            if (m.HasProperty("_Color")) m.SetColor("_Color", color);
            return m;
        }
    }
}
