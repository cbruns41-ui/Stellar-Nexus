"use strict";

const path = require("path");
const express = require("express");
const { openDb } = require("./src/db");
const { attachRoutes } = require("./src/routes");
const { ensureAdmin, ensurePlayer } = require("./src/seed");
const { ensureOpenGalaxies } = require("./src/galaxy");
const { userFromRequest, trustProxySetting, applySecurityHeaders } = require("./src/auth");
const { createHttpServer, requestLog, skipSafeMethods } = require("./src/httpServer");

const PORT = Number(process.env.PORT) || 3000;
const db = openDb();
ensureOpenGalaxies(db, 3);
ensureAdmin(db);
if (process.env.SEED_DEMO_USERS === "1") {
  ensurePlayer(db, "Spieler", "Wurm4444", "Neme", "#7ecbff");
  ensurePlayer(db, "Neme", "Wurm4444", "Neme", "#7ecbff");
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", trustProxySetting());
app.use(applySecurityHeaders);
app.use(requestLog);
app.use(skipSafeMethods(express.json({ limit: "700kb" })));
app.use(skipSafeMethods(express.urlencoded({ extended: false })));
app.use((req, res, next) => {
  if (req.path === "/" || /\.(?:html|m?js|css)$/.test(req.path)) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
  next();
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get(["/play", "/play.html"], (req, res) => {
  const user = userFromRequest(db, req);
  if (!user) return res.redirect(303, "/?login=need");
  res.redirect(303, "/");
});
if (process.env.VERCEL) {
  const uploads = path.join("/tmp", "stellar-nexus-uploads");
  app.use("/assets/avatars", express.static(path.join(uploads, "avatars")));
  app.use("/assets/alliances", express.static(path.join(uploads, "alliances")));
}
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
attachRoutes(app, db);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Diese Aktion ist nicht verfügbar. Bitte die Seite neu laden." });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Interner Fehler im Nexus." });
});

module.exports = app;

if (require.main === module) {
  createHttpServer(app).listen(PORT, "0.0.0.0", () => {
    console.log(`Stellar Nexus läuft auf http://localhost:${PORT}`);
  });
}
