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
            bool top = path.Contains("/Resources/Top/");
            bool iso = path.Contains("/Resources/Iso/");
            bool vista = path.Contains("/Resources/Vista/");
            bool life = path.Contains("/Resources/Life/") || path.Contains("/Resources/Traffic/");
            if (!top && !iso && !vista && !life) return;
            var imp = (TextureImporter)assetImporter;
            bool ground = path.EndsWith("/ground.png");
            imp.textureType = TextureImporterType.Default;
            imp.sRGBTexture = true;
            imp.alphaSource = TextureImporterAlphaSource.FromInput;
            imp.alphaIsTransparency = iso || life || (top && !ground);
            imp.mipmapEnabled = true;
            imp.wrapMode = ground ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            imp.filterMode = FilterMode.Bilinear;
            imp.anisoLevel = vista ? 4 : (ground ? 4 : 2);
            imp.npotScale = vista ? TextureImporterNPOTScale.None : TextureImporterNPOTScale.ToNearest;
            imp.textureCompression = TextureImporterCompression.CompressedHQ;
            imp.maxTextureSize = vista ? 4096 : 1024;
        }
    }
}
#endif
