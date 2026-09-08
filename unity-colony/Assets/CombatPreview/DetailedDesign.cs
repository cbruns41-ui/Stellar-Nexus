using UnityEngine;
using UnityEngine.Rendering;
using System.Collections.Generic;

namespace StellarNexus.Preview {
 public partial class CombatPreviewScene {
  [SerializeField] bool detailed;
  [SerializeField] Transform turretHead,coreRotor,reticle;
  [SerializeField] List<Transform> rotors=new List<Transform>();
  [SerializeField] List<Vector3> flightOrigins=new List<Vector3>();
  [SerializeField] List<LineRenderer> discharges=new List<LineRenderer>();
  [SerializeField] List<Transform> sparks=new List<Transform>();
  [SerializeField] TextMesh hitCounter;
  [SerializeField] Light reactorLight;
  [SerializeField] int hits;
  float lastShot=-10,aimX,aimY;
  Vector2 aimScreen=new Vector2(.5f,.6f);
  Vector3 shotEnd;
  bool hasShot,lastHit;
  Material bronze,lightMetal,glass,hot;
  Transform MakeGroup(string name,Transform parent,Vector3 position) {var go=new GameObject(name).transform;go.SetParent(parent,false);go.localPosition=position;return go;}
  void BuildDetailed() {
   detailed=true;Random.InitState(73);
   armor=Mat("Ceramic titanium",new Color(.13f,.21f,.25f),.48f,.62f);
   trim=Mat("Machined steel",new Color(.48f,.56f,.6f),.65f,.73f);
   dark=Mat("Gunmetal",new Color(.027f,.041f,.053f),.4f,.55f);
   pale=Mat("Ivory ceramic",new Color(.68f,.7f,.67f),.23f,.6f);
   bronze=Mat("Heat stressed copper",new Color(.35f,.17f,.075f),.55f,.57f);
   lightMetal=Mat("Cool titanium",new Color(.2f,.32f,.38f),.6f,.7f);
   glass=Mat("Obsidian canopy",new Color(.012f,.11f,.15f),.8f,.94f);
   cyan=Mat("Ion emission",new Color(.02f,.65f,.9f),0,.5f,true);
   orange=Mat("Reactor emission",new Color(1,.12f,.014f),0,.5f,true);
   hot=Mat("Plasma white",new Color(.45f,.85f,1),0,.5f,true);hot.SetColor("_EmissionColor",new Color(2,5,7));
   orange.SetColor("_EmissionColor",new Color(3,.32f,.025f));cyan.SetColor("_EmissionColor",new Color(.03f,2.1f,3));
   var surface=PanelTexture();foreach(var m in new[]{armor,trim,dark,pale,bronze,lightMetal}){m.mainTexture=surface;m.mainTextureScale=new Vector2(1,1);}
   WorldCamera=new GameObject("CombatCamera").AddComponent<Camera>();WorldCamera.transform.SetParent(transform);
   WorldCamera.transform.position=new Vector3(.25f,5.3f,14);WorldCamera.transform.LookAt(new Vector3(0,3.8f,-9));
   WorldCamera.fieldOfView=46;WorldCamera.nearClipPlane=.1f;WorldCamera.farClipPlane=280;WorldCamera.allowHDR=true;WorldCamera.allowMSAA=true;
   WorldCamera.clearFlags=CameraClearFlags.SolidColor;WorldCamera.backgroundColor=new Color(.006f,.012f,.023f);WorldCamera.cullingMask=~(1<<5);
   WorldCamera.gameObject.AddComponent<CombatFinish>().FinishShader=Shader.Find("StellarNexus/CombatFinish");
   RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.27f,.37f,.47f);RenderSettings.ambientEquatorColor=new Color(.11f,.14f,.19f);RenderSettings.ambientGroundColor=new Color(.035f,.045f,.055f);
   RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflectionTexture=Reflection();RenderSettings.reflectionIntensity=.85f;
   var key=new GameObject("Cold key light").AddComponent<Light>();key.transform.SetParent(transform);key.type=LightType.Directional;key.transform.rotation=Quaternion.Euler(32,150,0);key.color=new Color(.65f,.81f,1);key.intensity=2.2f;key.shadows=LightShadows.Soft;key.shadowBias=.035f;
   var rim=new GameObject("Warm edge light").AddComponent<Light>();rim.transform.SetParent(transform);rim.type=LightType.Directional;rim.transform.rotation=Quaternion.Euler(14,-28,0);rim.color=new Color(1,.39f,.15f);rim.intensity=.9f;
   Shape("Procedural deep space",PrimitiveType.Quad,new Vector3(0,30,-155),new Vector3(225,190,1),new Material(Shader.Find("StellarNexus/CombatSky")));
   var planet=Shape("Planet",PrimitiveType.Sphere,new Vector3(14,-59,-95),Vector3.one*121,new Material(Shader.Find("StellarNexus/PreviewPlanet")));planet.GetComponent<MeshFilter>().sharedMesh=SmoothSphere();
   DetailedDeck();
   if(Boss)DetailedBoss();else {
    Vector3[] paths={new Vector3(-2.6f,5.2f,-8),new Vector3(2.45f,6.65f,-14),new Vector3(-3.7f,7.7f,-24),new Vector3(.45f,7.9f,-31)};
    for(int i=0;i<paths.Length;i++){var ship=DetailedFighter(paths[i],i==0);drones.Add(ship);flightOrigins.Add(paths[i]);}
   }
   DetailedTurret();BuildHud();RefineHud();
   Physics.SyncTransforms();SetPose(1.2f);
  }
  Mesh SmoothSphere() {
   const int segments=128,rings=64;var v=new List<Vector3>();var n=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
   for(int y=0;y<=rings;y++)for(int x=0;x<=segments;x++){
    float a=x*Mathf.PI*2/segments,b=y*Mathf.PI/rings;var p=new Vector3(Mathf.Sin(b)*Mathf.Cos(a),Mathf.Cos(b),Mathf.Sin(b)*Mathf.Sin(a));v.Add(p*.5f);n.Add(p);uv.Add(new Vector2(x/(float)segments,y/(float)rings));
   }
   for(int y=0;y<rings;y++)for(int x=0;x<segments;x++){int i=y*(segments+1)+x;triangles.AddRange(new[]{i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1});}
   var mesh=new Mesh{name="Smooth planet sphere"};mesh.SetVertices(v);mesh.SetNormals(n);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);mesh.RecalculateBounds();return mesh;
  }
  Texture2D PanelTexture() {
   const int size=256;var t=new Texture2D(size,size,TextureFormat.RGB24,true){name="Machined panel finish",wrapMode=TextureWrapMode.Repeat,anisoLevel=4};var p=new Color[size*size];
   for(int y=0;y<size;y++)for(int x=0;x<size;x++){
    float v=.86f+Mathf.PerlinNoise(x*.65f,y*.65f)*.13f;
    if(x%128<2||y%128<2)v*=.3f;if(x%128==3||y%128==3)v=1;
    if(y%41==0 && x%127>72)v*=.62f;
    float dx=x%128-8,dy=y%128-8;if(dx*dx+dy*dy<7)v=.44f;
    p[y*size+x]=new Color(v,v,v);
   }t.SetPixels(p);t.Apply();return t;
  }
  Cubemap Reflection(){
   var c=new Cubemap(32,TextureFormat.RGB24,true){name="Studio space reflection"};
   for(int face=0;face<6;face++){var p=new Color[32*32];for(int y=0;y<32;y++)for(int x=0;x<32;x++){
    float a=y/31f;Color col=Color.Lerp(new Color(.035f,.045f,.07f),new Color(.36f,.48f,.59f),a);
    if(face==2)col*=1.5f;if(face==3)col*=.17f;if(face==1)col=Color.Lerp(col,new Color(.52f,.29f,.14f),.35f);
    p[y*32+x]=col;
   }c.SetPixels(p,(CubemapFace)face);}c.Apply();return c;
  }
  // Extruded convex panels with sloping bevel faces and individual face normals.
  GameObject Plate(string name,Vector3 pos,Vector3 size,Material mat,Transform parent=null,float cut=.16f) {
   float x=size.x*.5f,z=size.z*.5f,b=Mathf.Min(x,z)*cut;
   Vector2[] outline={new Vector2(-x+b,-z),new Vector2(x-b,-z),new Vector2(x,-z+b),new Vector2(x,z-b),new Vector2(x-b,z),new Vector2(-x+b,z),new Vector2(-x,z-b),new Vector2(-x,-z+b)};
   var vertices=new List<Vector3>();var uv=new List<Vector2>();var tris=new List<int>();
   System.Action<Vector3,Vector3,Vector3> triangle=(a,c,d)=>{int n=vertices.Count;vertices.Add(a);vertices.Add(c);vertices.Add(d);uv.Add(new Vector2(a.x/size.x+.5f,a.z/size.z+.5f));uv.Add(new Vector2(c.x/size.x+.5f,c.z/size.z+.5f));uv.Add(new Vector2(d.x/size.x+.5f,d.z/size.z+.5f));tris.AddRange(new[]{n,n+1,n+2});};
   float h=size.y*.5f,edge=Mathf.Min(size.y*.23f,Mathf.Min(x,z)*.22f);
   for(int i=0;i<8;i++){int j=(i+1)%8;Vector3 a=new Vector3(outline[i].x,h-edge,outline[i].y),b0=new Vector3(outline[j].x,h-edge,outline[j].y);
    Vector3 at=new Vector3(a.x*.9f,h,a.z*.9f),bt=new Vector3(b0.x*.9f,h,b0.z*.9f),ad=new Vector3(a.x,-h,a.z),bd=new Vector3(b0.x,-h,b0.z);
    triangle(Vector3.up*h,bt,at);triangle(at,bt,b0);triangle(at,b0,a);triangle(a,b0,bd);triangle(a,bd,ad);triangle(Vector3.down*h,ad,bd);
   }
   var mesh=new Mesh{name=name};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(tris,0);mesh.RecalculateNormals();mesh.RecalculateBounds();
   var go=new GameObject(name);go.transform.SetParent(parent?parent:transform,false);go.transform.localPosition=pos;go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=mat;return go;
  }
  void Cylinder(string name,Vector3 a,Vector3 b,float radius,Material mat,Transform parent){var go=Shape(name,PrimitiveType.Cylinder,(a+b)*.5f,new Vector3(radius*2,Vector3.Distance(a,b)*.5f,radius*2),mat,parent);go.transform.localRotation=Quaternion.FromToRotation(Vector3.up,b-a);}
  void Torus(string name,float radius,float tube,Vector3 center,Material mat,Transform parent,int segments=64){
   int rings=8;var v=new List<Vector3>();var u=new List<Vector2>();var triangles=new List<int>();
   for(int i=0;i<=segments;i++)for(int j=0;j<=rings;j++){float a=i*Mathf.PI*2/segments,b=j*Mathf.PI*2/rings;v.Add(new Vector3(Mathf.Cos(a)*(radius+tube*Mathf.Cos(b)),Mathf.Sin(a)*(radius+tube*Mathf.Cos(b)),tube*Mathf.Sin(b)));u.Add(new Vector2(i/(float)segments,j/(float)rings));}
   for(int i=0;i<segments;i++)for(int j=0;j<rings;j++){int n=i*(rings+1)+j;triangles.AddRange(new[]{n,n+rings+1,n+1,n+1,n+rings+1,n+rings+2});}
   var m=new Mesh{name=name};m.SetVertices(v);m.SetUVs(0,u);m.SetTriangles(triangles,0);m.RecalculateNormals();
   var go=new GameObject(name);go.transform.SetParent(parent,false);go.transform.localPosition=center;go.AddComponent<MeshFilter>().sharedMesh=m;go.AddComponent<MeshRenderer>().sharedMaterial=mat;
  }
  void DetailedDeck(){
   var deck=MakeGroup("Station superstructure",transform,Vector3.zero);
   for(int side=-1;side<=1;side+=2){
    Plate("Foundation",new Vector3(side*5,-.7f,-10),new Vector3(5,.9f,40),dark,deck);
    for(int i=0;i<12;i++){
     float z=7-i*3.1f;Plate("Interlocking deck",new Vector3(side*4.5f,-.18f,z),new Vector3(3.3f,.2f,2.9f),armor,deck,.07f);
     Box("Deck groove",new Vector3(side*4.5f,-.065f,z),new Vector3(2.9f,.01f,.03f),dark,deck);
     Plate("Rail support",new Vector3(side*3,-.07f,z),new Vector3(.24f,.35f,.85f),trim,deck);
     Box("Navigation strip",new Vector3(side*3,.12f,z),new Vector3(.06f,.05f,.5f),cyan,deck);
     Plate("Outer blast wall",new Vector3(side*6,.38f,z),new Vector3(.65f,1.2f,2.9f),dark,deck);
     Plate("Blast-wall facing",new Vector3(side*5.65f,.42f,z),new Vector3(.18f,.85f,2.35f),lightMetal,deck);
     Cylinder("Hydraulic pipe",new Vector3(side*5.42f,.3f,z-1.2f),new Vector3(side*5.42f,.3f,z+1.2f),.045f,bronze,deck);
     for(int k=0;k<3;k++)Box("Caution marking",new Vector3(side*5.5f,.95f,z-.7f+k*.55f),new Vector3(.3f,.025f,.18f),pale,deck);
    }
    for(int i=0;i<3;i++){
     float z=-17-i*11;Plate("Defense station",new Vector3(side*(9+i*3),.3f,z),new Vector3(3,2.4f,5),dark,deck);
     for(int j=0;j<5;j++)Box("Service window",new Vector3(side*(9+i*3),1.58f,z-1.6f+j*.65f),new Vector3(1.4f,.03f,.13f),cyan,deck);
    }
   }Batch(deck);
  }
  Transform DetailedFighter(Vector3 pos,bool hero){
   var root=MakeGroup("Raptor interceptor",transform,pos);
   Plate("Fuselage",Vector3.zero,new Vector3(.78f,.4f,3.15f),armor,root,.4f);
   Plate("Long nose",new Vector3(0,-.07f,1.68f),new Vector3(.43f,.22f,1.3f),pale,root,.85f);
   Plate("Cockpit frame",new Vector3(0,.28f,.4f),new Vector3(.63f,.27f,1.25f),trim,root,.45f);
   Plate("Canopy",new Vector3(0,.42f,.43f),new Vector3(.47f,.18f,.94f),glass,root,.5f);
   Box("Canopy spine",new Vector3(0,.52f,.43f),new Vector3(.027f,.03f,.78f),pale,root);
   for(int side=-1;side<=1;side+=2){
    var wing=Plate("Swept armor wing",new Vector3(side*1.0f,-.05f,-.3f),new Vector3(1.7f,.17f,1.9f),lightMetal,root,.6f);wing.transform.localRotation=Quaternion.Euler(0,side*26,side*-6);
    Plate("Wing upper plating",new Vector3(side*1.1f,.09f,-.4f),new Vector3(.63f,.09f,1.15f),pale,root,.5f);
    Cylinder("Engine nacelle",new Vector3(side*.7f,-.12f,-.5f),new Vector3(side*.7f,-.12f,-1.9f),.24f,dark,root);
    for(int k=0;k<6;k++)Torus("Engine fin",.26f,.025f,new Vector3(side*.7f,-.12f,-.7f-k*.2f),trim,root,20);
    Torus("Engine exit ring",.23f,.055f,new Vector3(side*.7f,-.12f,-1.92f),bronze,root,24);
    Shape("Engine core",PrimitiveType.Sphere,new Vector3(side*.7f,-.12f,-1.96f),new Vector3(.3f,.3f,.11f),cyan,root);
    Shape("Ion exhaust",PrimitiveType.Sphere,new Vector3(side*.7f,-.12f,-2.48f),new Vector3(.16f,.16f,1.02f),cyan,root);
    Cylinder("Wing gun",new Vector3(side*1.65f,-.03f,-.05f),new Vector3(side*1.65f,-.03f,1.05f),.055f,trim,root);
    Box("Wingtip signal",new Vector3(side*1.9f,0,-.2f),new Vector3(.11f,.07f,.24f),orange,root);
    Plate("Vertical stabilizer",new Vector3(side*.39f,.5f,-1.1f),new Vector3(.07f,.8f,.7f),armor,root);
    for(int j=0;j<4;j++)Box("Intake",new Vector3(side*.43f,.22f,-.5f-j*.18f),new Vector3(.14f,.06f,.055f),dark,root);
   }
   root.localRotation=Quaternion.Euler(-9,149,hero?-17:12);root.localScale=Vector3.one*(hero?1.25f:.88f);Batch(root);
   var collider=root.gameObject.AddComponent<BoxCollider>();collider.size=new Vector3(3.9f,1.5f,4.3f);collider.center=new Vector3(0,0,-.1f);return root;
  }
  void DetailedBoss(){
   target=MakeGroup("Leviathan siege construct",transform,new Vector3(0,5.8f,-13));
   Shape("Armored core body",PrimitiveType.Sphere,Vector3.zero,new Vector3(4.8f,4.6f,2.9f),dark,target);
   coreRotor=MakeGroup("Rotating core armor",target,new Vector3(0,0,1.7f));rotors.Add(coreRotor);
   Torus("Outer armored ring",1.86f,.22f,Vector3.zero,armor,coreRotor);
   Torus("Machined ring",1.56f,.085f,new Vector3(0,0,.08f),trim,coreRotor);
   Torus("Energy seal",1.38f,.035f,new Vector3(0,0,.12f),orange,coreRotor);
   Torus("Inner reactor neck",1.21f,.13f,new Vector3(0,0,-.08f),bronze,coreRotor);
   Shape("Reactor",PrimitiveType.Sphere,new Vector3(0,0,1.82f),new Vector3(1.67f,1.67f,.85f),orange,target);
   Shape("White-hot core",PrimitiveType.Sphere,new Vector3(0,0,2.21f),new Vector3(.62f,.62f,.22f),hot,target);
   for(int i=0;i<16;i++){
    float a=i*Mathf.PI/8;var group=MakeGroup("Segmented armor",target,new Vector3(Mathf.Cos(a)*2.05f,Mathf.Sin(a)*2.05f,1));group.localRotation=Quaternion.Euler(90,0,i*22.5f);
    Plate("Ceramic overlapping plate",Vector3.zero,new Vector3(.73f,.42f,1.12f),armor,group,.32f);
    Plate("Armor stripe",new Vector3(0,.235f,-.1f),new Vector3(.44f,.045f,.55f),lightMetal,group);
    for(int j=-1;j<=1;j+=2)Shape("Fastener",PrimitiveType.Sphere,new Vector3(j*.24f,.255f,.25f),Vector3.one*.065f,trim,group);
    float b=i*Mathf.PI/8;Cylinder("Core retention bolt",new Vector3(Mathf.Cos(b)*1.73f,Mathf.Sin(b)*1.73f,1.85f),new Vector3(Mathf.Cos(b)*1.73f,Mathf.Sin(b)*1.73f,2.08f),.055f,bronze,target);
   }
   for(int side=-1;side<=1;side+=2){
    for(int i=0;i<4;i++){
     var wing=MakeGroup("Leviathan wing assembly",target,new Vector3(side*(2.6f+i*.6f),.8f-i*.78f,-.3f-i*.35f));wing.localRotation=Quaternion.Euler(4,side*-12,side*(23+i*6));
     Plate("Layered wing armor",Vector3.zero,new Vector3(.78f,2.6f-i*.3f,1.35f),armor,wing,.35f);
     Plate("Wing exterior panel",new Vector3(0,0,.72f),new Vector3(.52f,2-i*.24f,.1f),lightMetal,wing);
     for(int k=0;k<5;k++){Box("Wing radiator",new Vector3(0,.75f-k*.31f,.79f),new Vector3(.38f,.07f,.05f),dark,wing);Box("Wing power line",new Vector3(.22f,.75f-k*.31f,.8f),new Vector3(.025f,.2f,.045f),orange,wing);}
     Cylinder("Exposed hydraulics",new Vector3(-.4f,-.7f,.5f),new Vector3(-.4f,.7f,.5f),.075f,trim,wing);
    }
    var shoulder=MakeGroup("Shoulder reactor",target,new Vector3(side*2.7f,1.55f,1.1f));
    Shape("Shoulder socket",PrimitiveType.Sphere,Vector3.zero,Vector3.one*1.2f,dark,shoulder);Torus("Shoulder seal",.47f,.085f,new Vector3(0,0,.5f),bronze,shoulder,40);
    Shape("Secondary core",PrimitiveType.Sphere,new Vector3(0,0,.56f),new Vector3(.68f,.68f,.32f),orange,shoulder);
    for(int k=0;k<5;k++)Cylinder("Heavy cannon rib",new Vector3(side*4.55f,-2,1.0f+k*.22f),new Vector3(side*4.55f,-2,1.13f+k*.22f),.3f,k%2==0?trim:dark,target);
    Torus("Cannon muzzle",.3f,.08f,new Vector3(side*4.55f,-2,2.2f),bronze,target,32);
    Shape("Charged muzzle",PrimitiveType.Sphere,new Vector3(side*4.55f,-2,2.23f),new Vector3(.36f,.36f,.14f),orange,target);
   }
   var crown=MakeGroup("Spinal command tower",target,new Vector3(0,2.5f,-.35f));
   Plate("Crown",Vector3.zero,new Vector3(1.3f,2,1.5f),dark,crown);
   for(int k=0;k<4;k++){Plate("Crown vanes",new Vector3(0,-.1f+k*.32f,.6f),new Vector3(1.5f-k*.17f,.11f,.7f),armor,crown);Box("Crown signal",new Vector3(0,-.04f+k*.32f,1),new Vector3(.25f,.05f,.035f),orange,crown);}
   reactorLight=new GameObject("Reactor spill light").AddComponent<Light>();reactorLight.transform.SetParent(target,false);reactorLight.transform.localPosition=new Vector3(0,0,3.7f);reactorLight.type=LightType.Point;reactorLight.color=new Color(1,.24f,.035f);reactorLight.range=12;reactorLight.intensity=4;
   var hit=target.gameObject.AddComponent<SphereCollider>();hit.radius=2.9f;hit.center=new Vector3(0,0,1);
   // The central rotor remains separate; other shell pieces are batched by material.
   DetailedFighter(new Vector3(-5.7f,8.4f,-28),false);DetailedFighter(new Vector3(5.3f,8.3f,-33),false);
  }
  void DetailedTurret(){
   var mount=MakeGroup("Ion battery foundation",transform,new Vector3(0,1.05f,3));
   Cylinder("Turntable",new Vector3(0,-.35f,0),new Vector3(0,.15f,0),1.38f,dark,mount);
   for(int i=0;i<12;i++){float a=i*Mathf.PI/6;Plate("Turntable plate",new Vector3(Mathf.Cos(a)*1.12f,.2f,Mathf.Sin(a)*1.12f),new Vector3(.35f,.13f,.35f),trim,mount);}
   turretHead=MakeGroup("Aimed gun housing",mount,new Vector3(0,.52f,0));turretHead.localRotation=Quaternion.Euler(-9,-18,0);
   Plate("Armored body",new Vector3(0,.12f,0),new Vector3(2,.88f,2.05f),armor,turretHead,.4f);
   Plate("Top shell",new Vector3(0,.58f,.02f),new Vector3(1.6f,.3f,1.6f),pale,turretHead,.42f);
   Plate("Rear shell",new Vector3(0,.19f,.97f),new Vector3(1.65f,.52f,.38f),dark,turretHead);
   for(int side=-1;side<=1;side+=2){
    Plate("Side plating",new Vector3(side*.97f,.15f,.02f),new Vector3(.18f,.62f,1.48f),lightMetal,turretHead);
    for(int k=0;k<6;k++)Box("Housing vents",new Vector3(side*1.075f,.18f,-.5f+k*.19f),new Vector3(.024f,.24f,.065f),dark,turretHead);
    Cylinder("Barrel breech",new Vector3(side*.47f,.25f,-.4f),new Vector3(side*.47f,.25f,-1.55f),.28f,dark,turretHead);
    Cylinder("Precision barrel",new Vector3(side*.47f,.25f,-1.55f),new Vector3(side*.47f,.25f,-4.1f),.115f,trim,turretHead);
    for(int k=0;k<8;k++)Torus("Barrel cooling collar",.28f-k*.013f,.034f,new Vector3(side*.47f,.25f,-1.05f-k*.23f),k%2==0?trim:bronze,turretHead,24);
    Cylinder("Muzzle brake",new Vector3(side*.47f,.25f,-3.8f),new Vector3(side*.47f,.25f,-4.25f),.2f,dark,turretHead);
    Torus("Muzzle rim",.19f,.035f,new Vector3(side*.47f,.25f,-4.25f),trim,turretHead,24);
    Torus("Muzzle ion ring",.14f,.027f,new Vector3(side*.47f,.25f,-4.28f),cyan,turretHead,24);
    Cylinder("Hydraulic support",new Vector3(side*.83f,-.08f,0),new Vector3(side*.83f,.04f,-1.55f),.075f,bronze,turretHead);
   }
   for(int i=0;i<5;i++)Box("Top luminous indicators",new Vector3(-.45f+i*.22f,.742f,.3f),new Vector3(.12f,.02f,.07f),cyan,turretHead);
   Plate("Gunner sight",new Vector3(0,.81f,-.35f),new Vector3(.4f,.22f,.32f),dark,turretHead);
   Box("Sight lens",new Vector3(0,.84f,-.52f),new Vector3(.25f,.09f,.025f),cyan,turretHead);
   Batch(turretHead);Batch(mount);
   for(int i=0;i<2;i++){var go=new GameObject("Ion pulse "+i);go.transform.SetParent(transform);var line=go.AddComponent<LineRenderer>();line.sharedMaterial=hot;line.positionCount=2;line.startWidth=.034f;line.endWidth=.012f;line.numCapVertices=3;discharges.Add(line);}
   for(int i=0;i<26;i++){var go=new GameObject("Impact spark");go.transform.SetParent(transform);var line=go.AddComponent<LineRenderer>();line.positionCount=2;line.sharedMaterial=i%3==0?hot:orange;line.startWidth=.02f;line.endWidth=.003f;sparks.Add(go.transform);}
  }
  void Batch(Transform root){
   var groups=new Dictionary<Material,List<CombineInstance>>();var renderers=new List<MeshRenderer>();
   foreach(var mf in root.GetComponentsInChildren<MeshFilter>()){
    // Preserve child assemblies that need their own animation or aiming transform.
    if(root!=turretHead && turretHead && mf.transform.IsChildOf(turretHead))continue;
    var r=mf.GetComponent<MeshRenderer>();if(!r||!r.enabled||!mf.sharedMesh)continue;
    var mat=r.sharedMaterial;if(!groups.ContainsKey(mat))groups[mat]=new List<CombineInstance>();
    groups[mat].Add(new CombineInstance{mesh=mf.sharedMesh,transform=root.worldToLocalMatrix*mf.transform.localToWorldMatrix});renderers.Add(r);
   }
   foreach(var r in renderers){DestroyImmediate(r.GetComponent<MeshFilter>());DestroyImmediate(r);}
   foreach(var entry in groups){var m=new Mesh{name=root.name+" / "+entry.Key.name,indexFormat=IndexFormat.UInt32};m.CombineMeshes(entry.Value.ToArray());var go=new GameObject(m.name);go.transform.SetParent(root,false);go.AddComponent<MeshFilter>().sharedMesh=m;go.AddComponent<MeshRenderer>().sharedMaterial=entry.Key;}
  }
  void RefineHud(){
   foreach(var tm in hud.GetComponentsInChildren<TextMesh>()){
    if(tm.text.StartsWith("UNITY-PROTOTYP"))tm.text="UNITY LIVE-SZENE  /  DETAILSTUFE HOCH";
    if(tm.text.StartsWith("ABSCHUESSE")||tm.text.StartsWith("SCHADEN"))hitCounter=tm;
   }
   reticle=hud.Find("Reticle");
   Label("ION MK-IV",-1.25f,-4.45f,.13f,new Color(.56f,.79f,.88f));
   Label("ZIEHEN: ZIELEN   /   LEERTASTE ODER FEUER: SCHIESSEN",0,-7.22f,.095f,new Color(.47f,.63f,.7f),TextAnchor.UpperCenter);
   var metalUi=UiMat("Reticle ticks",new Color(.18f,.38f,.45f));
   for(int i=0;i<11;i++)HudPanel("Bearing mark",-2.5f+i*.5f,4.66f,.01f,i%5==0?.12f:.055f,metalUi);
  }
  void DetailedPose(float time){
   if(target)target.localRotation=Quaternion.Euler(Mathf.Sin(time*.25f)*2,Mathf.Sin(time*.35f)*7,-3+Mathf.Sin(time*.5f)*2);
   if(coreRotor)coreRotor.localRotation=Quaternion.Euler(0,0,time*9);
   for(int i=0;i<drones.Count;i++){drones[i].localPosition=flightOrigins[i]+new Vector3(Mathf.Sin(time*.8f+i)*.45f,Mathf.Cos(time*.6f+i)*.17f,0);drones[i].localRotation=Quaternion.Euler(-9,149,(i==0?-17:12)+Mathf.Sin(time*.6f+i)*5);}
   var targetPoint=Boss?target.TransformPoint(new Vector3(.1f,0,2.1f)):drones[0].TransformPoint(new Vector3(0,.1f,.5f));
   if(Application.isPlaying && hasShot)targetPoint=shotEnd;
   if(!Application.isPlaying && reticle){var p=WorldCamera.WorldToViewportPoint(targetPoint);reticle.localPosition=new Vector3((p.x-.5f)*16*HudCamera.aspect,(p.y-.5f)*16,0);}
   for(int i=0;i<discharges.Count;i++){
    discharges[i].enabled=!Application.isPlaying||Time.time-lastShot<.14f;
    Vector3 start=turretHead.TransformPoint(new Vector3(i==0?-.47f:.47f,.25f,-4.3f));
    float t=Mathf.Repeat(time*1.5f+i*.43f,1);discharges[i].SetPosition(0,Vector3.Lerp(start,targetPoint,t));discharges[i].SetPosition(1,Vector3.Lerp(start,targetPoint,Mathf.Min(1,t+.21f)));
   }
   for(int i=0;i<sparks.Count;i++){
    float a=i*2.399963f,t=Mathf.Repeat(time*1.2f+i*.117f,1),r=t*(.3f+i%4*.22f);Vector3 d=new Vector3(Mathf.Cos(a),Mathf.Sin(a),Mathf.Sin(a*.8f))*.8f;
    var line=sparks[i].GetComponent<LineRenderer>();line.enabled=!Application.isPlaying||(lastHit&&Time.time-lastShot<.14f);line.SetPosition(0,targetPoint+d*r);line.SetPosition(1,targetPoint+d*(r+.08f));
   }
   if(reactorLight)reactorLight.intensity=1.25f+Mathf.Sin(time*2)*.3f;
   if(Application.isPlaying && turretHead)turretHead.localPosition=new Vector3(0,.52f,Mathf.Max(0,1-(Time.time-lastShot)/.14f)*.1f);
  }
  void DetailedInput(){
   bool fire=Input.GetKey(KeyCode.Space);
   System.Action<Vector2> pointer=p=>{if(p.y>Screen.height*.22f)aimScreen=new Vector2(p.x/Screen.width,p.y/Screen.height);else if(p.x>Screen.width*.6f)fire=true;};
   if(Input.touchCount>0){foreach(var touch in Input.touches)if(touch.phase!=TouchPhase.Ended&&touch.phase!=TouchPhase.Canceled)pointer(touch.position);}
   else if(Input.GetMouseButton(0))pointer(Input.mousePosition);
   aimX=(aimScreen.x-.5f)*30;aimY=(aimScreen.y-.5f)*20;turretHead.localRotation=Quaternion.Euler(-aimY,-aimX,0);
   if(reticle)reticle.localPosition=new Vector3((aimScreen.x-.5f)*16*HudCamera.aspect,(aimScreen.y-.5f)*16,0);
   if(fire&&Time.time-lastShot>.14f){lastShot=Time.time;FireAt(aimScreen);}
  }
  public bool FireAt(Vector2 normalized){
   var ray=WorldCamera.ViewportPointToRay(normalized);shotEnd=ray.GetPoint(45);hasShot=true;lastHit=false;
   if(Physics.Raycast(ray,out var hit,100)){shotEnd=hit.point;if(hit.transform==target||drones.Contains(hit.transform)){lastHit=true;hits++;if(hitCounter)hitCounter.text="DEMO-TREFFER  "+hits;return true;}}
   return false;
  }
  public bool VerifyHits(){
   Physics.SyncTransforms();Vector3 center=target?target.position:drones[0].position;
   var p=WorldCamera.WorldToViewportPoint(center);
   return FireAt(new Vector2(p.x,p.y))&&!FireAt(new Vector2(.99f,.99f));
   }
 }
}
