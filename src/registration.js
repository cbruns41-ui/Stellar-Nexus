"use strict";
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { withTx } = require("./tx");
const settings = require("./settings");
const { hashPassword } = require("./auth");
const digest = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const SUPPORT_EMAIL = "mail.nexus@gmx.net";
const SUPPORT_SIGNATURE = `Mit interstellaren Grüßen\nDein Stellar Nexus Support-Team\n\nStellar Nexus · Dein Imperium. Deine Geschichte.\nSupport: ${SUPPORT_EMAIL}\n\nBei Rückfragen antworte einfach auf diese E-Mail und nenne deine Commander-ID.\nWir fragen dich niemals nach deinem Passwort.`;

function secret(db) {
  db.prepare("INSERT OR IGNORE INTO world_meta(key,value) VALUES('registration_ip_secret',?)").run(crypto.randomBytes(32).toString("hex"));
  return db.prepare("SELECT value FROM world_meta WHERE key='registration_ip_secret'").get().value;
}
function ipKey(db, address) {
  let ip=String(address || "").replace(/^::ffff:/i,"").toLowerCase();
  if(!ip) throw new Error("IP-Adresse konnte nicht ermittelt werden.");
  if(ip.includes(":")) { try { ip=new URL(`http://[${ip}]/`).hostname; } catch { throw new Error("Ungültige IP-Adresse."); } }
  return crypto.createHmac("sha256",secret(db)).update(ip).digest("hex");
}
function challenge(db, ip) {
  db.prepare("DELETE FROM registration_challenges WHERE expires_at<?").run(Date.now());
  const a=crypto.randomInt(2,20),b=crypto.randomInt(2,20),id=crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO registration_challenges(id,ip_hash,answer_hash,expires_at) VALUES(?,?,?,?)").run(id,ipKey(db,ip),digest(a+b),Date.now()+10*60000);
  return {id,question:`Wie viel ist ${a} + ${b}?`};
}
function checkHuman(db,ip,body) {
  const row=db.prepare("SELECT * FROM registration_challenges WHERE id=?").get(String(body.challengeId || ""));
  if(row) db.prepare("DELETE FROM registration_challenges WHERE id=?").run(row.id);
  if(![true,"on","true"].includes(body.human) || !row || row.expires_at<Date.now() || row.ip_hash!==ipKey(db,ip) || row.answer_hash!==digest(String(body.answer||"").trim())) {
    throw new Error("Bitte die Mensch-Bestätigung und eine neue Rechenaufgabe ausfüllen.");
  }
}
function request(db,ip,body) {
  checkHuman(db,ip,body);
  if(![true,"on","true"].includes(body.terms) || ![true,"on","true"].includes(body.privacy) || ![true,"on","true"].includes(body.age16)) {
    throw new Error("Bitte Mindestalter, AGB und Datenschutzerklärung bestätigen.");
  }
  const cfg=settings.get(db);
  if(!cfg.registrationOpen || !cfg.betaOpen) throw new Error("Registrierung ist derzeit geschlossen.");
  const username=String(body.username||"").trim(),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),empire=String(body.empire||"").trim(),species=String(body.species||"terran");
  if(!/^[a-zA-Z0-9_]{3,16}$/.test(username) || username.toLowerCase()==="admin") throw new Error("Commander-ID: 3–16 Buchstaben, Ziffern oder Unterstriche; Admin ist reserviert.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>180) throw new Error("Gültige E-Mail-Adresse erforderlich.");
  if(password.length<8 || password.length>72) throw new Error("Passwort: 8–72 Zeichen.");
  if(empire.length<3 || empire.length>24) throw new Error("Imperiumsname: 3–24 Zeichen.");
  if(!require("./species").SPECIES[species]) throw new Error("Unbekannte Spezies.");
  const ipHash=ipKey(db,ip);
  if(db.prepare("SELECT id FROM registration_requests WHERE ip_hash=?").get(ipHash)) throw new Error("Für diese IP-Adresse liegt bereits eine Registrierung vor.");
  if(db.prepare("SELECT id FROM registration_requests WHERE email=? COLLATE NOCASE").get(email)) throw new Error("Diese E-Mail-Adresse ist bereits registriert.");
  if(db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").get(username)) throw new Error("Diese Commander-ID ist vergeben.");
  const token=crypto.randomBytes(32).toString("hex");
  return withTx(db,()=>{
    const user=db.prepare("INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)").run(username,hashPassword(password),Date.now());
    const inserted=db.prepare("INSERT INTO registration_requests(user_id,email,ip_hash,empire,species,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(Number(user.lastInsertRowid),email,ipHash,empire,species,digest(token),Date.now()+7*86400000,Date.now());
    return {id:Number(inserted.lastInsertRowid),token,username,email};
  });
}
function mailConfig() {
  const missing=["SMTP_HOST","SMTP_FROM","PUBLIC_URL"].filter(key=>!process.env[key]?.trim());
  if(missing.length) throw new Error(`Mailversand nicht eingerichtet. Fehlende Server-Einstellungen: ${missing.join(", ")}.`);
  if(process.env.SMTP_USER && !process.env.SMTP_PASSWORD) throw new Error("Mailversand nicht eingerichtet: SMTP_PASSWORD fehlt.");
  const port=Number(process.env.SMTP_PORT || 587);
  if(!Number.isInteger(port) || port<1 || port>65535) throw new Error("SMTP_PORT muss eine gültige Portnummer sein.");
  const secure=process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  if(port===465 && !secure) throw new Error("Port 465 benötigt SMTP_SECURE=true. Für STARTTLS Port 587 verwenden.");
  const base=new URL(process.env.PUBLIC_URL);
  if(!["https:","http:"].includes(base.protocol)) throw new Error("Ungültige PUBLIC_URL.");
  return {base,from:process.env.SMTP_FROM,port,secure};
}
function mailTransport(mail) {
  return nodemailer.createTransport({host:process.env.SMTP_HOST,port:mail.port,secure:mail.secure,requireTLS:!mail.secure,auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
}
async function notifyAdmin(db, entry, transport) {
  try {
    const cfg=settings.get(db),mail=mailConfig();
    if(!cfg.betaEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.betaEmail)) throw new Error("Admin-Empfänger unter Open Beta fehlt.");
    const sender=transport || mailTransport(mail);
    const link=new URL("/approve.html",mail.base);link.hash=entry.token;
    await sender.sendMail({from:mail.from,to:cfg.betaEmail,subject:`Stellar Nexus: Registrierung ${entry.username} freigeben`,text:`Neue Registrierung\nCommander: ${entry.username}\nE-Mail: ${entry.email}\n\nAls Admin anmelden und bewusst freigeben:\n${link.href}\n\nDer Link ist 7 Tage gültig. Das Öffnen allein aktiviert keinen Account.`});
    db.prepare("UPDATE registration_requests SET mail_status='sent',mail_error='' WHERE id=?").run(entry.id);
    return true;
  } catch(err) {
    db.prepare("UPDATE registration_requests SET mail_status='failed',mail_error=? WHERE id=?").run(String(err.message).slice(0,240),entry.id);
    return false;
  }
}
function review(db,token) {
  const row=db.prepare("SELECT r.*,u.username FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE token_hash=?").get(digest(token));
  if(!row || row.expires_at<Date.now()) throw new Error("Freigabelink ungültig oder abgelaufen. Im Adminbereich erneut senden.");
  return row;
}
function approve(db,token) {
  return withTx(db,()=>{
    const row=review(db,token);
    if(row.status!=="pending") throw new Error("Registrierung bereits bearbeitet.");
    const game=require("./game");
    const inserted=db.prepare("INSERT INTO empires(user_id,name,color,created_at,species,nex) VALUES(?,?,?,?,?,?)").run(row.user_id,row.empire,game.pickColor(db),Date.now(),row.species,settings.get(db).starterNex);
    game.assignHome(db,Number(inserted.lastInsertRowid),row.empire);
    db.prepare("UPDATE registration_requests SET status='approved',approved_at=?,token_hash='' WHERE id=?").run(Date.now(),row.id);
    return {id:row.id,username:row.username};
  });
}
async function notifyPlayer(db,id,transport) {
  const row=db.prepare("SELECT r.*,u.username FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.status='approved'").get(id);
  if(!row) throw new Error("Der Account ist noch nicht freigegeben.");
  if(row.player_mail_status==='sent') return true;
  // Claim the delivery before awaiting SMTP, so double clicks cannot send twice.
  const claimed=db.prepare("UPDATE registration_requests SET player_mail_status='sending',player_mail_attempted_at=? WHERE id=? AND player_mail_status!='sent' AND (player_mail_status!='sending' OR player_mail_attempted_at<?)").run(Date.now(),id,Date.now()-120000);
  if(!claimed.changes) throw new Error("Bestätigungsmail wird bereits versendet. Bitte kurz warten.");
  try {
    const mail=mailConfig(),sender=transport || mailTransport(mail);
    const link=new URL('/',mail.base);
    await sender.sendMail({from:mail.from,to:row.email,replyTo:SUPPORT_EMAIL,
      subject:"Stellar Nexus: Dein Account ist freigeschaltet",
      text:`Hallo ${row.username},\n\ndein Account wurde vom Admin freigeschaltet. Willkommen bei Stellar Nexus!\n\nDu kannst dich jetzt mit deiner Commander-ID ${row.username} und deinem bei der Registrierung gewählten Passwort anmelden:\n${link.href}\n\nDein Imperium „${row.empire}“ wartet auf dich.\n\n${SUPPORT_SIGNATURE}`});
    db.prepare("UPDATE registration_requests SET player_mail_status='sent',player_mail_error='' WHERE id=?").run(id);
    return true;
  } catch(err) {
    db.prepare("UPDATE registration_requests SET player_mail_status='failed',player_mail_error=? WHERE id=?").run(String(err.message).slice(0,240),id);
    return false;
  }
}
function pending(db,userId) { return !!db.prepare("SELECT id FROM registration_requests WHERE user_id=? AND status!='approved'").get(userId); }
function list(db) { return db.prepare("SELECT r.id,u.username,r.email,r.status,r.mail_status,r.mail_error,r.player_mail_status,r.player_mail_error,r.created_at FROM registration_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100").all(); }
function listPage(db, query = {}) {
  const filter = ['open', 'done', 'all'].includes(query.filter) ? query.filter : 'open';
  const q = String(query.q || '').trim().slice(0, 180);
  const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const done = "(r.status='approved' AND r.player_mail_status='sent')";
  const where = `${filter === 'done' ? done : filter === 'open' ? `NOT ${done}` : '1=1'} AND (u.username LIKE ? ESCAPE '\\' OR r.email LIKE ? ESCAPE '\\')`;
  const total = db.prepare(`SELECT COUNT(*) n FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE ${where}`).get(search, search).n;
  const pageSize = 10, pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  const counts = db.prepare(`SELECT COUNT(*) AS allCount, COALESCE(SUM(${done}),0) AS doneCount FROM registration_requests r`).get();
  const registrations = db.prepare(`SELECT r.id,u.username,r.email,r.status,r.mail_status,r.mail_error,r.player_mail_status,r.player_mail_error,r.player_mail_attempted_at,r.created_at,r.approved_at FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(search, search, pageSize, (page - 1) * pageSize);
  return { registrations, filter, q, page, pageSize, pages, total, counts: { open: counts.allCount - counts.doneCount, done: counts.doneCount, all: counts.allCount } };
}
async function resend(db,id,transport) {
  const row=db.prepare("SELECT r.id,u.username,r.email FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.status='pending'").get(id);
  if(!row) throw new Error("Keine offene Registrierung.");
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("UPDATE registration_requests SET token_hash=?,expires_at=? WHERE id=?").run(digest(token),Date.now()+7*86400000,id);
  if(!await notifyAdmin(db,{...row,token},transport)) throw new Error("Mailversand fehlgeschlagen. SMTP-Konfiguration und Empfänger prüfen.");
}
module.exports={challenge,request,notifyAdmin,notifyPlayer,review,approve,pending,list,listPage,resend,ipKey,SUPPORT_SIGNATURE};
