# Galaxien-Archipel – separate Kartendemo

Start: `Start-Demo.cmd` doppelklicken oder aus dem Projektordner `node design/galaxy-archipelago-demo/launch.mjs`. Nur Server starten: zusätzlich `--no-browser`. Lokale Adresse: http://127.0.0.1:3122/. Node.js erforderlich. Die Orbit-Demo auf Port 3121 bleibt separat.

Die Desktop-Verknüpfung startet `Start-Demo.ps1` direkt. Der Starter sucht Node zuerst unter `Program Files`, prüft die Antwort der Kartendemo und öffnet ein Chrome-Fenster (ersatzweise den Standardbrowser). Das Startprotokoll liegt in `start-demo.log`; Fehler erscheinen zusätzlich als Dialog. Dadurch bleiben Startprobleme auch bei einem ausgeblendeten Konsolenfenster sichtbar. Serverprüfung ohne Browser: `powershell -NoProfile -ExecutionPolicy Bypass -File design/galaxy-archipelago-demo/Start-Demo.ps1 -NoBrowser`.

Diese Demo ist nicht in das Hauptspiel eingebaut. Keine Anmeldung, Datenbank, Spiel-API, echten Besitzwechsel oder Flottenaufträge. Alle Systeme, Eigentümer und Routen sind Beispieldaten.

## Ausprobieren

- Galaxie über Chip oder freie Stelle in der Galaxiescheibe wählen.
- Mausrad, +/− oder zwei Finger zoomen die gesamte Karte; Ziehen verschiebt sie. ⌖ zeigt den ganzen Archipel.
- Einen sichtbaren Stern antippen: System mit 2–6 einzeln auswählbaren Planeten. Suche findet z. B. `Pyre Hollow II`.
- Filter: Eigen, Allianz, andere Spieler, frei, Piraten. Ein System passt, sobald mindestens ein Planet passt. Suche kann ein ausgefiltertes Ziel gezielt wieder sichtbar machen.
- Systemfenster schließen mit ×, Escape oder KARTE. Die Systemliste bietet zusätzlich Textbuttons für bis zu 50 Systeme des Ausschnitts.
- Informationsbutton `i`: von drei Galaxien mit 9.600 Planeten auf sechs mit 19.200 erweitern. Neuladen setzt die reine Demo zurück.
- PLANET und KOMMANDO zeigen einen Hinweis auf die isolierte Kartenvorschau, keine nachgebildeten Hauptspielseiten.

## Umsetzung und Grenzen

Canvas-2D mit gecachten Galaxietexturen, animierten Zentralringen, Beispielverkehr, Zoomstufen und begrenzten Beschriftungen. Kein Vollbild-HDR/Bloom, keine WebGL-Abhängigkeit. Feste Sternsystempositionen; Hintergrundanimation verschiebt keine anklickbaren Ziele. Oberfläche und Suchergebnisse behalten ihre DOM-Identität während der Animation. Begrenzte Pixeldichte und Ruhe bei verborgenem Browsertab. Bewegung reduzieren wird berücksichtigt.

Die sechs Galaxien verwenden dieselbe erzeugte Grundtextur in Farbvarianten. Das ist ein eigenständiger interaktiver Prototyp des ersten Bildkonzepts, keine pixelgenaue Rekonstruktion. Bilder und UI-Dichte können später weiter ausgearbeitet werden. Alle Daten liegen hier zu Testzwecken im Browser; produktiv wäre eine Abfrage sichtbarer Regionen mit nachgeladenen Details sinnvoll.

Kapazität, Annahmen und langfristige Entwicklung: [PLANUNG.md](PLANUNG.md). Bildherkunft und vollständige Generierungsanweisung: [ART-PROMPTS.md](ART-PROMPTS.md).

## Prüfung

`node design/galaxy-archipelago-demo/verify.mjs` startet einen separaten Server und Chrome mit eigenem Testprofil. Prüfung von Desktop, schmalem Handy und Querformat: System-Tap, Suche nach Planetennamen, Planetenwahl, Routenvorschau, Zoom, Zweifinger-Geste, Verschieben, Filter, Erweiterung, eindeutige IDs/Namen, keine Spiel-API oder externen Dienste. Screenshots und Ergebnis unter `review/`. Mobile Prüfungen sind Chrome-Touch-Emulation, keine Messung auf physischen Handys.
