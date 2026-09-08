using UnityEngine;
using UnityEngine.Rendering;

namespace StellarNexus.Preview {
    // Standalone visual study. No production scene or game economy is modified.
    public partial class CombatPreviewScene : MonoBehaviour {
        public bool Boss;
        public Camera WorldCamera, HudCamera;
        Material armor, trim, cyan, orange, dark, pale;
        [SerializeField] Transform target;
        [SerializeField] System.Collections.Generic.List<Transform> drones = new System.Collections.Generic.List<Transform>();
        public int AnimatedParts => drones.Count+(target?1:0);

        public static CombatPreviewScene Create(bool boss) {
            var root=new GameObject(boss?"AllianceBossPreview":"OrbitFirePreview").AddComponent<CombatPreviewScene>();
            root.Boss=boss;root.BuildDetailed();return root;
        }
        Material Mat(string name,Color color,float metal=0,float smooth=.4f,bool glow=false) {
            var m=new Material(Shader.Find("Standard")){name=name,color=color};
            m.SetFloat("_Metallic",metal);m.SetFloat("_Glossiness",smooth);
            if(glow){m.EnableKeyword("_EMISSION");m.SetColor("_EmissionColor",color*1.8f);}
            return m;
        }
        GameObject Shape(string name,PrimitiveType type,Vector3 pos,Vector3 scale,Material material,Transform parent=null) {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(parent?parent:transform,false);
            go.transform.localPosition=pos;go.transform.localScale=scale;go.GetComponent<Renderer>().sharedMaterial=material;
            var collider=go.GetComponent<Collider>();if(collider)DestroyImmediate(collider);return go;
        }
        void Box(string name,Vector3 pos,Vector3 scale,Material material,Transform parent=null) {Shape(name,PrimitiveType.Cube,pos,scale,material,parent);}
        void Line(string name,Vector3 a,Vector3 b,float width,Material material,Transform parent=null) {
            var go=new GameObject(name);go.transform.SetParent(parent?parent:transform,false);
            var l=go.AddComponent<LineRenderer>();l.useWorldSpace=false;l.positionCount=2;l.SetPosition(0,a);l.SetPosition(1,b);
            l.startWidth=l.endWidth=width;l.sharedMaterial=material;l.numCapVertices=4;
        }
        void Ring(string name,float radius,Vector3 center,Material mat,Transform parent,float width=.04f,int segments=80) {
            var go=new GameObject(name);go.transform.SetParent(parent,false);
            var l=go.AddComponent<LineRenderer>();l.useWorldSpace=false;l.loop=true;l.positionCount=segments;l.startWidth=l.endWidth=width;l.sharedMaterial=mat;
            for(int i=0;i<segments;i++){float a=i*Mathf.PI*2/segments;l.SetPosition(i,center+new Vector3(Mathf.Cos(a),Mathf.Sin(a),0)*radius);}
        }
        Transform hud;
        Material UiMat(string name,Color color){var m=new Material(Shader.Find("Unlit/Color")){name=name,color=color};return m;}
        void HudPanel(string name,float x,float y,float w,float h,Material mat) {
            var go=Shape(name,PrimitiveType.Quad,new Vector3(x,y,1),new Vector3(w,h,1),mat,hud);go.layer=5;
        }
        void Label(string text,float x,float y,float size,Color color,TextAnchor anchor=TextAnchor.UpperLeft) {
            var go=new GameObject(text);go.layer=5;go.transform.SetParent(hud,false);go.transform.localPosition=new Vector3(x,y,0);
            var tm=go.AddComponent<TextMesh>();tm.text=text;tm.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");tm.fontSize=80;tm.characterSize=size*.18f;tm.anchor=anchor;tm.color=color;
            go.GetComponent<MeshRenderer>().sharedMaterial=tm.font.material;
        }
        void BuildHud() {
            HudCamera=new GameObject("HUDCamera").AddComponent<Camera>();HudCamera.transform.SetParent(transform);HudCamera.transform.position=new Vector3(200,0,-10);
            HudCamera.orthographic=true;HudCamera.orthographicSize=8;HudCamera.clearFlags=CameraClearFlags.Depth;HudCamera.cullingMask=1<<5;HudCamera.depth=10;
            hud=new GameObject("HUD").transform;hud.SetParent(transform);hud.position=new Vector3(200,0,0);
            var panel=UiMat("HUD navy",new Color(.02f,.035f,.052f));var blue=UiMat("HUD blue",new Color(.1f,.77f,.94f));var amber=UiMat("HUD amber",new Color(1,.32f,.09f));
            HudPanel("Header",0,6.7f,11.2f,1.8f,panel);
            Label("STELLAR NEXUS  /  "+(Boss?"ALLIANZ-OPERATION":"ORBITVERTEIDIGUNG"),-5.25f,7.36f,.14f,new Color(.45f,.69f,.8f));
            Label(Boss?"ABYSSALER WELTENBRECHER":"ORBIT-FEUER",-5.25f,6.91f,.27f,Color.white);
            Label(Boss?"STUFE 04  /  REAKTORKERNE ANVISIEREN":"WELLE 03  /  ABFANGJAEGER IM ANFLUG",-5.25f,6.18f,.13f,new Color(.6f,.76f,.81f));
            HudPanel("Enemy HP track",0,5.45f,10.4f,.1f,panel);HudPanel("Enemy HP",-.9f,5.45f,8.6f,.1f,Boss?amber:blue);
            Label(Boss?"BOSS-HUELLE   82 %":"BASISSCHILD   82 %",-5.2f,5.23f,.14f,Color.white);
            Label("00:24",5.15f,5.23f,.21f,Color.white,TextAnchor.UpperRight);
            var aim=new GameObject("Reticle").transform;aim.SetParent(hud,false);aim.localPosition=new Vector3(0,.5f,0);
            Ring("Aim circle",.42f,Vector3.zero,blue,aim,.018f,48);
            Line("Aim horizontal",new Vector3(-.65f,0),new Vector3(.65f,0),.014f,blue,aim);
            Line("Aim vertical",new Vector3(0,-.65f),new Vector3(0,.65f),.014f,blue,aim);
            foreach(var child in aim.GetComponentsInChildren<Transform>())child.gameObject.layer=5;
            HudPanel("Bottom panel",0,-6.7f,11.2f,1.9f,panel);
            Label(Boss?"SCHADEN   12 480":"ABSCHUESSE   07",-5.2f,-5.9f,.19f,Color.white);
            Label(Boss?"KERN TREFFEN  /  KOMBO x3":"IONENBATTERIE   74 %",-5.2f,-6.5f,.14f,new Color(.35f,.8f,.9f));
            HudPanel("Fire button",3.55f,-6.72f,2.5f,.75f,Boss?amber:blue);Label("FEUER",3.55f,-6.5f,.23f,new Color(.015f,.03f,.04f),TextAnchor.UpperCenter);
            Label("UNITY-PROTOTYP  /  GERENDERTE SZENE",0,-7.65f,.105f,new Color(.46f,.62f,.68f),TextAnchor.UpperCenter);
        }
        public void SetPose(float time) {
            if(detailed){DetailedPose(time);return;}
            if(target)target.localRotation=Quaternion.Euler(0,Mathf.Sin(time*.35f)*8,Mathf.Sin(time*.5f)*3);
            for(int i=0;i<drones.Count;i++)drones[i].localPosition=new Vector3((i%3-1)*3.2f+Mathf.Sin(time+i)*.6f,3.5f+i*.65f,-8-i*3.2f);
        }
        void Update(){SetPose(Time.time);if(detailed)DetailedInput();}
    }
}
