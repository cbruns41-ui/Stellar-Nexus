Shader "StellarNexus/CombatSky" {
 SubShader {Tags{"Queue"="Background"} ZWrite Off Cull Off Pass {
 CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment frag
 #include "UnityCG.cginc"
 float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
 float noise(float2 p){float2 a=floor(p),b=frac(p);b=b*b*(3-2*b);return lerp(lerp(hash(a),hash(a+float2(1,0)),b.x),lerp(hash(a+float2(0,1)),hash(a+1),b.x),b.y);}
 float4 frag(v2f_img i):SV_Target {
  float2 p=i.uv;float n=0,amp=.5;float2 q=p*6;
  for(int k=0;k<5;k++){n+=amp*noise(q);amp*=.5;q=q*2.1+3.7;}
  float band=exp(-pow((p.y-.58-p.x*.12)*7,2));
  float3 c=float3(.009,.019,.04)+float3(.018,.045,.08)*n*n*band;
  c+=float3(.07,.025,.025)*pow(n,4)*band;
  float2 cell=floor(p*850),uv=frac(p*850)-.5;float h=hash(cell);
  float star=pow(saturate(1-length(uv)*2),12)*step(.998,h);
  c+=star*float3(.7,.88,1)*2;
  return float4(c,1);
 }
 ENDCG
 }}
}
