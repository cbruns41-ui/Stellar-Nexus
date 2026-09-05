using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace Colony
{
    public class ColonyRoot : MonoBehaviour
    {
        public static ColonyRoot Instance { get; private set; }
        public bool Visible { get; private set; } = true;
        public bool Motion { get; private set; } = true;
        public IReadOnlyDictionary<string, PlotView> Plots => _plots;
        readonly Dictionary<string, PlotView> _plots = new Dictionary<string, PlotView>();
        ColonyCamera _cam;
        DioramaWorld _world;
        string _selected="", _planet="";
        float _nextFrame;
        FrameDto _frame;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void SN_NotifyReady();
        [DllImport("__Internal")] static extern void SN_NotifySelect(string id);
        [DllImport("__Internal")] static extern void SN_NotifyFrame(string json);
#endif
        void Awake() {
            Instance=this;
            Application.targetFrameRate=60;
            QualitySettings.vSyncCount=0;
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput=false;
#endif
            _world=DioramaWorld.Build(transform);
            var camera=Camera.main;
            camera.clearFlags=CameraClearFlags.SolidColor;
            camera.backgroundColor=new Color(.025f,.028f,.032f);
            _cam=camera.GetComponent<ColonyCamera>();
            _cam.Bind(_world);
            Physics.queriesHitBackfaces=true;
            foreach(var spec in PlotLayout.All) _plots[spec.Id]=PlotView.Spawn(_world,_world.Root,spec);
            _frame=new FrameDto { anchors=new AnchorDto[_plots.Count] };
            int i=0;
            foreach(var p in _plots.Values) _frame.anchors[i++]=new AnchorDto { id=p.Id };
#if UNITY_WEBGL && !UNITY_EDITOR
            SN_NotifyReady();
#endif
        }
        void LateUpdate() {
            if(!Visible || Time.unscaledTime<_nextFrame) return;
            _nextFrame=Time.unscaledTime+.08f;
            int i=0;
            foreach(var plot in _plots.Values) {
                var point=Camera.main.WorldToViewportPoint(plot.Anchor);
                var a=_frame.anchors[i++];
                a.x=point.x; a.y=1-point.y;
                a.visible=point.x>-.02f && point.x<1.02f && point.y>.01f && point.y<.97f;
            }
#if UNITY_WEBGL && !UNITY_EDITOR
            SN_NotifyFrame(JsonUtility.ToJson(_frame));
#endif
        }
        public void Tap(Vector2 screen) {
            if(!Visible) return;
            string id="";
            if(Physics.Raycast(Camera.main.ScreenPointToRay(screen),out var hit,100f)) {
                var plot=hit.collider.GetComponent<PlotView>();
                if(plot) id=plot.Id;
            }
            Select(id==_selected ? "" : id,true);
        }
        public void ApplyState(string json) {
            if(string.IsNullOrEmpty(json)) return;
            try {
                var data=JsonUtility.FromJson<StateDto>(json);
                if(data?.plots==null) return;
                if(_planet!=data.planetId) { _planet=data.planetId; _cam.FramePlaza(); }
                _selected=data.selected ?? "";
                foreach(var row in data.plots)
                    if(row!=null && _plots.TryGetValue(row.id,out var plot))
                        plot.Apply(row.level,row.locked,row.busy,row.id==_selected,row.active,row.idle);
            } catch(Exception e) { Debug.LogWarning("Colony state: "+e.Message); }
        }
        public void SetSelected(string id) => Select(id,false);
        public void FocusBuilding(string id) {
            if(_plots.TryGetValue(id,out var p)) { _cam.Focus(p.Anchor); Select(id,true); }
        }
        public void SetVisible(string value) { Visible=value=="1"; Application.targetFrameRate=Visible?60:5; }
        public void SetMotion(string value) { Motion=value=="1"; Shader.SetGlobalFloat("_ColonyMotion",Motion?1:0); }
        public void CameraAction(string action) { if(action=="home") _cam.FramePlaza(); else _cam.Zoom(action=="in"?.8f:1.25f); }
        void Select(string id,bool notify) {
            _selected=id ?? "";
            foreach(var p in _plots.Values) p.Apply(p.Level,p.Locked,p.Busy,p.Id==_selected,p.Active,p.Idle);
#if UNITY_WEBGL && !UNITY_EDITOR
            if(notify) SN_NotifySelect(_selected);
#endif
        }
        [Serializable] class StateDto { public PlotDto[] plots; public string selected,planetId; }
        [Serializable] class PlotDto { public string id; public int level; public bool locked,busy,active,idle; }
        [Serializable] class FrameDto { public AnchorDto[] anchors; }
        [Serializable] class AnchorDto { public string id; public float x,y; public bool visible; }
    }
}
