using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace StellarNexus
{
    public class CombatPreview
    {
        public bool attackerWins;
        public Dictionary<ShipClass, int> attackerLosses = new Dictionary<ShipClass, int>();
        public Dictionary<ShipClass, int> defenderLosses = new Dictionary<ShipClass, int>();
        public Dictionary<ShipClass, int> attackerLeft = new Dictionary<ShipClass, int>();
        public Dictionary<ShipClass, int> defenderLeft = new Dictionary<ShipClass, int>();
        public string summary;
    }

    public static class CombatResolver
    {
        /// <summary>RPS: attacker class vs defender class multiplier.</summary>
        public static float Advantage(ShipClass atk, ShipClass def)
        {
            if (atk == ShipClass.Fighter && (def == ShipClass.Cruiser || def == ShipClass.Battleship)) return 1.75f;
            if (atk == ShipClass.Corvette && def == ShipClass.Fighter) return 1.75f;
            if (atk == ShipClass.Destroyer && def == ShipClass.Corvette) return 1.75f;
            if (atk == ShipClass.Cruiser && def == ShipClass.Destroyer) return 1.75f;
            if (atk == ShipClass.Battleship && def == ShipClass.Cruiser) return 1.75f;
            if (atk == ShipClass.Titan && (def == ShipClass.Battleship || def == ShipClass.Cruiser)) return 1.8f;

            if (def == ShipClass.Fighter && (atk == ShipClass.Cruiser || atk == ShipClass.Battleship)) return 0.55f;
            if (def == ShipClass.Corvette && atk == ShipClass.Fighter) return 0.55f;
            if (def == ShipClass.Destroyer && atk == ShipClass.Corvette) return 0.55f;
            if (def == ShipClass.Cruiser && atk == ShipClass.Destroyer) return 0.55f;
            if (def == ShipClass.Battleship && atk == ShipClass.Cruiser) return 0.55f;
            return 1f;
        }

        public static CombatPreview Resolve(Catalog cat, Dictionary<ShipClass, int> atk, Dictionary<ShipClass, int> def, int platformDefense)
        {
            var a = Clone(atk);
            var d = Clone(def);
            float defHpBonus = platformDefense * 8f;

            for (int round = 0; round < 8; round++)
            {
                float aAtk = Power(cat, a, d, true);
                float dAtk = Power(cat, d, a, false) + platformDefense * 1.2f;
                float aHp = Hp(cat, a);
                float dHp = Hp(cat, d) + (round == 0 ? defHpBonus : 0);
                if (aHp <= 0 || dHp <= 0) break;
                ApplyLosses(cat, d, Mathf.Clamp01(aAtk / Mathf.Max(1f, dHp)) * 0.45f);
                ApplyLosses(cat, a, Mathf.Clamp01(dAtk / Mathf.Max(1f, aHp)) * 0.45f);
            }

            var preview = new CombatPreview
            {
                attackerLeft = a,
                defenderLeft = d,
                attackerWins = Hp(cat, a) >= Hp(cat, d)
            };
            preview.attackerLosses = Diff(atk, a);
            preview.defenderLosses = Diff(def, d);
            preview.summary = BuildSummary(cat, preview);
            return preview;
        }

        static string BuildSummary(Catalog cat, CombatPreview p)
        {
            var sb = new StringBuilder();
            sb.Append(p.attackerWins ? "Sieg." : "Niederlage.");
            sb.Append(" Verluste Angreifer: ").Append(List(cat, p.attackerLosses));
            sb.Append(" | Verteidiger: ").Append(List(cat, p.defenderLosses));
            return sb.ToString();
        }

        public static string List(Catalog cat, Dictionary<ShipClass, int> map)
        {
            var parts = new List<string>();
            foreach (var kv in map) if (kv.Value > 0) parts.Add($"{kv.Value}× {cat.Ship(kv.Key).displayName}");
            return parts.Count == 0 ? "—" : string.Join(", ", parts);
        }

        static Dictionary<ShipClass, int> Clone(Dictionary<ShipClass, int> src)
        {
            var d = new Dictionary<ShipClass, int>();
            if (src == null) return d;
            foreach (var kv in src) if (kv.Value > 0) d[kv.Key] = kv.Value;
            return d;
        }

        static Dictionary<ShipClass, int> Diff(Dictionary<ShipClass, int> before, Dictionary<ShipClass, int> after)
        {
            var d = new Dictionary<ShipClass, int>();
            foreach (var kv in before)
            {
                after.TryGetValue(kv.Key, out int left);
                int lost = kv.Value - left;
                if (lost > 0) d[kv.Key] = lost;
            }
            return d;
        }

        static float Power(Catalog cat, Dictionary<ShipClass, int> self, Dictionary<ShipClass, int> enemy, bool titanBonus)
        {
            float p = 0;
            int enemyCount = Count(enemy);
            foreach (var kv in self)
            {
                var def = cat.Ship(kv.Key);
                float adv = AverageAdvantage(kv.Key, enemy);
                float t = 1f;
                if (titanBonus && kv.Key == ShipClass.Titan && enemyCount >= 12) t = 1.25f;
                p += def.attack * kv.Value * adv * t;
            }
            return p;
        }

        static float AverageAdvantage(ShipClass atk, Dictionary<ShipClass, int> enemy)
        {
            int n = Count(enemy);
            if (n <= 0) return 1f;
            float s = 0;
            foreach (var kv in enemy) s += Advantage(atk, kv.Key) * kv.Value;
            return s / n;
        }

        static float Hp(Catalog cat, Dictionary<ShipClass, int> map)
        {
            float h = 0;
            foreach (var kv in map)
            {
                var d = cat.Ship(kv.Key);
                h += (d.hull + d.shield) * kv.Value;
            }
            return h;
        }

        static int Count(Dictionary<ShipClass, int> map)
        {
            int n = 0;
            foreach (var kv in map) n += kv.Value;
            return n;
        }

        static void ApplyLosses(Catalog cat, Dictionary<ShipClass, int> map, float ratio)
        {
            if (ratio <= 0 || map.Count == 0) return;
            var keys = new List<ShipClass>(map.Keys);
            foreach (var k in keys)
            {
                int dead = Mathf.RoundToInt(map[k] * ratio);
                map[k] = Mathf.Max(0, map[k] - dead);
                if (map[k] <= 0) map.Remove(k);
            }
        }
    }
}
