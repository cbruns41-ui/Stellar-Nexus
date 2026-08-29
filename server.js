"use strict";

const path = require("path");
const express = require("express");
const { openDb } = require("./src/db");
const { attachRoutes } = require("./src/routes");
const { ensureAdmin, ensurePlayer } = require("./src/seed");
const { userFromRequest } = require("./src/auth");

const PORT = Number(process.env.PORT) || 3000;
const db = openDb();
ensureAdmin(db);
ensurePlayer(db, "Spieler", "Wurm4444", "Neme", "#7ecbff");
ensurePlayer(db, "Neme", "Wurm4444", "Neme", "#7ecbff");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "700kb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (req.path === "/" || /\.(?:html|js|css)$/.test(req.path)) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
  next();
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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Interner Fehler im Nexus." });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Stellar Nexus läuft auf http://localhost:${PORT}`);
  });
}
