#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Colony.Editor
{
    public static class WebGLBuilder
    {
        const string ScenePath = "Assets/Scenes/Colony.unity";

        public static void Build()
        {
            EnsureScene();
            PlayerSettings.companyName = "Stellar Nexus";
            PlayerSettings.productName = "Colony";
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            PlayerSettings.SplashScreen.overlayOpacity = 0f;
            PlayerSettings.SplashScreen.backgroundColor = new Color(0.01f, 0.02f, 0.05f, 1f);
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.FullWithoutStacktrace;
            PlayerSettings.WebGL.dataCaching = false;
            PlayerSettings.WebGL.template = "APPLICATION:Minimal";
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.WebGL, ScriptingImplementation.IL2CPP);
            PinResourceShaders();

            var dest = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "public", "unity-colony"));
            // Build in place; never delete the user's existing WebGL output.
            var workspace = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".."));
            if (!dest.StartsWith(workspace + Path.DirectorySeparatorChar, System.StringComparison.OrdinalIgnoreCase))
                throw new System.Exception("WebGL destination must stay within the workspace.");
            Directory.CreateDirectory(dest);

            using (new LegacyResourceScope())
            {
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = new[] { ScenePath },
                    locationPathName = dest,
                    target = BuildTarget.WebGL,
                    options = BuildOptions.None
                });
                if (report.summary.result != BuildResult.Succeeded)
                    throw new System.Exception("WebGL build failed: " + report.summary.result);
            }
            Debug.Log("Colony WebGL written to " + dest);
        }

        static void EnsureScene()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.35f, 0.55f, 0.75f);
            RenderSettings.ambientEquatorColor = new Color(0.12f, 0.16f, 0.2f);
            RenderSettings.ambientGroundColor = new Color(0.04f, 0.05f, 0.06f);
            RenderSettings.fog = false;

            var root = new GameObject("ColonyRoot");
            root.AddComponent<ColonyRoot>();

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.01f, 0.02f, 0.05f);
            cam.orthographic = true;
            cam.orthographicSize = 8.4f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 40f;
            cam.transform.position = new Vector3(0f, 0f, -20f);
            cam.transform.rotation = Quaternion.identity;
            camGo.AddComponent<AudioListener>();
            camGo.AddComponent<ColonyCamera>();
            PinResourceShaders();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void PinResourceShaders()
        {
            foreach (var name in new[] { "ColonyLit", "ColonyUnlit", "ColonySky", "ColonySprite", "ColonyGround", "ColonyDeck", "ColonyPad", "ColonyTrail", "ColonySurface" })
            {
                var shader = Resources.Load<Shader>(name) ?? Shader.Find("Colony/" + name.Replace("Colony", ""));
                if (shader == null) shader = Shader.Find("Colony/Lit");
                if (shader == null) continue;
                var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
                go.name = "ShaderPin-" + name;
                go.transform.position = new Vector3(0f, -800f, 0f);
                go.GetComponent<MeshRenderer>().sharedMaterial = new Material(shader);
            }
            var unlitTex = Shader.Find("Unlit/Texture");
            if (unlitTex != null)
            {
                var pin = GameObject.CreatePrimitive(PrimitiveType.Quad);
                pin.name = "ShaderPin-UnlitTexture";
                pin.transform.position = new Vector3(0f, -810f, 0f);
                pin.GetComponent<MeshRenderer>().sharedMaterial = new Material(unlitTex);
            }
        }
    }
}
#endif
