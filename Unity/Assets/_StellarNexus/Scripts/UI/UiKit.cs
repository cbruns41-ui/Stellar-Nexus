using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace StellarNexus
{
    public static class UiKit
    {
        public static readonly Color Bg = new Color(0.03f, 0.035f, 0.07f, 1f);
        public static readonly Color Panel = new Color(0.07f, 0.09f, 0.16f, 0.94f);
        public static readonly Color Line = new Color(0.24f, 0.88f, 1f, 0.35f);
        public static readonly Color Cyan = new Color(0.24f, 0.88f, 1f, 1f);
        public static readonly Color Violet = new Color(0.75f, 0.52f, 1f, 1f);
        public static readonly Color Text = new Color(0.86f, 0.91f, 0.97f, 1f);
        public static readonly Color Muted = new Color(0.52f, 0.58f, 0.68f, 1f);
        public static readonly Color Danger = new Color(1f, 0.32f, 0.45f, 1f);
        public static readonly Color Ok = new Color(0.35f, 0.88f, 0.52f, 1f);

        public static Font Font;

        public static void EnsureFont()
        {
            if (Font != null) return;
            Font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (Font == null) Font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        }

        public static Canvas CreateCanvas()
        {
            EnsureFont();
            var go = new GameObject("HUD");
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();

            if (Object.FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
                Object.DontDestroyOnLoad(es);
            }
            Object.DontDestroyOnLoad(go);
            Image(go.transform, "bg", Vector2.zero, Vector2.zero, Vector2.zero, Vector2.one, Bg);
            return canvas;
        }

        public static RectTransform Image(Transform parent, string name, Vector2 aMin, Vector2 aMax, Vector2 oMin, Vector2 oMax, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.offsetMin = oMin; rt.offsetMax = oMax;
            go.GetComponent<Image>().color = color;
            return rt;
        }

        public static Text Label(Transform parent, string name, string text, int size, Color color, TextAnchor anchor = TextAnchor.MiddleLeft, bool wrap = false)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            Stretch(rt);
            var t = go.GetComponent<Text>();
            t.font = Font;
            t.fontSize = size;
            t.color = color;
            t.text = text;
            t.alignment = anchor;
            t.horizontalOverflow = wrap ? HorizontalWrapMode.Wrap : HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        public static Button Btn(Transform parent, string label, UnityAction onClick, Color? color = null)
        {
            var rt = Image(parent, "btn_" + label, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.12f, 0.18f, 0.32f, 0.95f));
            var img = rt.GetComponent<Image>();
            var outline = rt.gameObject.AddComponent<Outline>();
            outline.effectColor = color ?? Line;
            outline.effectDistance = new Vector2(1, -1);
            var btn = rt.gameObject.AddComponent<Button>();
            btn.targetGraphic = img;
            var colors = btn.colors;
            colors.highlightedColor = new Color(0.2f, 0.35f, 0.5f, 1f);
            colors.pressedColor = new Color(0.1f, 0.16f, 0.28f, 1f);
            btn.colors = colors;
            Label(rt, "txt", label, 16, color ?? Cyan, TextAnchor.MiddleCenter);
            if (onClick != null) btn.onClick.AddListener(onClick);
            return btn;
        }

        public static void Stretch(RectTransform rt, float l = 0, float b = 0, float r = 0, float t = 0)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(l, b);
            rt.offsetMax = new Vector2(-r, -t);
        }

        public static RectTransform Panel(Transform parent, string name)
        {
            var rt = Image(parent, name, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, Panel);
            var ol = rt.gameObject.AddComponent<Outline>();
            ol.effectColor = Line;
            ol.effectDistance = new Vector2(1, -1);
            return rt;
        }

        public static ScrollRect Scroll(Transform parent)
        {
            var viewport = Image(parent, "scroll", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, new Color(0, 0, 0, 0.01f));
            var mask = viewport.gameObject.AddComponent<Mask>();
            mask.showMaskGraphic = false;
            var content = new GameObject("content", typeof(RectTransform)).GetComponent<RectTransform>();
            content.SetParent(viewport, false);
            content.anchorMin = new Vector2(0, 1);
            content.anchorMax = new Vector2(1, 1);
            content.pivot = new Vector2(0.5f, 1);
            content.anchoredPosition = Vector2.zero;
            content.sizeDelta = new Vector2(0, 0);
            var vlg = content.gameObject.AddComponent<VerticalLayoutGroup>();
            vlg.padding = new RectOffset(8, 8, 8, 8);
            vlg.spacing = 8;
            vlg.childForceExpandHeight = false;
            vlg.childForceExpandWidth = true;
            vlg.childControlHeight = true;
            vlg.childControlWidth = true;
            var fitter = content.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var scroll = viewport.gameObject.AddComponent<ScrollRect>();
            scroll.content = content;
            scroll.viewport = viewport;
            scroll.horizontal = false;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            return scroll;
        }

        public static LayoutElement Size(Component c, float h, float w = -1)
        {
            var le = c.gameObject.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            le.preferredHeight = h;
            le.minHeight = h;
            if (w > 0) { le.preferredWidth = w; le.minWidth = w; }
            return le;
        }

        public static string Fmt(float n)
        {
            if (Mathf.Abs(n) >= 1000000) return (n / 1000000f).ToString("0.00") + "M";
            if (Mathf.Abs(n) >= 10000) return (n / 1000f).ToString("0.0") + "k";
            return Mathf.Floor(n).ToString("N0");
        }
    }
}
