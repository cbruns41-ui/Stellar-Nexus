using System.Collections.Generic;
using UnityEngine;

namespace StellarNexus
{
    public static class Simulation
    {
        public static void ProcessTick(GameState state, Catalog cat)
        {
            state.tick++;
            foreach (var p in state.planets)
            {
                if (p.owner == OwnerId.None) continue;
                CompleteConstruction(p);
                CompleteShips(p);
                if (p.owner == OwnerId.Player) Produce(p, cat, state);
            }
            ResolveArrivals(state, cat);
        }

        public static ResourceBag ProductionPerTick(PlanetState p, Catalog cat)
        {
            var bag = new ResourceBag();
            foreach (var slot in p.slots)
            {
                if (slot.id == BuildingId.None || slot.level <= 0) continue;
                var def = cat.Bld(slot.id);
                if (!def.hasProduction) continue;
                float y = def.baseYieldPerTick * slot.level * (1f + 0.12f * (slot.level - 1));
                y *= p.multipliers[def.produces];
                if (p.hasSpecialDeposit && p.depositResource == def.produces) y *= p.depositMultiplier;
                bag[def.produces] += y;
            }
            return bag;
        }

        public static float StorageCap(PlanetState p, Catalog cat, ResourceId id)
        {
            float cap = id == ResourceId.Stahl || id == ResourceId.Helium3 ? 8000 : 4000;
            if (id == ResourceId.Diamond) cap = 1500;
            if (id == ResourceId.DarkMatter) cap = 400;
            foreach (var slot in p.slots)
            {
                if (slot.constructing || slot.id == BuildingId.None) continue;
                cap += cat.Bld(slot.id).storageBonus * slot.level;
            }
            return cap;
        }

        static void Produce(PlanetState p, Catalog cat, GameState state)
        {
            var prod = ProductionPerTick(p, cat);
            var next = p.stock + prod;
            foreach (ResourceId id in System.Enum.GetValues(typeof(ResourceId)))
                next[id] = Mathf.Min(next[id], StorageCap(p, cat, id));
            p.stock = next;
        }

        static void CompleteConstruction(PlanetState p)
        {
            foreach (var s in p.slots)
            {
                if (!s.constructing) continue;
                s.finishTick--;
                if (s.finishTick > 0) continue;
                s.constructing = false;
                s.finishTick = 0;
                s.level += 1;
            }
        }

        static void CompleteShips(PlanetState p)
        {
            for (int i = p.shipQueue.Count - 1; i >= 0; i--)
            {
                var q = p.shipQueue[i];
                q.finishTick--;
                if (q.finishTick > 0) continue;
                p.AddShips(q.shipClass, q.count);
                p.shipQueue.RemoveAt(i);
            }
        }

        public static ResourceBag UpgradeCost(BuildingDef def, int currentLevel)
        {
            return def.cost.Scaled(Mathf.Pow(def.costFactor, currentLevel)).CeilToInt();
        }

        public static string CanBuild(GameState state, Catalog cat, PlanetState planet, BuildingId id)
        {
            var def = cat.Bld(id);
            if (def.homeOnly && !planet.isHome) return "Nur auf der Heimatwelt.";
            if (def.requiresBuilding != BuildingId.None && planet.LevelOf(def.requiresBuilding) < def.requiresLevel)
                return $"Benötigt {cat.Bld(def.requiresBuilding).displayName} Stufe {def.requiresLevel}.";
            int existing = planet.LevelOf(id);
            if (existing >= def.maxLevel) return "Maximalstufe.";
            bool upgrading = false;
            foreach (var s in planet.slots)
                if (s.id == id && !s.constructing) { upgrading = true; break; }
            if (!upgrading)
            {
                bool free = false;
                foreach (var s in planet.slots) if (s.id == BuildingId.None && !s.constructing) { free = true; break; }
                if (!free) return "Keine freien Bauslots. Baue Wohnkuppeln.";
            }
            var cost = UpgradeCost(def, existing);
            if (!planet.stock.CanAfford(cost)) return "Nicht genug Ressourcen.";
            foreach (var s in planet.slots) if (s.constructing) return "Bauschleife belegt.";
            return null;
        }

        public static string Build(GameState state, Catalog cat, PlanetState planet, BuildingId id)
        {
            var err = CanBuild(state, cat, planet, id);
            if (err != null) return err;
            var def = cat.Bld(id);
            int existing = planet.LevelOf(id);
            var cost = UpgradeCost(def, existing);
            planet.stock -= cost;
            if (existing > 0)
            {
                foreach (var s in planet.slots)
                {
                    if (s.id != id || s.constructing) continue;
                    s.constructing = true;
                    s.finishTick = Mathf.Max(1, def.buildTicks + existing);
                    return null;
                }
            }
            foreach (var s in planet.slots)
            {
                if (s.id != BuildingId.None) continue;
                s.id = id;
                s.level = 0;
                s.constructing = true;
                s.finishTick = Mathf.Max(1, def.buildTicks);
                return null;
            }
            return "Kein Slot.";
        }

