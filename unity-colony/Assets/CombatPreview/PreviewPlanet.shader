Shader "StellarNexus/PreviewPlanet" {
 SubShader { Tags { "RenderType"="Opaque" } Pass {
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
 struct v2f {float4 vertex:SV_POSITION;float3 normal:TEXCOORD0;float3 world:TEXCOORD1;float3 local:TEXCOORD2;};
 v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.normal=UnityObjectToWorldNormal(v.normal);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.local=v.vertex.xyz;return o;}
 float hash(float3 p){return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453);}
 float noise3(float3 p){float3 a=floor(p),b=frac(p);b=b*b*(3-2*b);return lerp(lerp(lerp(hash(a),hash(a+float3(1,0,0)),b.x),lerp(hash(a+float3(0,1,0)),hash(a+float3(1,1,0)),b.x),b.y),lerp(lerp(hash(a+float3(0,0,1)),hash(a+float3(1,0,1)),b.x),lerp(hash(a+float3(0,1,1)),hash(a+1),b.x),b.y),b.z);}
 float fbm(float3 p){float v=0,amp=.5;for(int k=0;k<5;k++){v+=amp*noise3(p);p=p*2.07+5.12;amp*=.5;}return v;}
 fixed4 frag(v2f i):SV_Target {
  float3 n=normalize(i.normal),view=normalize(_WorldSpaceCameraPos-i.world),p=i.local*9;
  float land=smoothstep(.48,.54,fbm(p)),cloud=smoothstep(.56,.75,fbm(p*2.9+float3(8,2,1)));
  float diffuse=dot(n,normalize(float3(-.7,.8,.4))),lit=.06+.94*saturate(diffuse);
  float3 color=lerp(float3(.009,.045,.095),float3(.085,.17,.145),land)*lit;
  color+=cloud*float3(.4,.49,.5)*lit;
  float cities=step(.74,noise3(p*145))*step(.5,fbm(p*12))*land;
  color+=cities*saturate(-diffuse*4)*float3(.6,.26,.065);
  color+=pow(1-saturate(dot(n,view)),5)*float3(.08,.54,.78);
  return float4(color,1);
 }
 ENDCG
 }}
}
