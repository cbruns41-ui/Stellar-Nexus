Shader "StellarNexus/CombatFinish" {
 Properties { _MainTex("Scene",2D)="white"{} }
 SubShader { Cull Off ZWrite Off ZTest Always
 CGINCLUDE
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Bloom;float4 _Direction;
 float4 threshold(v2f_img i):SV_Target {float3 c=tex2D(_MainTex,i.uv).rgb;float l=max(c.r,max(c.g,c.b));return float4(c*saturate((l-.9)/max(.001,l)),1);}
 float4 blur(v2f_img i):SV_Target {
  float2 d=_Direction.xy;float3 c=tex2D(_MainTex,i.uv).rgb*.227027;
  c+=(tex2D(_MainTex,i.uv+d*1.384615).rgb+tex2D(_MainTex,i.uv-d*1.384615).rgb)*.316216;
  c+=(tex2D(_MainTex,i.uv+d*3.230769).rgb+tex2D(_MainTex,i.uv-d*3.230769).rgb)*.070270;
  return float4(c,1);
 }
 float4 finish(v2f_img i):SV_Target {
  float3 c=tex2D(_MainTex,i.uv).rgb+tex2D(_Bloom,i.uv).rgb*.55;
  c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  float2 p=i.uv*2-1;c*=1-.2*dot(p,p);
  return float4(saturate(c),1);
 }
 ENDCG
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment threshold
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment blur
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment finish
 ENDCG}
 }
}
