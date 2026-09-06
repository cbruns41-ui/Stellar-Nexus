"use strict";
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { withTx } = require("./tx");
const settings = require("./settings");
const { hashPassword } = require("./auth");
const digest = value => crypto.createHash("sha256").update(String(value)).digest("hex");

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
  const cfg=settings.get(db);
  if(!cfg.registrationOpen || !cfg.betaOpen) throw new Error("Registrierung ist derzeit geschlossen.");
  const username=String(body.username||"").trim(),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),empire=String(body.empire||"").trim(),species=String(body.species||"terran");
  if(!/^[a-zA-Z0-9_]{3,16}$/.test(username) || username.toLowerCase()==="admin") throw new Error("Commander-ID: 3–16 Buchstaben, Ziffern oder Unterstriche; Admin ist reserviert.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>180) throw new Error("Gültige E-Mail-Adresse erforderlich.");
  if(password.length<6 || password.length>72) throw new Error("Passwort: 6–72 Zeichen.");
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
  if(!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.PUBLIC_URL) throw new Error("Mailversand noch nicht eingerichtet: SMTP_HOST, SMTP_FROM und PUBLIC_URL fehlen.");
  const base=new URL(process.env.PUBLIC_URL);
  if(!["https:","http:"].includes(base.protocol)) throw new Error("Ungültige PUBLIC_URL.");
  return {base,from:process.env.SMTP_FROM};
}
async function notifyAdmin(db, entry, transport) {
  try {
    const cfg=settings.get(db),mail=mailConfig();
    if(!cfg.betaEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.betaEmail)) throw new Error("Admin-Empfänger unter Closed Beta fehlt.");
    const sender=transport || nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:process.env.SMTP_SECURE==="true",requireTLS:process.env.SMTP_SECURE!=="true",auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
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
    return {username:row.username};
  });
}
function pending(db,userId) { return !!db.prepare("SELECT id FROM registration_requests WHERE user_id=? AND status!='approved'").get(userId); }
function list(db) { return db.prepare("SELECT r.id,u.username,r.email,r.status,r.mail_status,r.mail_error,r.created_at FROM registration_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100").all(); }
async function resend(db,id,transport) {
  const row=db.prepare("SELECT r.id,u.username,r.email FROM registration_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.status='pending'").get(id);
  if(!row) throw new Error("Keine offene Registrierung.");
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("UPDATE registration_requests SET token_hash=?,expires_at=? WHERE id=?").run(digest(token),Date.now()+7*86400000,id);
  if(!await notifyAdmin(db,{...row,token},transport)) throw new Error("Mailversand fehlgeschlagen. SMTP-Konfiguration und Empfänger prüfen.");
}
module.exports={challenge,request,notifyAdmin,review,approve,pending,list,resend,ipKey};
