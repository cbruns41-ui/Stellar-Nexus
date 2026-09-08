using UnityEngine;

namespace StellarNexus.Preview {
 [ExecuteAlways,RequireComponent(typeof(Camera))]
 public class CombatFinish:MonoBehaviour {
  public Shader FinishShader;
  Material material;
  void OnRenderImage(RenderTexture source,RenderTexture destination) {
   if(!FinishShader || !FinishShader.isSupported){Graphics.Blit(source,destination);return;}
   if(!material)material=new Material(FinishShader){hideFlags=HideFlags.HideAndDontSave};
   int w=Mathf.Max(1,source.width/4),h=Mathf.Max(1,source.height/4);
   var a=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.ARGBHalf);
   var b=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.ARGBHalf);
   Graphics.Blit(source,a,material,0);
   for(int i=0;i<3;i++) {
    material.SetVector("_Direction",new Vector4(1f/w,0,0,0));Graphics.Blit(a,b,material,1);
    material.SetVector("_Direction",new Vector4(0,1f/h,0,0));Graphics.Blit(b,a,material,1);
   }
   material.SetTexture("_Bloom",a);Graphics.Blit(source,destination,material,2);
   RenderTexture.ReleaseTemporary(a);RenderTexture.ReleaseTemporary(b);
  }
  void OnDisable(){if(material){if(Application.isPlaying)Destroy(material);else DestroyImmediate(material);}}
 }
}
