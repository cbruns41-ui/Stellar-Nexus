using UnityEngine;

namespace StellarNexus
{
    [DefaultExecutionOrder(-100)]
    public class GameRoot : MonoBehaviour
    {
        public Catalog Catalog { get; private set; }
        public GameState State { get; private set; }
        public GameTimeClock Clock { get; private set; }
        public HudController Hud { get; private set; }
        public string FocusPlanetId;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AutoBoot()
        {
            if (FindObjectOfType<GameRoot>() != null) return;
            var go = new GameObject("StellarNexus");
            DontDestroyOnLoad(go);
            go.AddComponent<GameRoot>();
        }

        void Awake()
        {
            Catalog = Catalog.CreateRuntime();
            Clock = new GameTimeClock();
            State = SaveSystem.TryLoad(Catalog);
            if (State == null) State = GameState.NewGame(Catalog, Random.Range(1, 999999), "Helion");
            FocusPlanetId = State.homePlanetId;
            Hud = gameObject.AddComponent<HudController>();
            Hud.Bind(this);
        }

        void Update()
        {
            int n = Clock.Advance(Time.unscaledDeltaTime);
            bool dirty = n > 0;
            for (int i = 0; i < n; i++) Simulation.ProcessTick(State, Catalog);
            if (Input.GetKeyDown(KeyCode.Space))
            {
                Simulation.ProcessTick(State, Catalog);
                Clock.Accrued = 0;
                dirty = true;
            }
            if (Input.GetKeyDown(KeyCode.Alpha1)) Hud.Show(ScreenId.Planet);
            if (Input.GetKeyDown(KeyCode.Alpha2)) Hud.Show(ScreenId.Map);
            if (Input.GetKeyDown(KeyCode.Alpha3)) Hud.Show(ScreenId.Dominion);
            if (Input.GetKeyDown(KeyCode.Alpha4)) Hud.Show(ScreenId.Fleets);
            if (Input.GetKeyDown(KeyCode.S) && (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl)))
            {
                SaveSystem.Save(State);
                Hud.Toast("Spielstand gespeichert.");
            }
            if (dirty) Hud.Refresh();
            else Hud.TickChrome();
        }

        public PlanetState Focus => State.Planet(FocusPlanetId) ?? State.Home;

        public void NewGame()
        {
            SaveSystem.Delete();
            State = GameState.NewGame(Catalog, Random.Range(1, 999999), "Helion");
            FocusPlanetId = State.homePlanetId;
            Clock.Accrued = 0;
            Hud.Refresh();
            Hud.Toast("Neues Dominium gegründet.");
        }
    }
}
