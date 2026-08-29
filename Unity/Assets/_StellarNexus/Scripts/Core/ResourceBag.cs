using System;
using UnityEngine;

namespace StellarNexus
{
    [Serializable]
    public struct ResourceBag
    {
        public float stahl;
        public float helium3;
        public float titan;
        public float crystal;
        public float diamond;
        public float darkMatter;

        public static ResourceBag Ones => new ResourceBag
        {
            stahl = 1, helium3 = 1, titan = 1, crystal = 1, diamond = 1, darkMatter = 1
        };

        public float this[ResourceId id]
        {
            get
            {
                switch (id)
                {
                    case ResourceId.Stahl: return stahl;
                    case ResourceId.Helium3: return helium3;
                    case ResourceId.Titan: return titan;
                    case ResourceId.EnergyCrystal: return crystal;
                    case ResourceId.Diamond: return diamond;
                    case ResourceId.DarkMatter: return darkMatter;
                    default: return 0;
                }
            }
            set
            {
                switch (id)
                {
                    case ResourceId.Stahl: stahl = value; break;
                    case ResourceId.Helium3: helium3 = value; break;
                    case ResourceId.Titan: titan = value; break;
                    case ResourceId.EnergyCrystal: crystal = value; break;
                    case ResourceId.Diamond: diamond = value; break;
                    case ResourceId.DarkMatter: darkMatter = value; break;
                }
            }
        }

        public static ResourceBag Of(ResourceId id, float amount)
        {
            var b = new ResourceBag();
            b[id] = amount;
            return b;
        }

        public static ResourceBag operator +(ResourceBag a, ResourceBag b)
        {
            return new ResourceBag
            {
                stahl = a.stahl + b.stahl,
                helium3 = a.helium3 + b.helium3,
                titan = a.titan + b.titan,
                crystal = a.crystal + b.crystal,
                diamond = a.diamond + b.diamond,
                darkMatter = a.darkMatter + b.darkMatter
            };
        }

        public static ResourceBag operator -(ResourceBag a, ResourceBag b)
        {
            return new ResourceBag
            {
                stahl = a.stahl - b.stahl,
                helium3 = a.helium3 - b.helium3,
                titan = a.titan - b.titan,
                crystal = a.crystal - b.crystal,
                diamond = a.diamond - b.diamond,
                darkMatter = a.darkMatter - b.darkMatter
            };
        }

        public ResourceBag Scaled(float m)
        {
            return new ResourceBag
            {
                stahl = stahl * m,
                helium3 = helium3 * m,
                titan = titan * m,
                crystal = crystal * m,
                diamond = diamond * m,
                darkMatter = darkMatter * m
            };
        }

        public ResourceBag CeilToInt()
        {
            return new ResourceBag
            {
                stahl = Mathf.Ceil(stahl),
                helium3 = Mathf.Ceil(helium3),
                titan = Mathf.Ceil(titan),
                crystal = Mathf.Ceil(crystal),
                diamond = Mathf.Ceil(diamond),
                darkMatter = Mathf.Ceil(darkMatter)
            };
        }

        public bool CanAfford(ResourceBag cost)
        {
            return stahl >= cost.stahl && helium3 >= cost.helium3 && titan >= cost.titan
                   && crystal >= cost.crystal && diamond >= cost.diamond && darkMatter >= cost.darkMatter;
        }

        public ResourceBag ClampMinZero()
        {
            return new ResourceBag
            {
                stahl = Mathf.Max(0, stahl),
                helium3 = Mathf.Max(0, helium3),
                titan = Mathf.Max(0, titan),
                crystal = Mathf.Max(0, crystal),
                diamond = Mathf.Max(0, diamond),
                darkMatter = Mathf.Max(0, darkMatter)
            };
        }

        public float Sum => stahl + helium3 + titan + crystal + diamond + darkMatter;
    }
}
