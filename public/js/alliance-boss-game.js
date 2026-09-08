export function startAllianceBossEncounter({detail,onDone}) {
 if(document.getElementById("nemesis-encounter"))return;
 const wrap=document.createElement("section");wrap.id="nemesis-encounter";wrap.setAttribute("role","dialog");wrap.setAttribute("aria-modal","true");wrap.setAttribute("aria-label","NEMESIS Allianz-Bosskampf");
 wrap.style.cssText="position:fixed;inset:0;z-index:10000;background:#07131e";
 const frame=document.createElement("iframe");frame.title="NEMESIS Allianz-Bosskampf";frame.src="/demos/nemesis/?alliance="+encodeURIComponent(detail.id);
 frame.style.cssText="border:0;width:100%;height:100%;display:block";wrap.append(frame);
 const previous=document.activeElement;
 const close=async event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=="nemesis:close")return;
  window.removeEventListener("message",close);wrap.remove();previous?.focus();await onDone?.();
 };
 window.addEventListener("message",close);document.body.append(wrap);frame.focus();
}
