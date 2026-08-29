#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace StellarNexus
{
    public static class StellarNexusMenus
    {
        [MenuItem("Stellar Nexus/Save löschen (Neues Spiel)")]
        static void WipeSave()
        {
            SaveSystem.Delete();
            Debug.Log("Stellar Nexus: Save gelöscht. Im Play-Mode entsteht ein neues Dominium.");
            if (Application.isPlaying)
            {
                var root = Object.FindObjectOfType<GameRoot>();
                if (root != null) root.NewGame();
            }
        }

        [MenuItem("Stellar Nexus/Save-Ordner öffnen")]
        static void OpenSaveFolder()
        {
            EditorUtility.RevealInFinder(Application.persistentDataPath);
        }
    }
}
#endif
