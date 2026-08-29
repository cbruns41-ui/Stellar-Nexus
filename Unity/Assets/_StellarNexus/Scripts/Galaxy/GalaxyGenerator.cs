using System;
using System.Collections.Generic;
using UnityEngine;

namespace StellarNexus
{
    public static class GalaxyGenerator
    {
        static readonly string[] SysNames = { "Vesper", "Orion Gate", "Nyx Reach", "Helion Fold", "Kael Drift", "Rhea Veil", "Quar Deep", "Lumen Rim", "Aegis Halo", "Thal Spire" };
        static readonly string[] Prefix = { "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Sigma" };

        public static GameState Generate(Catalog cat, System.Random rng, int seed)
        {
            var state = new GameState { seed = seed, tick = 0 };
            // MVP: 2 Systeme. Für den vollen Entwurf auf 10 setzen (jedes 8–12 Planeten).
            int systemCount = 2;
            var biomes = (Biome[])Enum.GetValues(typeof(Biome));

            for (int s = 0; s < systemCount; s++)
            {
                var sys = new StarSystemState
                {
                    index = s + 1,
                    name = SysNames[s % SysNames.Length],
                    mapPos = new Vector2(s * 420f + 180f, 220f + (s % 2) * 40f)
                };
                int planetCount = 8 + rng.Next(0, 5); // 8–12
                for (int p = 0; p < planetCount; p++)
                {
                    var biome = biomes[rng.Next(biomes.Length)];
                    var bio = cat.Bio(biome);
                    var planet = new PlanetState
                    {
                        id = $"G1-S{sys.index}-P{p + 1}",
                        name = $"{Prefix[p % Prefix.Length]} {sys.name}",
                        galaxyIndex = 1,
                        systemIndex = sys.index,
                        slot = p + 1,
                        biome = biome,
                        owner = OwnerId.None,
                        multipliers = Jitter(bio.multipliers, rng),
                        stock = new ResourceBag(),
                        slots = MakeSlots(8)
                    };
                    if (rng.NextDouble() < 0.35)
                    {
                        planet.hasSpecialDeposit = true;
                        planet.depositResource = (ResourceId)rng.Next(0, 6);
                        planet.depositMultiplier = 1.4f + (float)rng.NextDouble() * 1.4f;
                    }
                    state.planets.Add(planet);
                    sys.planetIds.Add(planet.id);
                }
                state.systems.Add(sys);
            }

            for (int i = 0; i < state.systems.Count - 1; i++)
            {
                Link(state.systems[i], state.systems[i + 1]);
                Link(state.systems[i + 1], state.systems[i]);
            }

            // Home: first terran-like in system 1, else first planet
            PlanetState home = null;
            foreach (var p in state.planets)
            {
                if (p.systemIndex == 1 && (p.biome == Biome.Terran || p.biome == Biome.Ocean)) { home = p; break; }
            }
            home = home ?? state.planets[0];
            home.owner = OwnerId.Player;
            home.isHome = true;
            home.name = "Heimatwelt";
            home.slots = MakeSlots(12);
            home.slots[0] = new BuildingSlot { id = BuildingId.ColonialNexus, level = 1 };
            home.slots[1] = new BuildingSlot { id = BuildingId.SteelMine, level = 1 };
            home.slots[2] = new BuildingSlot { id = BuildingId.FuelRefinery, level = 1 };
            home.slots[3] = new BuildingSlot { id = BuildingId.ShipyardSmall, level = 1 };
            home.stock = new ResourceBag { stahl = 900, helium3 = 700, titan = 280, crystal = 90, diamond = 12, darkMatter = 0 };
            home.AddShips(ShipClass.Fighter, 6);
            home.AddShips(ShipClass.Corvette, 2);
            home.AddShips(ShipClass.Colony, 1);
            state.homePlanetId = home.id;

            // Remnant garrisons on a few worlds
            int remnants = 0;
            foreach (var p in state.planets)
            {
                if (p.owner != OwnerId.None) continue;
                if (rng.NextDouble() > 0.28 || remnants >= 5) continue;
                p.owner = OwnerId.Remnant;
                p.AddShips(ShipClass.Fighter, 4 + rng.Next(6));
                p.AddShips(ShipClass.Corvette, rng.Next(3));
                if (p.systemIndex > 1) p.AddShips(ShipClass.Destroyer, rng.Next(2));
                remnants++;
            }

            state.PushLog("Nexus online", "Kolonialzentrum steht. Baue Minen aus, fertige Kolonialschiffe, dann nimm die Sternenkarte.");
            return state;
        }

        static BuildingSlot[] MakeSlots(int n)
        {
            var a = new BuildingSlot[n];
            for (int i = 0; i < n; i++) a[i] = new BuildingSlot { id = BuildingId.None };
            return a;
        }

        static void Link(StarSystemState a, StarSystemState b)
        {
            var list = new List<int>(a.links);
            if (!list.Contains(b.index)) list.Add(b.index);
            a.links = list.ToArray();
        }

        static ResourceBag Jitter(ResourceBag m, System.Random rng)
        {
            float J() => 0.85f + (float)rng.NextDouble() * 0.3f;
            return new ResourceBag
            {
                stahl = m.stahl * J(),
                helium3 = m.helium3 * J(),
                titan = m.titan * J(),
                crystal = m.crystal * J(),
                diamond = m.diamond * J(),
                darkMatter = m.darkMatter * J()
            };
        }
    }
}
