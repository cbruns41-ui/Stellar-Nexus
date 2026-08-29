using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace StellarNexus
{
    public class HudController : MonoBehaviour
    {
        GameRoot _g;
        ScreenId _screen = ScreenId.Planet;
        Canvas _canvas;
        RectTransform _content;
        RectTransform _modal;
        Text _tickLabel;
        Text[] _resLabels;
        Image _tickBar;
        Text _toast;
        float _toastUntil;
        int _selectedSystem = 1;
        string _missionTarget;
        readonly Dictionary<ShipClass, int> _picks = new Dictionary<ShipClass, int>();

        public void Bind(GameRoot g)
        {
            _g = g;
            _canvas = UiKit.CreateCanvas();
            BuildChrome();
            Refresh();
        }

        public void Show(ScreenId id)
        {
            _screen = id;
            _missionTarget = null;
            Refresh();
        }

        public void Toast(string msg)
        {
            if (_toast == null) return;
            _toast.text = msg;
            _toastUntil = Time.unscaledTime + 3.2f;
        }

        public void TickChrome()
        {
            if (_g == null) return;
            UpdateResources();
            if (_tickLabel != null)
            {
                float left = _g.Clock.Duration - _g.Clock.Accrued;
                _tickLabel.text = $"Tick {_g.State.tick}   nächster in {left:0.0}s   {_g.Clock.Speed:0.#}×";
            }
            if (_tickBar != null) _tickBar.rectTransform.anchorMax = new Vector2(_g.Clock.Progress, 1);
            if (_toast != null && Time.unscaledTime > _toastUntil) _toast.text = "";
        }

        public void Refresh()
        {
            if (_g == null) return;
            TickChrome();
            foreach (Transform t in _content) Destroy(t.gameObject);
            switch (_screen)
            {
                case ScreenId.Planet: DrawPlanet(); break;
                case ScreenId.Map: DrawMap(); break;
                case ScreenId.Dominion: DrawDominion(); break;
                case ScreenId.Fleets: DrawFleets(); break;
            }
        }

        void BuildChrome()
        {
            var root = _canvas.transform;
            var top = UiKit.Image(root, "top", new Vector2(0, 1), Vector2.one, new Vector2(0, -86), Vector2.zero, new Color(0.04f, 0.05f, 0.1f, 0.96f));
            UiKit.Label(top, "title", "STELLAR NEXUS", 22, UiKit.Cyan, TextAnchor.MiddleLeft);
            var title = top.Find("title").GetComponent<RectTransform>();
            title.anchorMin = new Vector2(0, 0); title.anchorMax = new Vector2(0.18f, 1);
            title.offsetMin = new Vector2(18, 8); title.offsetMax = new Vector2(0, -8);

            var resHost = UiKit.Image(top, "res", new Vector2(0.18f, 0), new Vector2(0.78f, 1), Vector2.zero, Vector2.zero, Color.clear);
            var h = resHost.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = 8; h.padding = new RectOffset(8, 8, 12, 28); h.childForceExpandWidth = true; h.childForceExpandHeight = true;
            var ids = (ResourceId[])System.Enum.GetValues(typeof(ResourceId));
            _resLabels = new Text[ids.Length];
            for (int i = 0; i < ids.Length; i++)
            {
                var def = _g.Catalog.Res(ids[i]);
                var cell = UiKit.Image(resHost, def.shortName, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.05f, 0.07f, 0.12f, 0.9f));
                cell.gameObject.AddComponent<LayoutElement>().flexibleWidth = 1;
                _resLabels[i] = UiKit.Label(cell, "v", def.shortName, 15, def.color, TextAnchor.MiddleCenter);
            }

            var actions = UiKit.Image(top, "act", new Vector2(0.78f, 0), Vector2.one, Vector2.zero, Vector2.zero, Color.clear);
            var ah = actions.gameObject.AddComponent<HorizontalLayoutGroup>();
            ah.spacing = 6; ah.padding = new RectOffset(8, 12, 18, 18); ah.childForceExpandWidth = true;
            AddChromeBtn(actions, "Tick", () => { Simulation.ProcessTick(_g.State, _g.Catalog); _g.Clock.Accrued = 0; Refresh(); });
            AddChromeBtn(actions, "1×", () => { _g.Clock.Speed = 1; Toast("Tempo 1×"); });
            AddChromeBtn(actions, "10×", () => { _g.Clock.Speed = 10; Toast("Tempo 10×"); });
            AddChromeBtn(actions, "Save", () => { SaveSystem.Save(_g.State); Toast("Gespeichert."); });
            AddChromeBtn(actions, "Neu", () => _g.NewGame());

            var barBg = UiKit.Image(top, "barbg", new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 0), new Vector2(0, 6), new Color(1, 1, 1, 0.08f));
            _tickBar = UiKit.Image(barBg, "bar", Vector2.zero, new Vector2(0, 1), Vector2.zero, Vector2.zero, UiKit.Cyan).GetComponent<Image>();
            _tickLabel = UiKit.Label(top, "tick", "", 13, UiKit.Muted, TextAnchor.LowerRight);
            var tr = _tickLabel.rectTransform;
            tr.anchorMin = new Vector2(0.18f, 0); tr.anchorMax = new Vector2(0.78f, 0.38f);
            tr.offsetMin = Vector2.zero; tr.offsetMax = Vector2.zero;

            var nav = UiKit.Image(root, "nav", Vector2.zero, new Vector2(0, 1), new Vector2(0, 0), new Vector2(210, -86), new Color(0.035f, 0.04f, 0.08f, 0.96f));
            var nv = nav.gameObject.AddComponent<VerticalLayoutGroup>();
            nv.padding = new RectOffset(12, 12, 16, 16); nv.spacing = 8; nv.childForceExpandHeight = false; nv.childForceExpandWidth = true;
            NavBtn(nav, "1  Planet", ScreenId.Planet);
            NavBtn(nav, "2  Sternenkarte", ScreenId.Map);
            NavBtn(nav, "3  Dominion", ScreenId.Dominion);
            NavBtn(nav, "4  Flotten", ScreenId.Fleets);

            _content = UiKit.Image(root, "content", new Vector2(0, 0), Vector2.one, new Vector2(222, 16), new Vector2(-16, -102), Color.clear);
            _modal = UiKit.Image(root, "modal", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, new Color(0, 0, 0, 0.55f));
            _modal.gameObject.SetActive(false);
            _toast = UiKit.Label(root, "toast", "", 18, UiKit.Cyan, TextAnchor.LowerCenter);
            var tst = _toast.rectTransform;
            tst.anchorMin = new Vector2(0.25f, 0); tst.anchorMax = new Vector2(0.95f, 0);
            tst.offsetMin = new Vector2(0, 18); tst.offsetMax = new Vector2(0, 56);
        }

        void AddChromeBtn(Transform parent, string label, UnityEngine.Events.UnityAction a)
        {
            var b = UiKit.Btn(parent, label, a);
            UiKit.Size(b, 36);
        }

        void NavBtn(Transform parent, string label, ScreenId id)
        {
            var b = UiKit.Btn(parent, label, () => Show(id));
            UiKit.Size(b, 42);
        }

        void UpdateResources()
        {
            if (_resLabels == null) return;
            var p = _g.Focus;
            var prod = Simulation.ProductionPerTick(p, _g.Catalog);
            var ids = (ResourceId[])System.Enum.GetValues(typeof(ResourceId));
            for (int i = 0; i < ids.Length; i++)
            {
                var def = _g.Catalog.Res(ids[i]);
                _resLabels[i].text = $"{def.shortName}  {UiKit.Fmt(p.stock[ids[i]])}\n+{prod[ids[i]]:0.0}/Tick";
            }
        }

        void DrawPlanet()
        {
            var p = _g.Focus;
            var cat = _g.Catalog;
            var left = UiKit.Panel(_content, "left");
            left.anchorMin = Vector2.zero; left.anchorMax = new Vector2(0.34f, 1);
            left.offsetMin = Vector2.zero; left.offsetMax = new Vector2(-8, 0);

            var orb = UiKit.Image(left, "orb", new Vector2(0.5f, 0.62f), new Vector2(0.5f, 0.62f), new Vector2(-90, -90), new Vector2(90, 90), cat.Bio(p.biome).color);
            orb.gameObject.GetComponent<Image>().raycastTarget = false;
            UiKit.Label(left, "n", p.name + (p.isHome ? "  ★ Heimat" : ""), 22, UiKit.Text, TextAnchor.UpperCenter);
            var nt = left.Find("n").GetComponent<RectTransform>();
            nt.anchorMin = new Vector2(0, 0.88f); nt.anchorMax = Vector2.one; nt.offsetMin = new Vector2(10, 0); nt.offsetMax = new Vector2(-10, -8);
            string dep = p.hasSpecialDeposit ? $"\nVorkommen: {cat.Res(p.depositResource).displayName} ×{p.depositMultiplier:0.0}" : "";
            UiKit.Label(left, "meta", $"{cat.Bio(p.biome).displayName}   Galaxie 1 → {catSys(p)}{dep}\nSlots {UsedSlots(p)}/{p.SlotCount}   Def {p.DefenseValue(cat)}", 15, UiKit.Muted, TextAnchor.UpperCenter, true);
            var mt = left.Find("meta").GetComponent<RectTransform>();
            mt.anchorMin = new Vector2(0, 0.05f); mt.anchorMax = new Vector2(1, 0.42f); mt.offsetMin = new Vector2(12, 8); mt.offsetMax = new Vector2(-12, 0);

            var right = UiKit.Image(_content, "right", new Vector2(0.34f, 0), Vector2.one, new Vector2(8, 0), Vector2.zero, Color.clear);
            var split = UiKit.Image(right, "gridHost", new Vector2(0, 0.46f), Vector2.one, Vector2.zero, Vector2.zero, Color.clear);
            DrawSlots(split, p);
            var yard = UiKit.Panel(right, "yard");
            yard.anchorMin = Vector2.zero; yard.anchorMax = new Vector2(1, 0.46f);
            yard.offsetMin = Vector2.zero; yard.offsetMax = new Vector2(0, -8);
            DrawShipyard(yard, p);
        }

        string catSys(PlanetState p)
        {
            var s = _g.State.System(p.systemIndex);
            return s != null ? s.name : ("S" + p.systemIndex);
        }

        int UsedSlots(PlanetState p)
        {
            int n = 0;
            foreach (var s in p.slots) if (s.id != BuildingId.None) n++;
            return n;
        }

        void DrawSlots(RectTransform host, PlanetState p)
        {
            UiKit.Label(host, "h", "Oberfläche / Gebäude", 16, UiKit.Cyan, TextAnchor.UpperLeft);
            var gridHost = UiKit.Image(host, "g", Vector2.zero, Vector2.one, new Vector2(0, 0), new Vector2(0, -28), Color.clear);
            var grid = gridHost.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(210, 72);
            grid.spacing = new Vector2(8, 8);
            grid.padding = new RectOffset(4, 4, 4, 4);
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = 3;
            for (int i = 0; i < p.slots.Length; i++)
            {
                int idx = i;
                var slot = p.slots[i];
                string label;
                if (slot.id == BuildingId.None) label = "+ Bauen";
                else
                {
                    var d = _g.Catalog.Bld(slot.id);
                    label = slot.constructing ? $"{d.displayName}\nBau… {slot.finishTick} Ticks" : $"{d.displayName}  S{slot.level}";
                }
                var b = UiKit.Btn(gridHost, label, () => OnSlot(p, idx));
                b.name = "slot" + i;
            }
        }

        void OnSlot(PlanetState p, int idx)
        {
            var slot = p.slots[idx];
            if (slot.constructing) { Toast("Noch im Bau."); return; }
            if (slot.id == BuildingId.None) OpenBuildMenu(p);
            else
            {
                var err = Simulation.Build(_g.State, _g.Catalog, p, slot.id);
                Toast(err ?? $"{_g.Catalog.Bld(slot.id).displayName} Ausbau gestartet.");
                Refresh();
            }
        }

        void OpenBuildMenu(PlanetState p)
        {
            ClearModal();
            _modal.gameObject.SetActive(true);
            var sheet = UiKit.Panel(_modal, "sheet");
            sheet.anchorMin = new Vector2(0.2f, 0.08f); sheet.anchorMax = new Vector2(0.8f, 0.9f);
            sheet.offsetMin = Vector2.zero; sheet.offsetMax = Vector2.zero;
            UiKit.Label(sheet, "t", "Gebäude errichten", 20, UiKit.Cyan, TextAnchor.UpperCenter);
            var tt = sheet.Find("t").GetComponent<RectTransform>();
            tt.anchorMin = new Vector2(0, 1); tt.anchorMax = Vector2.one; tt.offsetMin = new Vector2(0, -40); tt.offsetMax = Vector2.zero;
            var scroll = UiKit.Scroll(sheet);
            UiKit.Stretch(scroll.GetComponent<RectTransform>(), 12, 52, 12, 48);
            foreach (var def in _g.Catalog.AllBuildings)
            {
                if (def.homeOnly && !p.isHome) continue;
                var row = UiKit.Image(scroll.content, def.id.ToString(), Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.08f, 0.1f, 0.18f, 1f));
                UiKit.Size(row, 64);
                var cost = Simulation.UpgradeCost(def, p.LevelOf(def.id));
                string extra = def.hasProduction ? $"  +{def.baseYieldPerTick}/Tick" : "";
                UiKit.Label(row, "l", $"{def.displayName}{extra}\n{def.blurb}\n{CostText(cost)} · {def.buildTicks} Ticks", 14, UiKit.Text, TextAnchor.MiddleLeft, true);
                var id = def.id;
                var b = UiKit.Btn(row, "Bauen", () =>
                {
                    var err = Simulation.Build(_g.State, _g.Catalog, p, id);
                    CloseModal();
                    Toast(err ?? def.displayName + " im Bau.");
                    Refresh();
                });
                var br = b.GetComponent<RectTransform>();
                br.anchorMin = new Vector2(1, 0.2f); br.anchorMax = new Vector2(1, 0.8f);
                br.pivot = new Vector2(1, 0.5f);
                br.sizeDelta = new Vector2(110, 0);
                br.anchoredPosition = new Vector2(-10, 0);
            }
            var close = UiKit.Btn(sheet, "Schließen", CloseModal);
            var cr = close.GetComponent<RectTransform>();
            cr.anchorMin = new Vector2(0.35f, 0); cr.anchorMax = new Vector2(0.65f, 0);
            cr.offsetMin = new Vector2(0, 10); cr.offsetMax = new Vector2(0, 44);
        }

        string CostText(ResourceBag c)
        {
            var parts = new List<string>();
            foreach (ResourceId id in System.Enum.GetValues(typeof(ResourceId)))
                if (c[id] > 0) parts.Add($"{_g.Catalog.Res(id).shortName} {UiKit.Fmt(c[id])}");
            return parts.Count == 0 ? "—" : string.Join("  ", parts);
        }

        void DrawShipyard(RectTransform host, PlanetState p)
        {
            UiKit.Label(host, "h", "Werft  ·  Stationiert: " + CombatResolver.List(_g.Catalog, p.ShipMap()), 15, UiKit.Cyan, TextAnchor.UpperLeft, true);
            var hh = host.Find("h").GetComponent<RectTransform>();
            hh.anchorMin = new Vector2(0, 1); hh.anchorMax = Vector2.one; hh.offsetMin = new Vector2(10, -48); hh.offsetMax = new Vector2(-10, -8);
            var scroll = UiKit.Scroll(host);
            UiKit.Stretch(scroll.GetComponent<RectTransform>(), 8, 8, 8, 52);
            if (p.shipQueue.Count > 0)
            {
                var q = p.shipQueue[0];
                var row = UiKit.Image(scroll.content, "q", Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.1f, 0.14f, 0.22f, 1));
                UiKit.Size(row, 40);
                UiKit.Label(row, "t", $"In Produktion: {q.count}× {_g.Catalog.Ship(q.shipClass).displayName}  ({q.finishTick} Ticks)", 14, UiKit.Violet, TextAnchor.MiddleLeft);
            }
            foreach (var def in _g.Catalog.AllShips)
            {
                if (def.shipClass == ShipClass.Battleship || def.shipClass == ShipClass.Titan) continue; // MVP 4 Klassen + Kolonie
                var row = UiKit.Image(scroll.content, def.shipClass.ToString(), Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.08f, 0.1f, 0.18f, 1));
                UiKit.Size(row, 58);
                UiKit.Label(row, "l", $"{def.displayName}  ·  {def.ticksPerJump:0.#} Ticks/Sprung  ·  stark vs {def.strongVs}\n{CostText(def.cost)}  ·  {def.buildTicks} Ticks  ·  vor Ort {p.ShipCount(def.shipClass)}", 14, UiKit.Text, TextAnchor.MiddleLeft, true);
                var cls = def.shipClass;
                var b = UiKit.Btn(row, "+1", () =>
                {
                    var err = Simulation.QueueShip(_g.Catalog, p, cls, 1);
                    Toast(err ?? def.displayName + " in die Werft.");
                    Refresh();
                });
                var br = b.GetComponent<RectTransform>();
                br.anchorMin = new Vector2(1, 0.2f); br.anchorMax = new Vector2(1, 0.8f);
                br.pivot = new Vector2(1, 0.5f); br.sizeDelta = new Vector2(70, 0); br.anchoredPosition = new Vector2(-8, 0);
            }
        }

        void DrawMap()
        {
            var map = UiKit.Panel(_content, "map");
            map.anchorMin = Vector2.zero; map.anchorMax = new Vector2(0.58f, 1);
            map.offsetMin = Vector2.zero; map.offsetMax = new Vector2(-8, 0);
            UiKit.Label(map, "h", "Galaxie 1  ·  Klick = System", 16, UiKit.Cyan, TextAnchor.UpperLeft);
            var ht = map.Find("h").GetComponent<RectTransform>();
            ht.anchorMin = new Vector2(0, 1); ht.anchorMax = Vector2.one; ht.offsetMin = new Vector2(12, -36); ht.offsetMax = new Vector2(-12, -8);

            foreach (var sys in _g.State.systems)
            {
                int owned = 0, rem = 0;
                foreach (var pid in sys.planetIds)
                {
                    var pl = _g.State.Planet(pid);
                    if (pl.owner == OwnerId.Player) owned++;
                    if (pl.owner == OwnerId.Remnant) rem++;
                }
                var pos = sys.mapPos;
                var btn = UiKit.Btn(map, sys.name, () => { _selectedSystem = sys.index; Refresh(); }, owned > 0 ? UiKit.Cyan : (rem > 0 ? UiKit.Danger : UiKit.Muted));
                var rt = btn.GetComponent<RectTransform>();
                rt.anchorMin = rt.anchorMax = new Vector2(0, 0);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(140, 140);
                rt.anchoredPosition = pos;
                var img = btn.GetComponent<Image>();
                img.color = new Color(0.08f, 0.12f, 0.22f, 0.95f);
            }

            var list = UiKit.Panel(_content, "plist");
            list.anchorMin = new Vector2(0.58f, 0); list.anchorMax = Vector2.one;
            list.offsetMin = new Vector2(8, 0); list.offsetMax = Vector2.zero;
            var sysS = _g.State.System(_selectedSystem) ?? _g.State.systems[0];
            UiKit.Label(list, "h", sysS.name + "  ·  Planeten", 16, UiKit.Cyan, TextAnchor.UpperLeft);
            var hs = list.Find("h").GetComponent<RectTransform>();
            hs.anchorMin = new Vector2(0, 1); hs.anchorMax = Vector2.one; hs.offsetMin = new Vector2(10, -36); hs.offsetMax = new Vector2(-10, -8);
            var scroll = UiKit.Scroll(list);
            UiKit.Stretch(scroll.GetComponent<RectTransform>(), 8, 8, 8, 40);
            foreach (var pid in sysS.planetIds)
            {
                var pl = _g.State.Planet(pid);
                string own = pl.owner == OwnerId.Player ? "Dominium" : pl.owner == OwnerId.Remnant ? "Remnants" : "unbesetzt";
                var row = UiKit.Image(scroll.content, pid, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.08f, 0.1f, 0.18f, 1));
                UiKit.Size(row, 70);
                int jumps = Simulation.JumpsBetween(_g.State, _g.Focus, pl);
                UiKit.Label(row, "t", $"{pl.name}  ·  {_g.Catalog.Bio(pl.biome).displayName}  ·  {own}\nSprünge vom Fokus: {jumps}   Jäger {jumps * 1:0.#}T  Kreuzer {Mathf.CeilToInt(jumps * 3f)}T", 14, UiKit.Text, TextAnchor.MiddleLeft, true);
                var captured = pl;
                var focusBtn = UiKit.Btn(row, pl.owner == OwnerId.Player ? "Fokus" : "Mission", () =>
                {
                    if (captured.owner == OwnerId.Player) { _g.FocusPlanetId = captured.id; Show(ScreenId.Planet); }
                    else OpenMission(captured);
                });
                var br = focusBtn.GetComponent<RectTransform>();
                br.anchorMin = new Vector2(1, 0.2f); br.anchorMax = new Vector2(1, 0.8f);
                br.pivot = new Vector2(1, 0.5f); br.sizeDelta = new Vector2(100, 0); br.anchoredPosition = new Vector2(-8, 0);
            }
        }

        void OpenMission(PlanetState target)
        {
            _missionTarget = target.id;
            _picks.Clear();
            ClearModal();
            _modal.gameObject.SetActive(true);
            var from = _g.Focus;
            var sheet = UiKit.Panel(_modal, "sheet");
            sheet.anchorMin = new Vector2(0.22f, 0.12f); sheet.anchorMax = new Vector2(0.78f, 0.88f);
            sheet.offsetMin = Vector2.zero; sheet.offsetMax = Vector2.zero;
            int jumps = Mathf.Max(1, Simulation.JumpsBetween(_g.State, from, target));
            UiKit.Label(sheet, "t", $"Mission → {target.name}\n{jumps} Sprünge  ·  {OwnerLabel(target)}", 18, UiKit.Cyan, TextAnchor.UpperCenter, true);
            var tt = sheet.Find("t").GetComponent<RectTransform>();
            tt.anchorMin = new Vector2(0, 0.82f); tt.anchorMax = Vector2.one; tt.offsetMin = Vector2.zero; tt.offsetMax = Vector2.zero;

            var body = UiKit.Image(sheet, "body", new Vector2(0, 0.18f), new Vector2(1, 0.82f), new Vector2(16, 0), new Vector2(-16, 0), Color.clear);
            var v = body.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = 6; v.childForceExpandHeight = false; v.childForceExpandWidth = true; v.childControlHeight = true;
            foreach (var st in from.stationed)
            {
                if (st.count <= 0) continue;
                var def = _g.Catalog.Ship(st.shipClass);
                int ticks = Mathf.CeilToInt(jumps * def.ticksPerJump);
                var row = UiKit.Image(body, def.displayName, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.08f, 0.1f, 0.18f, 1));
                UiKit.Size(row, 36);
                UiKit.Label(row, "l", $"{def.displayName} (max {st.count})  ·  ETA {ticks} Ticks", 14, UiKit.Text, TextAnchor.MiddleLeft);
                var cls = st.shipClass;
                var b = UiKit.Btn(row, "+", () =>
                {
                    _picks.TryGetValue(cls, out int n);
                    _picks[cls] = Mathf.Min(st.count, n + 1);
                    Toast($"{def.displayName}: {_picks[cls]}");
                });
                var br = b.GetComponent<RectTransform>();
                br.anchorMin = new Vector2(1, 0.15f); br.anchorMax = new Vector2(1, 0.85f);
                br.pivot = new Vector2(1, 0.5f); br.sizeDelta = new Vector2(44, 0); br.anchoredPosition = new Vector2(-8, 0);
            }

            var actions = UiKit.Image(sheet, "a", Vector2.zero, new Vector2(1, 0.18f), new Vector2(16, 12), new Vector2(-16, -8), Color.clear);
            var ah = actions.gameObject.AddComponent<HorizontalLayoutGroup>();
            ah.spacing = 8; ah.childForceExpandWidth = true;
            if (target.owner == OwnerId.None)
                UiKit.Btn(actions, "Kolonisieren", () => Launch(target, FleetMission.Colonize));
            if (target.owner != OwnerId.Player)
                UiKit.Btn(actions, "Angriff (Vorschau)", () => PreviewAttack(from, target));
            UiKit.Btn(actions, "Abbrechen", CloseModal);
        }

        string OwnerLabel(PlanetState p)
        {
            if (p.owner == OwnerId.Player) return "eigen";
            if (p.owner == OwnerId.Remnant) return "Remnants";
            return "unbesetzt";
        }

        void PreviewAttack(PlanetState from, PlanetState target)
        {
            var ships = SelectedOrDefault(from);
            var preview = CombatResolver.Resolve(_g.Catalog, ships, target.ShipMap(), target.DefenseValue(_g.Catalog));
            Toast(preview.summary);
            var err = Simulation.SendFleet(_g.State, _g.Catalog, from, target, FleetMission.Attack, ships);
            CloseModal();
            if (err != null) Toast(err);
            else { Toast("Flotte unterwegs. " + preview.summary); Refresh(); }
        }

        Dictionary<ShipClass, int> SelectedOrDefault(PlanetState from)
        {
            var ships = new Dictionary<ShipClass, int>();
            foreach (var kv in _picks) if (kv.Value > 0) ships[kv.Key] = kv.Value;
            if (ships.Count == 0)
            {
                foreach (var st in from.stationed) if (st.count > 0) ships[st.shipClass] = st.count;
            }
            return ships;
        }

        void Launch(PlanetState target, FleetMission mission)
        {
            var from = _g.Focus;
            var ships = SelectedOrDefault(from);
            var err = Simulation.SendFleet(_g.State, _g.Catalog, from, target, mission, ships);
            CloseModal();
            Toast(err ?? "Flotte gestartet.");
            Refresh();
        }

        void DrawDominion()
        {
            var home = _g.State.Home;
            var banner = UiKit.Panel(_content, "home");
            banner.anchorMin = new Vector2(0, 0.72f); banner.anchorMax = Vector2.one;
            banner.offsetMin = Vector2.zero; banner.offsetMax = Vector2.zero;
            var prod = Simulation.ProductionPerTick(home, _g.Catalog);
            UiKit.Label(banner, "t", $"DOMINION OVERVIEW  ·  {_g.State.empireName}\nHAUPTPLANET  {home.name}  ·  {_g.Catalog.Bio(home.biome).displayName}  ·  Galaxie {home.galaxyIndex} → {_g.State.System(home.systemIndex).name}\nProduktion/Tick  ST {prod.stahl:0}  He3 {prod.helium3:0}  Ti {prod.titan:0}  EK {prod.crystal:0.0}   Def {home.DefenseValue(_g.Catalog)}", 18, UiKit.Cyan, TextAnchor.MiddleLeft, true);
            var bt = banner.Find("t").GetComponent<RectTransform>();
            UiKit.Stretch(bt, 18, 10, 18, 10);

            var list = UiKit.Panel(_content, "list");
            list.anchorMin = Vector2.zero; list.anchorMax = new Vector2(1, 0.72f);
            list.offsetMin = Vector2.zero; list.offsetMax = new Vector2(0, -8);
            var scroll = UiKit.Scroll(list);
            UiKit.Stretch(scroll.GetComponent<RectTransform>(), 8, 8, 8, 8);
            foreach (var p in _g.State.Owned(OwnerId.Player))
            {
                var pr = Simulation.ProductionPerTick(p, _g.Catalog);
                int j = Simulation.JumpsBetween(_g.State, home, p);
                string flights = $"Jäger {Mathf.Max(1, j)}T · Korvette {Mathf.CeilToInt(Mathf.Max(1, j) * 1.5f)}T · Zerstörer {Mathf.Max(1, j) * 2}T · Kreuzer {Mathf.Max(1, j) * 3}T · Kolonie {Mathf.Max(1, j) * 5}T";
                if (p.isHome) flights = "Heimat — keine Anreise";
                var row = UiKit.Image(scroll.content, p.id, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, p.isHome ? new Color(0.1f, 0.16f, 0.28f, 1) : new Color(0.08f, 0.1f, 0.18f, 1));
                UiKit.Size(row, 88);
                UiKit.Label(row, "l", $"{(p.isHome ? "★ " : "")}{p.name}  ·  {_g.Catalog.Bio(p.biome).displayName}\nGalaxie {p.galaxyIndex} → {_g.State.System(p.systemIndex).name}  ·  Distanz Heimat: {j} Sprünge\nProd ST {pr.stahl:0}/T  He3 {pr.helium3:0}/T  Ti {pr.titan:0}/T   Def {p.DefenseValue(_g.Catalog)}  ·  {CombatResolver.List(_g.Catalog, p.ShipMap())}\nFlugzeiten: {flights}", 14, UiKit.Text, TextAnchor.MiddleLeft, true);
                var captured = p;
                var b = UiKit.Btn(row, "Öffnen", () => { _g.FocusPlanetId = captured.id; Show(ScreenId.Planet); });
                var br = b.GetComponent<RectTransform>();
                br.anchorMin = new Vector2(1, 0.25f); br.anchorMax = new Vector2(1, 0.75f);
                br.pivot = new Vector2(1, 0.5f); br.sizeDelta = new Vector2(100, 0); br.anchoredPosition = new Vector2(-10, 0);
            }
        }

        void DrawFleets()
        {
            var panel = UiKit.Panel(_content, "f");
            UiKit.Stretch(panel);
            var scroll = UiKit.Scroll(panel);
            UiKit.Stretch(scroll.GetComponent<RectTransform>(), 8, 8, 8, 8);
            if (_g.State.fleets.Count == 0)
            {
                var row = UiKit.Image(scroll.content, "empty", Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, Color.clear);
                UiKit.Size(row, 40);
                UiKit.Label(row, "t", "Keine Flotten unterwegs. Missionen startest du über die Sternenkarte.", 16, UiKit.Muted, TextAnchor.MiddleLeft);
            }
            foreach (var f in _g.State.fleets)
            {
                var from = _g.State.Planet(f.originPlanetId);
                var to = _g.State.Planet(f.targetPlanetId);
                int left = Mathf.Max(0, f.arriveTick - _g.State.tick);
                var row = UiKit.Image(scroll.content, "fl" + f.id, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.08f, 0.1f, 0.18f, 1));
                UiKit.Size(row, 64);
                UiKit.Label(row, "t", $"{(f.returning ? "Rückflug" : f.mission.ToString())}  {from?.name} → {to?.name}\n{CombatResolver.List(_g.Catalog, StackMap(f.ships))}   ETA {left} Ticks (Tick {f.arriveTick})", 15, UiKit.Text, TextAnchor.MiddleLeft, true);
            }
            foreach (var log in _g.State.logs)
            {
                var row = UiKit.Image(scroll.content, "log" + log.tick, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, new Color(0.07f, 0.08f, 0.14f, 1));
                UiKit.Size(row, 70);
                UiKit.Label(row, "t", $"Tick {log.tick}  ·  {log.title}\n{log.body}", 14, UiKit.Muted, TextAnchor.MiddleLeft, true);
            }
        }

        Dictionary<ShipClass, int> StackMap(List<ShipStack> ships)
        {
            var m = new Dictionary<ShipClass, int>();
            foreach (var s in ships) m[s.shipClass] = s.count;
            return m;
        }

        void CloseModal()
        {
            ClearModal();
            _modal.gameObject.SetActive(false);
        }

        void ClearModal()
        {
            foreach (Transform t in _modal) Destroy(t.gameObject);
        }
    }
}
