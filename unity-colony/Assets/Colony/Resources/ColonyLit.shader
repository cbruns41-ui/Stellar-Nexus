Shader "Colony/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Emission ("Emission", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            fixed4 _Emission;
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; float3 normal : TEXCOORD0; };
            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.normal = UnityObjectToWorldNormal(v.normal);
                return o;
            }
            fixed4 frag(v2f i) : SV_Target
            {
                float3 n = normalize(i.normal);
                float wrap = saturate(dot(n, normalize(float3(0.35, 0.92, 0.28))) * 0.62 + 0.38);
                float fill = saturate(dot(n, normalize(float3(-0.45, 0.15, -0.7))) * 0.28 + 0.1);
                fixed3 col = _Color.rgb * (wrap + fill) + _Emission.rgb;
                return fixed4(col, 1);
            }
            ENDCG
        }
    }
}