        public static string CanQueueShip(Catalog cat, PlanetState planet, ShipClass cls, int qty)
        {
            var def = cat.Ship(cls);
            if (qty < 1) return "Menge ungültig.";
            if (planet.shipQueue.Count > 0) return "Werft belegt.";
            if (planet.ShipyardTier() < def.shipyardTierRequired) return "Werft-Stufe zu niedrig.";
            if (def.needsColonialNexus && !planet.Has(BuildingId.ColonialNexus)) return "Kolonialzentrum erforderlich.";
            var cost = def.cost.Scaled(qty);
            if (!planet.stock.CanAfford(cost)) return "Nicht genug Ressourcen.";
            return null;
        }

        public static string QueueShip(Catalog cat, PlanetState planet, ShipClass cls, int qty)
        {
            var err = CanQueueShip(cat, planet, cls, qty);
            if (err != null) return err;
            var def = cat.Ship(cls);
            planet.stock -= def.cost.Scaled(qty);
            int ticks = Mathf.Max(1, Mathf.CeilToInt(def.buildTicks * qty / (1f + 0.15f * planet.ShipyardTier())));
            planet.shipQueue.Add(new ShipQueueItem { shipClass = cls, count = qty, finishTick = ticks });
            return null;
        }

        public static int JumpsBetween(GameState state, PlanetState a, PlanetState b)
        {
            if (a.id == b.id) return 0;
            if (a.systemIndex == b.systemIndex) return 1;
            int hops = SystemHops(state, a.systemIndex, b.systemIndex);
            return hops + 1;
        }

        static int SystemHops(GameState state, int from, int to)
        {
            if (from == to) return 0;
            var q = new Queue<(int id, int d)>();
            var seen = new HashSet<int> { from };
            q.Enqueue((from, 0));
            while (q.Count > 0)
            {
                var (id, d) = q.Dequeue();
                var sys = state.System(id);
                if (sys == null) continue;
                foreach (var n in sys.links)
                {
                    if (seen.Contains(n)) continue;
                    if (n == to) return d + 1;
                    seen.Add(n);
                    q.Enqueue((n, d + 1));
                }
            }
            return 8;
        }

        public static int TravelTicks(Catalog cat, GameState state, PlanetState from, PlanetState to, Dictionary<ShipClass, int> ships)
        {
            int jumps = Mathf.Max(1, JumpsBetween(state, from, to));
            float slowest = 1f;
            bool any = false;
            foreach (var kv in ships)
            {
                if (kv.Value <= 0) continue;
                any = true;
                slowest = Mathf.Max(slowest, cat.Ship(kv.Key).ticksPerJump);
            }
            if (!any) slowest = 1f;
            return Mathf.Max(1, Mathf.CeilToInt(jumps * slowest));
        }

        public static string SendFleet(GameState state, Catalog cat, PlanetState from, PlanetState to, FleetMission mission, Dictionary<ShipClass, int> ships)
        {
            if (from.owner != OwnerId.Player) return "Kein Kommando über Startplanet.";
            if (from.id == to.id) return "Ziel = Start.";
            bool any = false;
            foreach (var kv in ships)
            {
                if (kv.Value <= 0) continue;
                any = true;
                if (from.ShipCount(kv.Key) < kv.Value) return $"Nicht genug {cat.Ship(kv.Key).displayName}.";
            }
            if (!any) return "Keine Schiffe.";
            if (mission == FleetMission.Colonize)
            {
                ships.TryGetValue(ShipClass.Colony, out int col);
                if (col < 1) return "Kolonialschiff erforderlich.";
                if (to.owner != OwnerId.None) return "Planet ist besetzt. Erst angreifen.";
            }
            if (mission == FleetMission.Attack && to.owner == OwnerId.Player) return "Eigene Welt.";
            if (mission == FleetMission.Move && to.owner != OwnerId.Player) return "Stationieren nur auf eigenen Planeten.";

            foreach (var kv in ships) from.AddShips(kv.Key, -kv.Value);
            int eta = state.tick + TravelTicks(cat, state, from, to, ships);
            var fleet = new FleetState
            {
                id = state.nextFleetId++,
                owner = OwnerId.Player,
                mission = mission,
                originPlanetId = from.id,
                targetPlanetId = to.id,
                departTick = state.tick,
                arriveTick = eta
            };
            foreach (var kv in ships)
                if (kv.Value > 0) fleet.ships.Add(new ShipStack { shipClass = kv.Key, count = kv.Value });
            state.fleets.Add(fleet);
            return null;
        }

