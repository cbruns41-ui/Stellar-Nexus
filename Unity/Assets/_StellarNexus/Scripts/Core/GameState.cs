using System;
using System.Collections.Generic;
using UnityEngine;

namespace StellarNexus
{
    [Serializable]
    public class BuildingSlot
    {
        public BuildingId id;
        public int level;
        public int finishTick; // 0 = idle/done
        public bool constructing;
    }

    [Serializable]
    public class ShipStack
    {
        public ShipClass shipClass;
        public int count;
    }

    [Serializable]
    public class ShipQueueItem
    {
        public ShipClass shipClass;
        public int count;
        public int finishTick;
    }

    [Serializable]
    public class PlanetState
    {
        public string id;
        public string name;
        public int galaxyIndex = 1;
        public int systemIndex;
        public int slot;
        public Biome biome;
        public OwnerId owner;
        public bool isHome;
        public ResourceBag multipliers;
        public ResourceId depositResource;
        public float depositMultiplier = 1f;
        public bool hasSpecialDeposit;
        public ResourceBag stock;
        public BuildingSlot[] slots = Array.Empty<BuildingSlot>();
        public List<ShipStack> stationed = new List<ShipStack>();
        public List<ShipQueueItem> shipQueue = new List<ShipQueueItem>();

        public int SlotCount => slots.Length;

        public int LevelOf(BuildingId id)
        {
            int best = 0;
            for (int i = 0; i < slots.Length; i++)
                if (slots[i].id == id && slots[i].level > 0) best = Mathf.Max(best, slots[i].level);
            return best;
        }

        public bool Has(BuildingId id) => LevelOf(id) > 0;

        public int ShipyardTier()
        {
            int t = 0;
            t = Mathf.Max(t, Has(BuildingId.ShipyardSmall) ? 1 : 0);
            t = Mathf.Max(t, Has(BuildingId.ShipyardMedium) ? 2 : 0);
            t = Mathf.Max(t, Has(BuildingId.ShipyardLarge) ? 3 : 0);
            return t;
        }

        public int DefenseValue(Catalog cat)
        {
            int d = 0;
            foreach (var s in slots)
            {
                if (s.id == BuildingId.None || s.level <= 0) continue;
                d += cat.Bld(s.id).defenseRating * s.level;
            }
            return d;
        }

        public int ShipCount(ShipClass cls)
        {
            foreach (var st in stationed) if (st.shipClass == cls) return st.count;
            return 0;
        }

        public void AddShips(ShipClass cls, int n)
        {
            if (n == 0) return;
            foreach (var st in stationed)
            {
                if (st.shipClass != cls) continue;
                st.count = Mathf.Max(0, st.count + n);
                stationed.RemoveAll(x => x.count <= 0);
                return;
            }
            if (n > 0) stationed.Add(new ShipStack { shipClass = cls, count = n });
        }

        public Dictionary<ShipClass, int> ShipMap()
        {
            var m = new Dictionary<ShipClass, int>();
            foreach (var st in stationed) if (st.count > 0) m[st.shipClass] = st.count;
            return m;
        }
    }

    [Serializable]
    public class StarSystemState
    {
        public int index;
        public string name;
        public Vector2 mapPos;
        public int[] links = Array.Empty<int>();
        public List<string> planetIds = new List<string>();
    }

    [Serializable]
    public class FleetState
    {
        public int id;
        public OwnerId owner;
        public FleetMission mission;
        public string originPlanetId;
        public string targetPlanetId;
        public List<ShipStack> ships = new List<ShipStack>();
        public int departTick;
        public int arriveTick;
        public bool returning;
        public string lastReport;
    }

    [Serializable]
    public class CombatLog
    {
        public int tick;
        public string title;
        public string body;
    }

    [Serializable]
    public class GameState
    {
        public int seed;
        public int tick;
        public string empireName = "Helion";
        public string homePlanetId;
        public int nextFleetId = 1;
        public ResourceBag storageCap = new ResourceBag { stahl = 8000, helium3 = 8000, titan = 5000, crystal = 3000, diamond = 1200, darkMatter = 400 };
        public List<StarSystemState> systems = new List<StarSystemState>();
        public List<PlanetState> planets = new List<PlanetState>();
        public List<FleetState> fleets = new List<FleetState>();
        public List<CombatLog> logs = new List<CombatLog>();

        public PlanetState Planet(string id)
        {
            foreach (var p in planets) if (p.id == id) return p;
            return null;
        }

        public PlanetState Home => Planet(homePlanetId);

        public StarSystemState System(int index)
        {
            foreach (var s in systems) if (s.index == index) return s;
            return null;
        }

        public IEnumerable<PlanetState> Owned(OwnerId owner)
        {
            foreach (var p in planets) if (p.owner == owner) yield return p;
        }

        public void PushLog(string title, string body)
        {
            logs.Insert(0, new CombatLog { tick = tick, title = title, body = body });
            if (logs.Count > 40) logs.RemoveRange(40, logs.Count - 40);
        }

        public static GameState NewGame(Catalog cat, int seed, string empireName = "Helion")
        {
            var rng = new System.Random(seed);
            var state = GalaxyGenerator.Generate(cat, rng, seed);
            state.empireName = empireName;
            return state;
        }
    }
}
