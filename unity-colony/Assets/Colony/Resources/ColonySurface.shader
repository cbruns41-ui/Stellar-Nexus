Shader "Colony/Surface"
{
    Properties {
        _MainTex ("Approved colony", 2D) = "white" {}
        _Dormant ("Dormant", Float) = 0
        _Active ("Active", Float) = 0
        _Selected ("Selected", Float) = 0
        _Busy ("Upgrade", Float) = 0
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        Cull Off
        Pass {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float _Dormant,_Active,_Selected,_Busy,_ColonyMotion;
            struct appdata { float4 vertex:POSITION; float2 uv:TEXCOORD0; };
            struct v2f { float4 pos:SV_POSITION; float2 uv:TEXCOORD0; };
            v2f vert(appdata v) { v2f o; o.pos=UnityObjectToClipPos(v.vertex); o.uv=v.uv; return o; }
            fixed4 frag(v2f i):SV_Target {
                float2 uv=i.uv;
                // Gentle rising convection in the two distant exhaust plumes.
                float smoke=saturate(1-length((uv-float2(.354,.885))*float2(72,18)))+
                            saturate(1-length((uv-float2(.405,.885))*float2(72,18)));
                uv.x += sin(uv.y*95-_Time.y*.6)*.0007*smoke*_ColonyMotion;
                fixed4 c=tex2D(_MainTex,uv);
                float glow=smoothstep(.45,.82,max(c.r,max(c.g,c.b)));
                c.rgb *= 1-_Dormant*glow*.20;
                float pulse=(.5+.5*sin(_Time.y*2.1))*_ColonyMotion;
                c.rgb += _Active*glow*pulse*.035;
                c.rgb += _Selected*float3(.014,.029,.034);
                float scan=pow(saturate(1-abs(frac(uv.y*2-_Time.y*.075)-.5)*24),2);
                c.rgb += _Busy*scan*float3(.06,.034,.007)*_ColonyMotion;
                return c;
            }
            ENDCG
        }
    }
}
