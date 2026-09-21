export async function bootForum(host,{api,esc,toast}) {
  if(!host)return;
  let category='',page=0,thread=null,replyPage=0,version=0;
  const date=at=>esc(new Date(at).toLocaleString('de-DE'));
  const post=(url,body)=>api(url,{method:'POST',body});
  const pager=(more,current)=>`<div class="row"><button class="btn ghost" data-page="-1" ${current?'':'disabled'}>Zurück</button><span>Seite ${current+1}</span><button class="btn ghost" data-page="1" ${more?'':'disabled'}>Weiter</button></div>`;
  async function draw(){
    const request=++version;
    try{
      const data=await api(thread?`/forum/${thread}?offset=${replyPage*50}`:`/forum?category=${category}&offset=${page*50}`);
      if(!host.isConnected||request!==version)return;
      if(!thread){
        host.innerHTML=`<h2>Community-Forum</h2><p class="hint">Ideen austauschen, Probleme melden und gemeinsam diskutieren. Beiträge sind für alle angemeldeten Spieler sichtbar. Bitte keine Passwörter oder privaten Kontaktdaten posten.</p>
          <label>Kategorie<select id="forum-category"><option value="">Alle Themen</option>${Object.entries(data.categories).map(([id,name])=>`<option value="${id}" ${category===id?'selected':''}>${esc(name)}</option>`).join('')}</select></label>
          <details class="panel" style="padding:12px;margin:12px 0"><summary>Neues Thema erstellen</summary><form id="forum-create" class="stack">
          <label>Kategorie<select name="category">${Object.entries(data.categories).map(([id,name])=>`<option value="${id}" ${category===id?'selected':''}>${esc(name)}</option>`).join('')}</select></label>
          <label>Titel<input name="title" required minlength="3" maxlength="100"></label><label>Beitrag<textarea name="body" required minlength="3" maxlength="5000" rows="6"></textarea></label><button class="btn primary">Thema veröffentlichen</button></form></details>
          <div class="stack">${data.topics.map(t=>`<button class="btn ghost" style="text-align:left;white-space:normal;overflow-wrap:anywhere" data-topic="${t.id}"><b>${esc(t.title)}</b><br><small>${esc(data.categories[t.category])} · ${esc(t.author)} · ${t.replies} Antworten${t.locked?' · Geschlossen':''}<br>Letzte Aktivität: ${date(t.updated_at)}</small></button>`).join('')||'<p>Noch keine Themen in dieser Kategorie.</p>'}</div>${pager(data.more,page)}`;
        host.querySelector('#forum-category').onchange=e=>{category=e.target.value;page=0;draw();};
        host.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{thread=Number(b.dataset.topic);replyPage=0;draw();});
        submit('#forum-create',async form=>{const result=await post('/forum',Object.fromEntries(new FormData(form)));thread=result.id;replyPage=0;});
      }else{
        const t=data.topic;
        const article=(p,original=false)=>`<article class="panel" style="padding:12px;margin:12px 0"><p class="muted">${esc(p.author)} · ${date(p.created_at)}${original?' · Themenstart':''}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(p.body)}</div>${!original&&data.canModerate?`<button class="btn ghost small" data-delete-reply="${p.id}">Antwort löschen</button>`:''}</article>`;
        host.innerHTML=`<button class="btn ghost" id="forum-back">Zur Themenübersicht</button><h2 style="overflow-wrap:anywhere">${esc(t.title)}</h2>${article(t,true)}<h3>Antworten</h3>${data.replies.map(r=>article(r)).join('')||'<p>Noch keine Antworten.</p>'}${pager(data.more,replyPage)}
          ${t.locked?'<p class="hint">Dieses Thema ist geschlossen.</p>':`<form id="forum-reply" class="stack"><label>Deine Antwort<textarea name="body" required maxlength="5000" rows="5"></textarea></label><button class="btn primary">Antwort veröffentlichen</button></form>`}
          ${data.canModerate?`<div class="row" style="margin-top:16px"><button class="btn ghost" id="forum-lock">Thema ${t.locked?'öffnen':'schließen'}</button><button class="btn danger" id="forum-delete">Thema löschen</button></div>`:''}`;
        host.querySelector('#forum-back').onclick=()=>{thread=null;draw();};
        submit('#forum-reply',async form=>{await post(`/forum/${thread}/replies`,Object.fromEntries(new FormData(form)));replyPage=Math.floor(data.replyCount/50);toast('Antwort veröffentlicht.');});
        const mod=async body=>{try{await post(`/forum/${t.id}/moderate`,body);if(body.action==='delete')thread=null;await draw();}catch(e){toast(e.message,true);}};
        host.querySelector('#forum-lock')?.addEventListener('click',()=>mod({action:'lock',locked:!t.locked}));
        host.querySelector('#forum-delete')?.addEventListener('click',()=>{if(confirm('Thema mit allen Antworten löschen?'))mod({action:'delete'});});
        host.querySelectorAll('[data-delete-reply]').forEach(b=>b.onclick=()=>{if(confirm('Diese Antwort löschen?'))mod({action:'deleteReply',replyId:Number(b.dataset.deleteReply)});});
      }
      host.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(thread)replyPage+=Number(b.dataset.page);else page+=Number(b.dataset.page);draw();});
    }catch(e){if(host.isConnected&&request===version){toast(e.message,true);if(!host.querySelector('button'))host.innerHTML='<p>Forum konnte nicht geladen werden.</p><button class="btn" id="forum-retry">Erneut versuchen</button>';host.querySelector('#forum-retry')?.addEventListener('click',draw);}}
  }
  function submit(selector,action){const form=host.querySelector(selector);if(!form)return;form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{await action(form);await draw();}catch(err){toast(err.message,true);}finally{button.disabled=false;}};}
  await draw();
}
