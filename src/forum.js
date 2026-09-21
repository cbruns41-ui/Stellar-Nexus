'use strict';
const moderation = require('./moderation');
const {withTx} = require('./tx');
const categories = { improvements:'Verbesserungen', complaints:'Beschwerden', bugs:'Fehler melden', general:'Allgemeines' };
function text(value,min,max) {
  if(typeof value !== 'string') throw new Error('Bitte einen Text eingeben.');
  const clean=value.trim();
  if(clean.length<min || clean.length>max) throw new Error(`Bitte ${min} bis ${max} Zeichen eingeben.`);
  return clean;
}
function writable(db,user) {
  const empire=db.prepare('SELECT * FROM empires WHERE user_id=?').get(user.id);
  if(!empire) throw new Error('Imperium nicht gefunden.');
  moderation.assertNotMuted(db,empire);
  const latest=db.prepare('SELECT MAX(created_at) at FROM (SELECT created_at FROM forum_topics WHERE author_id=? UNION ALL SELECT created_at FROM forum_replies WHERE author_id=?)').get(user.id,user.id).at;
  if(latest && Date.now()-latest<10000) throw new Error('Bitte warte 10 Sekunden zwischen Beiträgen.');
}
function topic(db,id) {
  const row=db.prepare("SELECT t.*,COALESCE(u.username,'Gelöschter Spieler') author FROM forum_topics t LEFT JOIN users u ON u.id=t.author_id WHERE t.id=?").get(id);
  if(!row) throw new Error('Thema nicht gefunden.');
  return row;
}
function create(db,user,data) {return withTx(db,()=>{
  writable(db,user);
  if(!Object.hasOwn(categories,data.category)) throw new Error('Kategorie ungültig.');
  const title=text(data.title,3,100),body=text(data.body,3,5000),at=Date.now();
  return Number(db.prepare('INSERT INTO forum_topics(author_id,category,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user.id,data.category,title,body,at,at).lastInsertRowid);
});}
function reply(db,user,id,data) {return withTx(db,()=>{
  writable(db,user);if(topic(db,id).locked) throw new Error('Dieses Thema ist geschlossen.');
  const body=text(data.body,1,5000),at=Date.now();
  db.prepare('INSERT INTO forum_replies(topic_id,author_id,body,created_at) VALUES(?,?,?,?)').run(id,user.id,body,at);
  db.prepare('UPDATE forum_topics SET updated_at=? WHERE id=?').run(at,id);
});}
function moderate(db,user,id,data) {
  if(!moderation.canMod(user)) throw new Error('Keine Moderatorenrechte.');
  topic(db,id);
  if(data.action==='delete') db.prepare('DELETE FROM forum_topics WHERE id=?').run(id);
  else if(data.action==='lock') db.prepare('UPDATE forum_topics SET locked=? WHERE id=?').run(data.locked?1:0,id);
  else if(data.action==='deleteReply') db.prepare('DELETE FROM forum_replies WHERE id=? AND topic_id=?').run(Number(data.replyId),id);
  else throw new Error('Aktion ungültig.');
}
function attach(app,db,auth) {
  const route=fn=>(req,res)=>{try{res.json(fn(req));}catch(err){res.status(400).json({error:err.message});}};
  const offset=req=>Math.max(0,Math.floor(Number(req.query.offset)||0));
  app.get('/api/forum',auth,route(req=>{
    const category=String(req.query.category||'');
    if(category&&!Object.hasOwn(categories,category)) throw new Error('Kategorie ungültig.');
    const topics=db.prepare(`SELECT t.*,COALESCE(u.username,'Gelöschter Spieler') author,
      (SELECT COUNT(*) FROM forum_replies r WHERE r.topic_id=t.id) replies
      FROM forum_topics t LEFT JOIN users u ON u.id=t.author_id WHERE (?='' OR t.category=?) ORDER BY t.updated_at DESC,t.id DESC LIMIT 51 OFFSET ?`).all(category,category,offset(req));
    return {categories,topics:topics.slice(0,50),more:topics.length>50};
  }));
  app.get('/api/forum/:id',auth,route(req=>{
    const t=topic(db,Number(req.params.id));
    const replies=db.prepare("SELECT r.*,COALESCE(u.username,'Gelöschter Spieler') author FROM forum_replies r LEFT JOIN users u ON u.id=r.author_id WHERE topic_id=? ORDER BY r.id LIMIT 51 OFFSET ?").all(t.id,offset(req));
    return {topic:t,replies:replies.slice(0,50),replyCount:db.prepare('SELECT COUNT(*) n FROM forum_replies WHERE topic_id=?').get(t.id).n,more:replies.length>50,canModerate:moderation.canMod(req.user)};
  }));
  app.post('/api/forum',auth,route(req=>({id:create(db,req.user,req.body||{})})));
  app.post('/api/forum/:id/replies',auth,route(req=>{reply(db,req.user,Number(req.params.id),req.body||{});return {ok:true};}));
  app.post('/api/forum/:id/moderate',auth,route(req=>{moderate(db,req.user,Number(req.params.id),req.body||{});return {ok:true};}));
}
module.exports={attach,create,reply,moderate,topic};
