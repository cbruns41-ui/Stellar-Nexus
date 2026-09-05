using UnityEngine;

namespace Colony
{
    public class ColonyCamera : MonoBehaviour
    {
        public bool Dragging { get; private set; }
        DioramaWorld _world;
        Camera _cam;
        float _size, _targetSize;
        Vector2 _look, _last, _press;
        bool _pressed, _pinched;
        int _width, _height;

        public void Bind(DioramaWorld world) { _world=world; _cam=GetComponent<Camera>(); FramePlaza(); }
        public void FramePlaza() {
            if (_world==null) return;
            _look = _world.UvToLocal(new Vector2(.50f,.55f));
            _size = _targetSize = _world.Mobile ? 6.9f : Mathf.Min(10f,_world.Width/(2f*_cam.aspect));
            ApplyCamera();
        }
        public void Focus(Vector3 anchor) { _look = anchor; ApplyCamera(); }
        public void Zoom(float factor) { _targetSize *= factor; }
        public void ClearDrag() { Dragging=false; }
        void Update() {
            if (_world==null || !ColonyRoot.Instance.Visible) return;
            if(_width!=Screen.width || _height!=Screen.height) {
                _width=Screen.width; _height=Screen.height;
                _targetSize=Mathf.Min(_targetSize,MaxSize());
            }
            HandleInput();
            _targetSize=Mathf.Clamp(_targetSize,2.8f,MaxSize());
            _size=Mathf.Lerp(_size,_targetSize,1-Mathf.Exp(-18f*Time.unscaledDeltaTime));
            ApplyCamera();
        }
        float MaxSize() => Mathf.Min(10f,_world.Width/(2f*Mathf.Max(.1f,_cam.aspect)));
        void ApplyCamera() {
            float maxX=Mathf.Max(0,_world.Width*.5f-_size*_cam.aspect);
            float maxY=Mathf.Max(0,_world.Height*.5f-_size);
            _look.x=Mathf.Clamp(_look.x,-maxX,maxX);
            _look.y=Mathf.Clamp(_look.y,-maxY,maxY);
            transform.position=new Vector3(_look.x,_look.y,-20);
            transform.rotation=Quaternion.identity;
            _cam.orthographic=true; _cam.orthographicSize=_size;
        }
        void HandleInput() {
            float scroll=Input.mouseScrollDelta.y;
            if(Mathf.Abs(scroll)>.01f) _targetSize*=Mathf.Pow(.87f,scroll);
            if(Input.touchCount>=2) {
                var a=Input.GetTouch(0); var b=Input.GetTouch(1);
                float distance=Vector2.Distance(a.position,b.position);
                float before=Vector2.Distance(a.position-a.deltaPosition,b.position-b.deltaPosition);
                if(before>4) _targetSize*=before/Mathf.Max(4,distance);
                Pan((a.deltaPosition+b.deltaPosition)*.5f);
                _pinched=true; Dragging=true; _pressed=false;
                return;
            }
            if(_pinched) {
                if(Input.touchCount==0 && !Input.GetMouseButton(0)) { _pinched=false; Dragging=false; }
                return;
            }
            Vector2 pointer=Input.mousePosition;
            if(Input.GetMouseButtonDown(0)) { _press=_last=pointer; _pressed=true; Dragging=false; }
            if(_pressed && Input.GetMouseButton(0)) {
                if(Vector2.Distance(pointer,_press)>8f) Dragging=true;
                if(Dragging) Pan(pointer-_last);
                _last=pointer;
            }
            if(_pressed && Input.GetMouseButtonUp(0)) {
                if(!Dragging) ColonyRoot.Instance.Tap(pointer);
                _pressed=false;
            }
        }
        void Pan(Vector2 delta) { _look-=delta*(_size*2f/Mathf.Max(1,Screen.height)); }
    }
}
