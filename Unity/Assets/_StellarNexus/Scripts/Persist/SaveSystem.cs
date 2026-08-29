using System;
using System.IO;
using UnityEngine;

namespace StellarNexus
{
    public static class SaveSystem
    {
        static string PathFile => System.IO.Path.Combine(Application.persistentDataPath, "stellar-nexus-save.json");

        public static void Save(GameState state)
        {
            var json = JsonUtility.ToJson(state, true);
            File.WriteAllText(PathFile, json);
            Debug.Log("Gespeichert: " + PathFile);
        }

        public static GameState TryLoad(Catalog cat)
        {
            try
            {
                if (!File.Exists(PathFile)) return null;
                var json = File.ReadAllText(PathFile);
                var state = JsonUtility.FromJson<GameState>(json);
                if (state == null || state.planets == null || state.planets.Count == 0) return null;
                Normalize(state);
                return state;
            }
            catch (Exception e)
            {
                Debug.LogWarning("Save laden fehlgeschlagen: " + e.Message);
                return null;
            }
        }

        public static void Delete()
        {
            if (File.Exists(PathFile)) File.Delete(PathFile);
        }

        static void Normalize(GameState state)
        {
            if (state.fleets == null) state.fleets = new System.Collections.Generic.List<FleetState>();
            if (state.logs == null) state.logs = new System.Collections.Generic.List<CombatLog>();
            foreach (var p in state.planets)
            {
                if (p.stationed == null) p.stationed = new System.Collections.Generic.List<ShipStack>();
                if (p.shipQueue == null) p.shipQueue = new System.Collections.Generic.List<ShipQueueItem>();
                if (p.slots == null) p.slots = Array.Empty<BuildingSlot>();
            }
        }
    }
}
