# Stellar Nexus

Persistentes Weltraum-4X im Browser. Baue Planeten, befehlige Flotten, forsche, gründet Allianzen.

Repo: [github.com/cbruns41-ui/Stellar-Nexus](https://github.com/cbruns41-ui/Stellar-Nexus)

## Voraussetzungen

- **Node.js 22.x** (wegen `node:sqlite`)
- npm

## Lokal starten

```bash
npm install
npm start
```

Spiel: [http://localhost:3000](http://localhost:3000)

Entwicklung mit Reload:

```bash
npm run dev
```

SQLite liegt unter `data/stellar-nexus.db` (wird nicht committed). Pfad per `DATABASE_PATH` überschreibbar.

### Demo-Logins (lokal / erste Instanz)

| Commander-ID | Passwort  | Rolle   |
|--------------|-----------|---------|
| Spieler      | Wurm4444  | Spieler |
| Neme         | Wurm4444  | Spieler |
| Admin        | Wurm4444  | Admin   |

**Vor einem öffentlichen Live-System die Passwörter ändern** (Profil) und die `ensurePlayer` / `ensureAdmin`-Aufrufe in `server.js` entfernen oder anpassen.

## GitHub

```bash
git init -b main
git add .
git commit -m "Initial commit: Stellar Nexus"
git remote add origin https://github.com/cbruns41-ui/Stellar-Nexus.git
git push -u origin main
```

Danach jeder Push auf `main` kann automatisch bei Vercel deployen, sobald das Projekt verbunden ist.

## Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `cbruns41-ui/Stellar-Nexus`
2. Framework Preset: **Other** (steht in `vercel.json`)
3. Node.js Version in Project Settings: **22.x**
4. Deploy

`vercel.json` setzt Output-Directory `public` (Grafiken, CSS, JS über CDN) und leitet API-Routen an die Express-App (`api/index.js` → `server.js`).

### Wichtig: SQLite auf Vercel

Vercel hat **kein persistentes Dateisystem**. Die Datenbank liegt in `/tmp/stellar-nexus.db` und geht bei neuen Instanzen / Cold Starts verloren. Avatare und Allianz-Banner ebenfalls.

Das reicht zum **Ansehen und Testen**. Für einen echten Live-Server mit Speicher:

- kleiner VPS (`npm start` dauerhaft), oder
- später eine gehostete DB (z. B. Turso / libSQL / Postgres)

Health-Check nach dem Deploy: `https://<dein-projekt>.vercel.app/api/health`

## Projektstruktur

| Pfad | Inhalt |
|------|--------|
| `server.js` | Express-App (lokal `listen`, auf Vercel Export) |
| `api/index.js` | Vercel-Function-Einstieg |
| `src/` | Spiel-Logik, Routen, SQLite |
| `public/` | Frontend, Assets |
| `scripts/` | Hilfsskripte (Bots, Checks) |
| `Unity/` | Unity-Client (Assets / Packages / ProjectSettings) |

## Lizenz

Privat / unveröffentlicht, sofern nicht anders angegeben.
