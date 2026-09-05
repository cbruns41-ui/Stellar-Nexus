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

        readonly Dictionary<string, PlotView> _plots = new Dictionary<string, PlotView>();
        ColonyCamera _cam;
        string _selected = "";
        bool _ready;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void SN_NotifyReady();
        [DllImport("__Internal")] static extern void SN_NotifySelect(string id);
#endif

        void Awake()
        {
            Instance = this;
            try
            {
                Mats.Ensure();
                EnsureCamera();
                SpaceEnvironment.Build(transform);
                foreach (var spec in PlotLayout.All)
                    _plots[spec.Id] = PlotView.Spawn(transform, spec);
                foreach (var plot in _plots.Values)
                    plot.Apply(0, false, false, false);
                _ready = true;
                NotifyReady();
            }
            catch (Exception err)
            {
                Debug.LogError("Colony Awake failed: " + err);
            }
        }

        void EnsureCamera()
        {
            var cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                cam = go.AddComponent<Camera>();
                go.tag = "MainCamera";
                go.AddComponent<AudioListener>();
            }
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.035f, 0.025f, 0.03f);
            cam.orthographic = true;
            cam.orthographicSize = 13.2f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 80f;
            cam.transform.position = new Vector3(0f, 40f, 0f);
            cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            _cam = cam.GetComponent<ColonyCamera>() ?? cam.gameObject.AddComponent<ColonyCamera>();
        }

        void Update()
        {
            if (!_ready) return;
            if (!Input.GetMouseButtonUp(0)) return;
            if (_cam != null && _cam.Dragging)
            {
                _cam.ClearDrag();
                return;
            }
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (!Physics.Raycast(ray, out var hit, 200f))
            {
                Select("");
                return;
            }
            var plot = hit.collider.GetComponentInParent<PlotView>();
            if (plot == null)
            {
                Select("");
                return;
            }
            Select(plot.Id == _selected ? "" : plot.Id);
        }

        public void ApplyState(string json)
        {
            if (string.IsNullOrEmpty(json)) return;
            try
            {
                var data = JsonUtility.FromJson<StateDto>(json);
                if (data?.plots == null) return;
                _selected = data.selected ?? "";
                var seen = new HashSet<string>();
                foreach (var row in data.plots)
                {
                    if (row == null || !_plots.TryGetValue(row.id, out var plot)) continue;
                    seen.Add(row.id);
                    plot.Apply(row.level, row.locked, row.busy, row.id == _selected);
                }
                foreach (var kv in _plots)
                {
                    if (!seen.Contains(kv.Key)) kv.Value.Apply(0, false, false, false);
                }
            }
            catch (Exception err)
            {
                Debug.LogWarning("Colony ApplyState: " + err.Message);
            }
        }

        public void SetSelected(string id)
        {
            Select(id ?? "", false);
        }

        void Select(string id, bool notify = true)
        {
            _selected = id ?? "";
            foreach (var kv in _plots)
                kv.Value.Apply(kv.Value.Level, kv.Value.Locked, kv.Value.Busy, kv.Key == _selected);
            if (notify) NotifySelect(_selected);
        }

        void NotifyReady()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            SN_NotifyReady();
#endif
        }

        void NotifySelect(string id)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            SN_NotifySelect(id ?? "");
#endif
        }

        [Serializable]
        class StateDto
        {
            public PlotDto[] plots;
            public string selected;
        }

        [Serializable]
        class PlotDto
        {
            public string id;
            public int level;
            public bool locked;
            public bool busy;
            public string name;
            public string size;
        }
    }
}
