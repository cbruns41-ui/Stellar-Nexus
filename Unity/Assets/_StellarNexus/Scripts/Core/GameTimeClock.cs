using UnityEngine;

namespace StellarNexus
{
    /// <summary>1 Tick = 5 Minuten Echtzeit. Prototyp erlaubt Beschleunigung.</summary>
    public class GameTimeClock
    {
        public const float RealSecondsPerTick = 5f * 60f;

        public float SecondsPerTick = 8f; // Prototyp-Default, damit der Loop spürbar ist
        public float Speed = 1f;
        public float Accrued;

        public float Duration => Mathf.Max(0.25f, SecondsPerTick / Mathf.Max(0.1f, Speed));
        public float Progress => Mathf.Clamp01(Accrued / Duration);

        public int Advance(float dt)
        {
            Accrued += dt;
            int n = 0;
            while (Accrued >= Duration)
            {
                Accrued -= Duration;
                n++;
                if (n > 8) { Accrued = 0; break; }
            }
            return n;
        }

        public void ForceTick() => Accrued = Duration;
        public void UseRealtime() { SecondsPerTick = RealSecondsPerTick; Accrued = 0; }
        public void UsePrototype() { SecondsPerTick = 8f; Accrued = 0; }
    }
}
