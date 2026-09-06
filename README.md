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

Spenden werden unter **Kommando → Leitung → Zentrale → Spenden** eingerichtet:
HTTPS-Zahlungslink und optionalen Begleittext eintragen, dann **Einstellungen speichern**.
Der Link erscheint im Nexus unter „Serverkosten unterstützen“. Ein leeres Linkfeld deaktiviert
den Spendenbutton. Spenden gewähren keine Spielinhalte; sämtliche Nexus-Angebote bleiben
ausschließlich mit Nex erhältlich. Der Pass kostet 150 Nex für 30 oder 400 Nex für 90 Tage
und verlängert sich nicht automatisch.

| Pfad | Inhalt |
|------|--------|
| `server.js` | Express-App (lokal `listen`, auf Vercel Export) |
| `api/index.js` | Vercel-Function-Einstieg |
| `src/` | Spiel-Logik, Routen, SQLite |
| `public/` | Frontend, Assets |
| `scripts/` | Hilfsskripte (Bots, Checks) |
| `Unity/` | Unity-Client (Assets / Packages / ProjectSettings) |

## Registrierung und Adminfreigabe

Unter **Kommando → Leitung → Zentrale → Closed Beta** die Admin-Empfängeradresse eintragen.
Den Mailtransport über `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM` und `PUBLIC_URL` konfigurieren (siehe `.env.example`). Bei Port 587 wird STARTTLS
verlangt; bei Port 465 `SMTP_SECURE=true` setzen. Ohne Mailkonfiguration bleiben Anmeldungen
gesperrt; im Adminbereich ist der Fehler sichtbar und die Freigabemail kann erneut gesendet werden.
Es wurde kein echter Mailversand mit Produktivzugangsdaten getestet.

Neue Accounts erfordern E-Mail, Mensch-Bestätigung und eine einmalige Rechenaufgabe. Erst die
ausdrückliche Bestätigung im Mail-Link durch einen angemeldeten Admin erzeugt das Imperium.
Links gelten sieben Tage; Mailvorschauen aktivieren keinen Account. Die Rechenaufgabe ist ein
einfacher Botfilter, kein belastbarer Nachweis einer natürlichen Person.

Eine eindeutige, dauerhaft gespeicherte IP-HMAC begrenzt neue Registrierungen auf eine je IP.
Geteilte Anschlüsse betreffen mehrere Menschen; VPNs und wechselnde IPs umgehen diese Grenze.
Die Regel benötigt eine **persistente Datenbank** (siehe Vercel-Hinweis oben). Bei einem eigenen
Reverse Proxy nur dessen tatsächliche Adressen in `TRUST_PROXY` eintragen.

## Bereinigung und erhaltene Bestände

Entfernt wurden die defekte separate Kolonisierungsroutine, der unbenutzte alte 2D-Allianzkampf,
die nicht mehr angebotene Raid-Ausblendung und die Start-Routine, die vorhandene Adminplaneten
mit Gebäuden und Schiffen zurücksetzte. Bestehende Passwörter werden beim Start nicht mehr
überschrieben. Demoaccounts entstehen nur mit `SEED_DEMO_USERS=1`.

Bewusst erhalten bleiben Datenbanken und Sicherungen zur Untersuchung früherer Verluste,
alte Wartelisteneinträge für einen möglichen kontrollierten Import sowie `Unity/` und die
Grafikentwürfe in `design/`, `tmp-iso/` und `tmp-topdown/`. Sie enthalten wiederverwendbare
Client-Bausteine und Ansichten für spätere Grafikvarianten. `unity-colony/` ist das aktive
WebGL-Projekt. Die alternative Stadtdarstellung `public/js/city-3d.js` und ihre Tests bleiben
als nutzbarer Entwicklungsstand erhalten.

## Lizenz

Privat / unveröffentlicht, sofern nicht anders angegeben.
