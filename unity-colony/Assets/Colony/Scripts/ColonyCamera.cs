using UnityEngine;

namespace Colony
{
    public class ColonyCamera : MonoBehaviour
    {
        public bool Dragging { get; private set; }

        float _size = 13.2f;
        Vector3 _target = new Vector3(0f, 0f, 0.8f);
        Vector3 _last;
        Camera _cam;

        void Awake()
        {
            _cam = GetComponent<Camera>();
            if (_cam != null)
            {
                _cam.orthographic = true;
                _cam.nearClipPlane = 0.1f;
                _cam.farClipPlane = 80f;
            }
        }

        void LateUpdate()
        {
            HandleInput();
            _size = Mathf.Clamp(_size, 7f, 20f);
            _target.x = Mathf.Clamp(_target.x, -11f, 11f);
            _target.z = Mathf.Clamp(_target.z, -11f, 11f);
            if (_cam) _cam.orthographicSize = _size;
            transform.position = new Vector3(_target.x, 40f, _target.z);
            transform.rotation = Quaternion.Euler(90f, 0f, 0f);
        }

        void HandleInput()
        {
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.01f) _size *= scroll > 0 ? 0.9f : 1.11f;

            if (Input.touchCount >= 2)
            {
                var a = Input.GetTouch(0);
                var b = Input.GetTouch(1);
                var prevA = a.position - a.deltaPosition;
                var prevB = b.position - b.deltaPosition;
                float prev = Vector2.Distance(prevA, prevB);
                float now = Vector2.Distance(a.position, b.position);
                if (prev > 1f) _size *= prev / Mathf.Max(1f, now);
                Dragging = true;
                return;
            }

            if (Input.GetMouseButtonDown(0) || Input.GetMouseButtonDown(2))
            {
                _last = Input.mousePosition;
                Dragging = false;
            }
            if (Input.GetMouseButton(0) || Input.GetMouseButton(2))
            {
                Vector3 now = Input.mousePosition;
                Vector3 delta = now - _last;
                if (delta.sqrMagnitude > 16f) Dragging = true;
                if (Dragging && _cam != null)
                {
                    float world = _size * 2f / Mathf.Max(1f, Screen.height);
                    _target.x -= delta.x * world;
                    _target.z -= delta.y * world;
                }
                _last = now;
            }
        }

        public void ClearDrag()
        {
            Dragging = false;
        }
    }
}
