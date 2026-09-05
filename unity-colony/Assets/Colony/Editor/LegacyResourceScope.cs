#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Colony.Editor
{
    // Unity includes every Resources asset, even if the scene never uses it.
    // Park obsolete art for the build and restore it with its GUIDs afterwards.
    // No source art is deleted. An interrupted build is recovered on next run.
    public sealed class LegacyResourceScope : IDisposable
    {
        const string ResourcesRoot = "Assets/Colony/Resources/";
        const string ArchiveRoot = "Assets/Colony/BuildArchive/";
        static readonly string[] Legacy = {
            "Buildings", "Iso", "Top", "Life", "Traffic", "Vista/desktop.jpg", "Vista/mobile.jpg",
            "deck.png", "empty-pad.png", "space-sky.jpg"
        };
        readonly List<string> _parked = new List<string>();
        static string Checked(string relative) {
            var project = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            var full = Path.GetFullPath(Path.Combine(project, relative));
            if (!full.StartsWith(project + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new Exception("Build resource path escapes the Unity project.");
            return full;
        }
        static bool Exists(string path) => File.Exists(Checked(path)) || Directory.Exists(Checked(path));
        static void Move(string source, string target) {
            Checked(source); Checked(target);
            Directory.CreateDirectory(Path.GetDirectoryName(Checked(target)));
            AssetDatabase.Refresh();
            string error = AssetDatabase.MoveAsset(source, target);
            if (!string.IsNullOrEmpty(error)) throw new Exception(error);
        }
        public LegacyResourceScope() {
            foreach (string item in Legacy) {
                var archive = ArchiveRoot + item; var original = ResourcesRoot + item;
                if (Exists(archive)) {
                    if (Exists(original)) throw new Exception("Both source and archived resource exist: " + item);
                    Move(archive, original);
                }
            }
            try {
                foreach (string item in Legacy) {
                    if (!Exists(ResourcesRoot + item)) continue;
                    Move(ResourcesRoot + item, ArchiveRoot + item);
                    _parked.Add(item);
                }
            } catch { Dispose(); throw; }
        }
        public void Dispose() {
            for (int i = _parked.Count - 1; i >= 0; i--)
                Move(ArchiveRoot + _parked[i], ResourcesRoot + _parked[i]);
            _parked.Clear();
        }
    }
}
#endif
