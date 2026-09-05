Shader "Colony/Pad"
{
    Properties
    {
        _Glow ("Glow", Color) = (0.28, 0.92, 1, 1)
        _Fill ("Fill", Color) = (0.04, 0.28, 0.38, 0.18)
        _Selected ("Selected", Float) = 0
        _Busy ("Busy", Float) = 0
        _Locked ("Locked", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha One
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _Glow;
            fixed4 _Fill;
            float _Selected;
            float _Busy;
            float _Locked;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 p = i.uv * 2 - 1;
                float r = length(p);
                if (r > 1.02) discard;

                float t = _Time.y;
                float spin = t * (1.15 + _Busy * 1.6);
                float ang = atan2(p.y, p.x);
                float dash = saturate(0.55 + 0.45 * sin(ang * 10.0 - spin * 2.4));
                float dash2 = saturate(0.4 + 0.6 * sin(ang * 7.0 + spin * 1.6));

                float ring1 = 1.0 - smoothstep(0.018, 0.055, abs(r - 0.78));
                float ring2 = 1.0 - smoothstep(0.012, 0.04, abs(r - 0.52));
                float ring3 = 1.0 - smoothstep(0.01, 0.032, abs(r - 0.28));
                float core = saturate(1.0 - r / 0.22) * (0.22 + 0.18 * sin(t * 3.1));
                float sweep = saturate(1.0 - abs(frac(ang / 6.2831853 - frac(spin * 0.12)) - 0.5) * 6.0) * saturate(1.0 - r);
                float pulse = 0.72 + 0.28 * sin(t * (2.2 + _Busy * 2.0));
                float sel = 1.0 + _Selected * 0.85;
                float lock = lerp(1.0, 0.35, _Locked);

                float a = (ring1 * dash + ring2 * dash2 + ring3 * 0.65 + core + sweep * 0.35) * pulse * sel * lock;
                a *= smoothstep(1.0, 0.9, r);
                fixed3 col = lerp(_Fill.rgb, _Glow.rgb, saturate(a));
                col = lerp(col, fixed3(0.55, 0.72, 0.78), _Locked * 0.45);
                return fixed4(col, a * (0.78 + _Selected * 0.22 + _Busy * 0.12));
            }
            ENDCG
        }
    }
}
