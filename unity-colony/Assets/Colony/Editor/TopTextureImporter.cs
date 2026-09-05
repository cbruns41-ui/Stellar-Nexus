#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace Colony.Editor
{
    public class TopTextureImporter : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            var path = assetPath.Replace('\\', '/');
            if (!path.Contains("/Resources/Top/")) return;
            var imp = (TextureImporter)assetImporter;
            bool ground = path.EndsWith("/ground.png");
            imp.textureType = TextureImporterType.Default;
            imp.sRGBTexture = true;
            imp.alphaSource = TextureImporterAlphaSource.FromInput;
            imp.alphaIsTransparency = !ground;
            imp.mipmapEnabled = true;
            imp.wrapMode = ground ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            imp.filterMode = FilterMode.Bilinear;
            imp.anisoLevel = ground ? 4 : 2;
            imp.npotScale = TextureImporterNPOTScale.ToNearest;
            imp.textureCompression = TextureImporterCompression.CompressedHQ;
            imp.maxTextureSize = 1024;
        }
    }
}
#endif
