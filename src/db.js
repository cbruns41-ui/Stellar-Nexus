"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { generateGalaxy, expandGalaxy } = require("./galaxy");
const { seedWarlords } = require("./nexus");

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS world_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_mod INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT '',
  muted_until INTEGER NOT NULL DEFAULT 0,
  mute_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS empires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  last_planet_id INTEGER,
  created_at INTEGER NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_daily TEXT,
  equipped TEXT NOT NULL DEFAULT '[]',
  last_rush INTEGER NOT NULL DEFAULT 0,
  avatar TEXT NOT NULL DEFAULT 'a1',
  sound INTEGER NOT NULL DEFAULT 1,
  notify INTEGER NOT NULL DEFAULT 0,
  last_raid INTEGER NOT NULL DEFAULT 0,
  last_patrol INTEGER NOT NULL DEFAULT 0,
  last_salvage INTEGER NOT NULL DEFAULT 0,
  last_decode INTEGER NOT NULL DEFAULT 0,
  last_sim INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'de',
  translate INTEGER NOT NULL DEFAULT 1,
  last_chat INTEGER NOT NULL DEFAULT 0,
  last_mail INTEGER NOT NULL DEFAULT 0,
  species TEXT NOT NULL DEFAULT 'terran',
  nex INTEGER NOT NULL DEFAULT 0,
  last_species INTEGER NOT NULL DEFAULT 0,
  last_nex TEXT NOT NULL DEFAULT '',
  daily_ops TEXT NOT NULL DEFAULT '',
  weekly_ops TEXT NOT NULL DEFAULT '',
  last_seen INTEGER NOT NULL DEFAULT 0,
  vip_until INTEGER NOT NULL DEFAULT 0,
  vip_plan TEXT NOT NULL DEFAULT '',
  vip_cancel INTEGER NOT NULL DEFAULT 0,
  vip_started INTEGER NOT NULL DEFAULT 0,
  last_vip_recall INTEGER NOT NULL DEFAULT 0,
  signet INTEGER NOT NULL DEFAULT 0,
  aeon_unlock INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS alliances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT UNIQUE NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  leader_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  lore TEXT NOT NULL DEFAULT '',
  banner TEXT NOT NULL DEFAULT 'b1',
  website TEXT NOT NULL DEFAULT '',
  recruit TEXT NOT NULL DEFAULT '',
  bulletin TEXT NOT NULL DEFAULT '',
  motd TEXT NOT NULL DEFAULT '',
  open_join INTEGER NOT NULL DEFAULT 0,
  min_level INTEGER NOT NULL DEFAULT 1,
  max_members INTEGER NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS alliance_members (
  alliance_id INTEGER NOT NULL,
  empire_id INTEGER NOT NULL,
  rank TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (alliance_id, empire_id),
  FOREIGN KEY (alliance_id) REFERENCES alliances(id),
  FOREIGN KEY (empire_id) REFERENCES empires(id)
);

CREATE TABLE IF NOT EXISTS alliance_apps (
  alliance_id INTEGER NOT NULL,
  empire_id INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (alliance_id, empire_id)
);

CREATE TABLE IF NOT EXISTS alliance_research (
  alliance_id INTEGER NOT NULL,
  research_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  metal REAL NOT NULL DEFAULT 0,
  helium REAL NOT NULL DEFAULT 0,
  titan REAL NOT NULL DEFAULT 0,
  energy REAL NOT NULL DEFAULT 0,
  crystal REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (alliance_id, research_id),
  FOREIGN KEY (alliance_id) REFERENCES alliances(id)
);

CREATE TABLE IF NOT EXISTS alliance_research_contributions (
  alliance_id INTEGER NOT NULL,
  research_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  empire_id INTEGER NOT NULL,
  resource_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (alliance_id, research_id, level, empire_id, resource_id)
);

CREATE TABLE IF NOT EXISTS research (
  empire_id INTEGER NOT NULL,
  tech_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (empire_id, tech_id),
  FOREIGN KEY (empire_id) REFERENCES empires(id)
);

CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  star_type TEXT NOT NULL,
  is_hub INTEGER NOT NULL DEFAULT 0,
  remnant INTEGER NOT NULL DEFAULT 0,
  warlord TEXT NOT NULL DEFAULT '',
  pirate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS planets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  empire_id INTEGER,
  metal REAL NOT NULL DEFAULT 0,
  helium REAL NOT NULL DEFAULT 0,
  titan REAL NOT NULL DEFAULT 0,
  energy REAL NOT NULL DEFAULT 0,
  crystal REAL NOT NULL DEFAULT 0,
  diamond REAL NOT NULL DEFAULT 0,
  last_tick INTEGER NOT NULL,
  directive TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (system_id) REFERENCES systems(id)
);

CREATE TABLE IF NOT EXISTS buildings (
  planet_id INTEGER NOT NULL,
  building_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  PRIMARY KEY (planet_id, building_id)
);

CREATE TABLE IF NOT EXISTS ships (
  planet_id INTEGER NOT NULL,
  ship_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (planet_id, ship_id)
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empire_id INTEGER NOT NULL,
  planet_id INTEGER,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  level_to INTEGER,
  started_at INTEGER NOT NULL,
  completes_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_empire_id INTEGER NOT NULL,
  seller_planet_id INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'public',
  offer_kind TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  offer_qty INTEGER NOT NULL,
  want_kind TEXT NOT NULL,
  want_id TEXT NOT NULL,
  want_qty INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trade_orders_open ON trade_orders(scope, expires_at);

CREATE TABLE IF NOT EXISTS fleets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empire_id INTEGER NOT NULL,
  origin_planet_id INTEGER NOT NULL,
  target_planet_id INTEGER NOT NULL,
  mission TEXT NOT NULL,
  ships TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '{}',
  cargo_matter REAL NOT NULL DEFAULT 0,
  cargo_energy REAL NOT NULL DEFAULT 0,
  cargo_data REAL NOT NULL DEFAULT 0,
  departed_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  is_return INTEGER NOT NULL DEFAULT 0,
  hold_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empire_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_planets_empire ON planets(empire_id);
CREATE INDEX IF NOT EXISTS idx_planets_system ON planets(system_id);
CREATE INDEX IF NOT EXISTS idx_queue_due ON queue(completes_at);
CREATE INDEX IF NOT EXISTS idx_fleets_due ON fleets(arrives_at);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS quests (
  empire_id INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (empire_id, quest_id)
);

CREATE TABLE IF NOT EXISTS relics (
  empire_id INTEGER NOT NULL,
  relic_id TEXT NOT NULL,
  found_at INTEGER NOT NULL,
  PRIMARY KEY (empire_id, relic_id)
);

CREATE TABLE IF NOT EXISTS medals (
  empire_id INTEGER NOT NULL,
  medal_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (empire_id, medal_id)
);
CREATE INDEX IF NOT EXISTS idx_medals_empire ON medals(empire_id, earned_at);

CREATE TABLE IF NOT EXISTS debris (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planet_id INTEGER NOT NULL,
  resources TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS defenses (
  planet_id INTEGER NOT NULL,
  defense_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (planet_id, defense_id)
);

CREATE TABLE IF NOT EXISTS raids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_planet_id INTEGER NOT NULL,
  ships TEXT NOT NULL,
  arrives_at INTEGER NOT NULL,
  kind TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_emp ON reports(empire_id, created_at);
CREATE INDEX IF NOT EXISTS idx_debris_planet ON debris(planet_id);
CREATE INDEX IF NOT EXISTS idx_raids_due ON raids(arrives_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  alliance_id INTEGER,
  system_id INTEGER,
  empire_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'de',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_ch ON chat_messages(channel, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_ally ON chat_messages(alliance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sys ON chat_messages(system_id, created_at);

CREATE TABLE IF NOT EXISTS chat_reads (
  empire_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  last_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (empire_id, channel_key)
);

CREATE TABLE IF NOT EXISTS chat_i18n (
  message_kind TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (message_kind, message_id, lang)
);

CREATE TABLE IF NOT EXISTS mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'de',
  created_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mail_to ON mail(to_id, seen, created_at);

CREATE TABLE IF NOT EXISTS planet_bookmarks (
  empire_id INTEGER NOT NULL,
  planet_id INTEGER NOT NULL,
  system_id INTEGER,
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (empire_id, planet_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_empire ON planet_bookmarks(empire_id, created_at);
CREATE TABLE IF NOT EXISTS beta_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beta_email ON beta_registrations(email);
`;

function hasCol(db, table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name);
}

function migrate(db) {
  const planetAdds = [
    ["metal", "REAL NOT NULL DEFAULT 0"],
    ["helium", "REAL NOT NULL DEFAULT 0"],
    ["titan", "REAL NOT NULL DEFAULT 0"],
    ["crystal", "REAL NOT NULL DEFAULT 0"],
    ["diamond", "REAL NOT NULL DEFAULT 0"],
  ];
  for (const [name, def] of planetAdds) {
    if (!hasCol(db, "planets", name)) db.exec(`ALTER TABLE planets ADD COLUMN ${name} ${def}`);
  }
  if (hasCol(db, "planets", "matter")) {
    db.exec("UPDATE planets SET metal = matter WHERE IFNULL(metal, 0) = 0 AND IFNULL(matter, 0) > 0");
  }
  if (hasCol(db, "planets", "data")) {
    db.exec("UPDATE planets SET crystal = data WHERE IFNULL(crystal, 0) = 0 AND IFNULL(data, 0) > 0");
  }
  if (!hasCol(db, "fleets", "cargo")) {
    db.exec("ALTER TABLE fleets ADD COLUMN cargo TEXT NOT NULL DEFAULT '{}'");
  }
  if (!hasCol(db, "fleets", "hold_ms")) {
    db.exec("ALTER TABLE fleets ADD COLUMN hold_ms INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasCol(db, "empires", "xp")) db.exec("ALTER TABLE empires ADD COLUMN xp INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "streak")) db.exec("ALTER TABLE empires ADD COLUMN streak INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_daily")) db.exec("ALTER TABLE empires ADD COLUMN last_daily TEXT");
  if (!hasCol(db, "empires", "equipped")) db.exec("ALTER TABLE empires ADD COLUMN equipped TEXT NOT NULL DEFAULT '[]'");
  if (!hasCol(db, "empires", "last_rush")) db.exec("ALTER TABLE empires ADD COLUMN last_rush INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "avatar")) db.exec("ALTER TABLE empires ADD COLUMN avatar TEXT NOT NULL DEFAULT 'a1'");
  if (!hasCol(db, "empires", "sound")) db.exec("ALTER TABLE empires ADD COLUMN sound INTEGER NOT NULL DEFAULT 1");
  if (!hasCol(db, "empires", "notify")) db.exec("ALTER TABLE empires ADD COLUMN notify INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_raid")) db.exec("ALTER TABLE empires ADD COLUMN last_raid INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_patrol")) db.exec("ALTER TABLE empires ADD COLUMN last_patrol INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_salvage")) db.exec("ALTER TABLE empires ADD COLUMN last_salvage INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_decode")) db.exec("ALTER TABLE empires ADD COLUMN last_decode INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_sim")) db.exec("ALTER TABLE empires ADD COLUMN last_sim INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "locale")) db.exec("ALTER TABLE empires ADD COLUMN locale TEXT NOT NULL DEFAULT 'de'");
  if (!hasCol(db, "empires", "translate")) db.exec("ALTER TABLE empires ADD COLUMN translate INTEGER NOT NULL DEFAULT 1");
  if (!hasCol(db, "empires", "last_chat")) db.exec("ALTER TABLE empires ADD COLUMN last_chat INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_mail")) db.exec("ALTER TABLE empires ADD COLUMN last_mail INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "species")) db.exec("ALTER TABLE empires ADD COLUMN species TEXT NOT NULL DEFAULT 'terran'");
  if (!hasCol(db, "empires", "nex")) db.exec("ALTER TABLE empires ADD COLUMN nex INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_species")) db.exec("ALTER TABLE empires ADD COLUMN last_species INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_nex")) db.exec("ALTER TABLE empires ADD COLUMN last_nex TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "empires", "daily_ops")) db.exec("ALTER TABLE empires ADD COLUMN daily_ops TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "empires", "weekly_ops")) db.exec("ALTER TABLE empires ADD COLUMN weekly_ops TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "empires", "last_seen")) db.exec("ALTER TABLE empires ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "vip_until")) db.exec("ALTER TABLE empires ADD COLUMN vip_until INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "vip_plan")) db.exec("ALTER TABLE empires ADD COLUMN vip_plan TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "empires", "vip_cancel")) db.exec("ALTER TABLE empires ADD COLUMN vip_cancel INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "vip_started")) db.exec("ALTER TABLE empires ADD COLUMN vip_started INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_vip_recall")) db.exec("ALTER TABLE empires ADD COLUMN last_vip_recall INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "signet")) db.exec("ALTER TABLE empires ADD COLUMN signet INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "aeon_unlock")) db.exec("ALTER TABLE empires ADD COLUMN aeon_unlock INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "helix_unlock")) db.exec("ALTER TABLE empires ADD COLUMN helix_unlock INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "ship_cap_boost_until")) db.exec("ALTER TABLE empires ADD COLUMN ship_cap_boost_until INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "ship_cap_bonus")) db.exec("ALTER TABLE empires ADD COLUMN ship_cap_bonus INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "alliance_member_boost")) db.exec("ALTER TABLE empires ADD COLUMN alliance_member_boost INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_survey")) db.exec("ALTER TABLE empires ADD COLUMN last_survey INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "empires", "last_drill")) db.exec("ALTER TABLE empires ADD COLUMN last_drill INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "planets", "alliance_id")) db.exec("ALTER TABLE planets ADD COLUMN alliance_id INTEGER");
  if (!hasCol(db, "planets", "founded_at")) db.exec("ALTER TABLE planets ADD COLUMN founded_at INTEGER NOT NULL DEFAULT 0");
  db.exec(`CREATE TABLE IF NOT EXISTS alliance_planet_access (
    alliance_id INTEGER NOT NULL,
    empire_id INTEGER NOT NULL,
    PRIMARY KEY (alliance_id, empire_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS activity_runs (
    empire_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    duration TEXT NOT NULL,
    planet_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    completes_at INTEGER NOT NULL,
    PRIMARY KEY (empire_id, kind)
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_activity_runs_done ON activity_runs(completes_at)");
  db.exec(`CREATE TABLE IF NOT EXISTS orbit_fire_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empire_id INTEGER NOT NULL,
    planet_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_orbit_fire_empire ON orbit_fire_sessions(empire_id, started_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_planets_alliance ON planets(alliance_id)");
  db.exec(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    empire_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    sku TEXT NOT NULL,
    nex INTEGER NOT NULL DEFAULT 0,
    eur_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'done',
    created_at INTEGER NOT NULL
  )`);
  if (!hasCol(db, "users", "is_mod")) db.exec("ALTER TABLE users ADD COLUMN is_mod INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "users", "banned_until")) db.exec("ALTER TABLE users ADD COLUMN banned_until INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "users", "ban_reason")) db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "users", "muted_until")) db.exec("ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "users", "mute_reason")) db.exec("ALTER TABLE users ADD COLUMN mute_reason TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS attack_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_id INTEGER NOT NULL,
    victim_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_attack_log ON attack_log(attacker_id, victim_id, created_at)");
  db.exec(`CREATE TABLE IF NOT EXISTS mod_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    target_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    alliance_id INTEGER,
    system_id INTEGER,
    empire_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'de',
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS chat_reads (
    empire_id INTEGER NOT NULL,
    channel_key TEXT NOT NULL,
    last_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (empire_id, channel_key)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS chat_i18n (
    message_kind TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (message_kind, message_id, lang)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS mail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'de',
    created_at INTEGER NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_chat_ch ON chat_messages(channel, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_mail_to ON mail(to_id, seen, created_at)");
  db.exec(`CREATE TABLE IF NOT EXISTS alliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    leader_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  if (!hasCol(db, "alliances", "lore")) db.exec("ALTER TABLE alliances ADD COLUMN lore TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "alliances", "banner")) db.exec("ALTER TABLE alliances ADD COLUMN banner TEXT NOT NULL DEFAULT 'b1'");
  if (!hasCol(db, "alliances", "website")) db.exec("ALTER TABLE alliances ADD COLUMN website TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "alliances", "recruit")) db.exec("ALTER TABLE alliances ADD COLUMN recruit TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "alliances", "bulletin")) db.exec("ALTER TABLE alliances ADD COLUMN bulletin TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "alliances", "motd")) db.exec("ALTER TABLE alliances ADD COLUMN motd TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "alliances", "open_join")) db.exec("ALTER TABLE alliances ADD COLUMN open_join INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "alliances", "min_level")) db.exec("ALTER TABLE alliances ADD COLUMN min_level INTEGER NOT NULL DEFAULT 1");
  if (!hasCol(db, "alliances", "max_members")) db.exec("ALTER TABLE alliances ADD COLUMN max_members INTEGER NOT NULL DEFAULT 15");
  const allyCapMigrated = db.prepare("SELECT value FROM world_meta WHERE key = 'ally_cap_v2'").get();
  if (!allyCapMigrated) {
    db.exec(`UPDATE alliances SET max_members = CASE
      WHEN max_members > 30 THEN 15
      WHEN max_members < 15 THEN 15
      WHEN max_members = 20 THEN 15
      ELSE max_members
    END`);
    db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('ally_cap_v2', '1')").run();
  }
  db.exec(`CREATE TABLE IF NOT EXISTS alliance_members (
    alliance_id INTEGER NOT NULL,
    empire_id INTEGER NOT NULL,
    rank TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (alliance_id, empire_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS alliance_apps (
    alliance_id INTEGER NOT NULL,
    empire_id INTEGER NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (alliance_id, empire_id)
  )`);
  if (!hasCol(db, "systems", "warlord")) db.exec("ALTER TABLE systems ADD COLUMN warlord TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "systems", "pirate")) db.exec("ALTER TABLE systems ADD COLUMN pirate INTEGER NOT NULL DEFAULT 0");
  if (!hasCol(db, "planets", "directive")) db.exec("ALTER TABLE planets ADD COLUMN directive TEXT NOT NULL DEFAULT ''");
  if (!hasCol(db, "planet_bookmarks", "system_id")) db.exec("ALTER TABLE planet_bookmarks ADD COLUMN system_id INTEGER");
  db.exec(`CREATE TABLE IF NOT EXISTS relics (
    empire_id INTEGER NOT NULL,
    relic_id TEXT NOT NULL,
    found_at INTEGER NOT NULL,
    PRIMARY KEY (empire_id, relic_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS medals (
    empire_id INTEGER NOT NULL,
    medal_id TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (empire_id, medal_id)
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_medals_empire ON medals(empire_id, earned_at)");
  db.exec(`CREATE TABLE IF NOT EXISTS quests (
    empire_id INTEGER NOT NULL,
    quest_id TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (empire_id, quest_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS debris (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    planet_id INTEGER NOT NULL,
    resources TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS defenses (
    planet_id INTEGER NOT NULL,
    defense_id TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (planet_id, defense_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS raids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_planet_id INTEGER NOT NULL,
    ships TEXT NOT NULL,
    arrives_at INTEGER NOT NULL,
    kind TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS trade_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_empire_id INTEGER NOT NULL,
    seller_planet_id INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'public',
    offer_kind TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    offer_qty INTEGER NOT NULL,
    want_kind TEXT NOT NULL,
    want_id TEXT NOT NULL,
    want_qty INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_trade_orders_open ON trade_orders(scope, expires_at)");
  const defN = db.prepare("SELECT COUNT(*) AS n FROM defenses").get().n;
  if (defN === 0) {
    const homes = db.prepare("SELECT id FROM planets WHERE empire_id IS NOT NULL").all();
    const ins = db.prepare("INSERT OR IGNORE INTO defenses(planet_id, defense_id, count) VALUES(?, ?, ?)");
    for (const p of homes) {
      ins.run(p.id, "flak", 4);
      ins.run(p.id, "missile", 1);
    }
  }
}

function resolveDbPath(filePath) {
  if (filePath) return filePath;
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.VERCEL) return path.join("/tmp", "stellar-nexus.db");
  return path.join(__dirname, "..", "data", "stellar-nexus.db");
}

function openDb(filePath) {
  const dbFile = resolveDbPath(filePath);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(process.env.VERCEL ? "PRAGMA journal_mode = DELETE" : "PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  seedWarlords(db);
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  const count = db.prepare("SELECT COUNT(*) AS n FROM systems").get().n;
  if (count === 0) {
    generateGalaxy(db, "stellar-nexus-v2");
    db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("seed", "stellar-nexus-v2");
    db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("created", String(Date.now()));
  } else {
    expandGalaxy(db);
  }
  return db;
}

module.exports = { openDb, resolveDbPath };
