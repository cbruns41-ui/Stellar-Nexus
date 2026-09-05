using UnityEngine;

namespace Colony
{
    public class PlotView : MonoBehaviour
    {
        public string Id;
        public int Level;
        public bool Locked;
        public bool Busy;
        public bool Selected;
        public string Size = "mini";

        Transform _building;
        Transform _pad;
        Transform _select;

        public static PlotView Spawn(Transform parent, PlotSpec spec)
        {
            var go = new GameObject("plot-" + spec.Id);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = spec.Position;
            var view = go.AddComponent<PlotView>();
            view.Id = spec.Id;
            view.Size = spec.Size;
            view._pad = SpriteFactory.Pad(spec.Size, go.transform);
            float r = PlotLayout.Radius(spec.Size);
            var box = go.AddComponent<BoxCollider>();
            box.size = new Vector3(r * 2.25f, 0.5f, r * 2.25f);
            box.center = new Vector3(0f, 0.25f, 0f);
            return view;
        }

        public void Apply(int level, bool locked, bool busy, bool selected)
        {
            Level = level;
            Locked = locked;
            Busy = busy;
            Selected = selected;
            if (level > 0)
            {
                if (_building == null) _building = SpriteFactory.Building(Id, Size, transform);
                _building.gameObject.SetActive(true);
                if (_pad) _pad.gameObject.SetActive(false);
            }
            else
            {
                if (_building) _building.gameObject.SetActive(false);
                if (_pad) _pad.gameObject.SetActive(true);
            }
            var tint = locked ? new Color(0.45f, 0.48f, 0.5f, 1f)
                : busy ? new Color(1f, 0.92f, 0.72f, 1f)
                : Color.white;
            SpriteFactory.Tint(level > 0 ? _building : _pad, tint);
            ShowSelect(selected);
        }

        void ShowSelect(bool on)
        {
            if (!on)
            {
                if (_select) _select.gameObject.SetActive(false);
                return;
            }
            if (_select == null)
            {
                var ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                ring.name = "select";
                ring.transform.SetParent(transform, false);
                float r = PlotLayout.Radius(Size) * 2.4f;
                ring.transform.localScale = new Vector3(r, 0.015f, r);
                ring.transform.localPosition = new Vector3(0f, 0.015f, 0f);
                Object.Destroy(ring.GetComponent<Collider>());
                ring.GetComponent<MeshRenderer>().sharedMaterial = Mats.SelectGlow;
                _select = ring.transform;
            }
            _select.gameObject.SetActive(true);
        }
    }
}
