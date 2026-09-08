import {api} from '../../js/api.js';
export const allianceId=Number(new URLSearchParams(location.search).get('alliance'))||0;
let key='nemesis-pending-live';
export function selectCommander(id){key='nemesis-pending-live-'+id;}
export function discardPending(){try{sessionStorage.removeItem(key);}catch{}session=null;frames=[];}
export let session=null,frames=[],savedResult=null;
let lastSave=0;
export function pending(){try{const p=JSON.parse(sessionStorage.getItem(key));if(p?.session?.id&&Array.isArray(p.frames)){session=p.session;frames=p.frames;return true;}}catch{}return false;}
export function persist(){if(session&&!savedResult)try{sessionStorage.setItem(key,JSON.stringify({session,frames}));}catch{}}
export async function beginLive(){session=await api('/alliances/boss/start',{method:'POST',body:{}});frames=[];savedResult=null;persist();return session;}
export function record(frame){frames.push(frame);if(performance.now()-lastSave>500){persist();lastSave=performance.now();}}
export async function finishLive(){if(savedResult)return savedResult;if(!session)return null;persist();const data=await api('/alliances/boss/finish',{method:'POST',body:{id:session.id,frames}});savedResult=data.result;try{sessionStorage.removeItem(key);}catch{}return savedResult;}
export const preview=()=>api('/alliances/'+allianceId);
export function closeLive(){if(parent!==window)parent.postMessage({type:'nemesis:close'},location.origin);else location.href='/';}
window.addEventListener('pagehide',persist);