        static Dictionary<ShipClass, int> ToMap(List<ShipStack> list)
        {
            var m = new Dictionary<ShipClass, int>();
            foreach (var s in list) if (s.count > 0) m[s.shipClass] = s.count;
            return m;
        }

        static void ResolveArrivals(GameState state, Catalog cat)
        {
            for (int i = state.fleets.Count - 1; i >= 0; i--)
            {
                var f = state.fleets[i];
                if (f.arriveTick > state.tick) continue;
                var target = state.Planet(f.targetPlanetId);
                var origin = state.Planet(f.originPlanetId);
                if (target == null) { state.fleets.RemoveAt(i); continue; }

                if (f.returning)
                {
                    if (target.owner == OwnerId.Player) ApplyShips(target, f.ships);
                    else if (origin != null && origin.owner == OwnerId.Player) ApplyShips(origin, f.ships);
                    state.fleets.RemoveAt(i);
                    continue;
                }

                if (f.mission == FleetMission.Move)
                {
                    if (target.owner == OwnerId.Player) ApplyShips(target, f.ships);
                    else LaunchReturn(state, f);
                    continue;
                }

                if (f.mission == FleetMission.Colonize)
                {
                    ResolveColonize(state, cat, f, target);
                    continue;
                }

                if (f.mission == FleetMission.Attack)
                    ResolveAttack(state, cat, f, target);
            }
        }

        static void ApplyShips(PlanetState p, List<ShipStack> ships)
        {
            foreach (var s in ships) p.AddShips(s.shipClass, s.count);
        }

        static void LaunchReturn(GameState state, FleetState f)
        {
            int travel = Mathf.Max(1, f.arriveTick - f.departTick);
            string dest = f.originPlanetId;
            f.originPlanetId = f.targetPlanetId;
            f.targetPlanetId = dest;
            f.returning = true;
            f.departTick = state.tick;
            f.arriveTick = state.tick + travel;
        }

        static void ResolveColonize(GameState state, Catalog cat, FleetState f, PlanetState target)
        {
            int colony = 0;
            foreach (var s in f.ships) if (s.shipClass == ShipClass.Colony) colony += s.count;
            if (target.owner != OwnerId.None || colony < 1)
            {
                state.PushLog("Kolonisation gescheitert", $"{target.name} konnte nicht genommen werden.");
                LaunchReturn(state, f);
                return;
            }
            target.owner = OwnerId.Player;
            target.stock += new ResourceBag { stahl = 180, helium3 = 140, titan = 40 };
            foreach (var s in f.ships)
            {
                if (s.shipClass == ShipClass.Colony) s.count -= 1;
            }
            f.ships.RemoveAll(x => x.count <= 0);
            state.PushLog("Welt kolonisiert", $"{target.name} ({cat.Bio(target.biome).displayName}) gehört jetzt zum Dominium.");
            if (f.ships.Count > 0) LaunchReturn(state, f);
            else state.fleets.Remove(f);
        }

        static void ResolveAttack(GameState state, Catalog cat, FleetState f, PlanetState target)
        {
            var atk = ToMap(f.ships);
            var def = target.ShipMap();
            int plat = target.owner == OwnerId.None ? 0 : target.DefenseValue(cat);
            var result = CombatResolver.Resolve(cat, atk, def, plat);
            ApplyMapToPlanet(target, result.defenderLeft);
            f.ships.Clear();
            foreach (var kv in result.attackerLeft)
                f.ships.Add(new ShipStack { shipClass = kv.Key, count = kv.Value });

            string title = result.attackerWins ? $"Schlacht um {target.name} — Sieg" : $"Schlacht um {target.name} — Niederlage";
            state.PushLog(title, result.summary);

            if (result.attackerWins && target.owner == OwnerId.Remnant)
            {
                target.owner = OwnerId.None;
                target.stationed.Clear();
                state.PushLog("Remnants vertrieben", $"{target.name} ist unbesetzt und kann kolonisiert werden.");
            }

            if (f.ships.Count > 0) LaunchReturn(state, f);
            else state.fleets.Remove(f);
        }

        static void ApplyMapToPlanet(PlanetState p, Dictionary<ShipClass, int> map)
        {
            p.stationed.Clear();
            foreach (var kv in map) if (kv.Value > 0) p.stationed.Add(new ShipStack { shipClass = kv.Key, count = kv.Value });
        }
    }
}
