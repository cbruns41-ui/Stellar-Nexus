"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {openDb}=require("../../src/db"),{ensurePlayer}=require("../../src/seed"),social=require("../../src/social");
function bossFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-boss-")),db=openDb(path.join(dir,"test.db"));
 const empires=[];
 for(const name of ["Captain","Wing","Observer"]){ensurePlayer(db,name,"test-secret-123",name+" Empire","#77ddff");empires.push(db.prepare("SELECT e.* FROM empires e JOIN users u ON u.id=e.user_id WHERE u.username=?").get(name));}
 const alliance=social.createAlliance(db,empires[0],"NEM","Nemesis Test","","#77ddff");
 db.prepare("INSERT INTO alliance_members(alliance_id,empire_id,rank,joined_at) VALUES(?,?,'member',?)").run(alliance.id,empires[1].id,Date.now());
 return {db,alliance,empires,close(){db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
module.exports={bossFixture};

