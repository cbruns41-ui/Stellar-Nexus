# Orbit-Feuer – eigenständige Grafikdemo 7

**Start per Doppelklick:** `Start-Demo.cmd`. Der Starter prüft, ob die Demo bereits läuft, startet bei Bedarf den lokalen Server im Hintergrund und öffnet den Browser. Node.js muss installiert sein. Nach einem PC-Neustart den Starter erneut öffnen; der lokale Link allein startet keinen Server. Die Adresse ist nur auf diesem PC erreichbar.

Start aus dem Projektverzeichnis:

```powershell
node design/orbit-modern-demo/serve.mjs
```

Auf diesem PC öffnen: **http://127.0.0.1:3121/**. Der Server bindet ausschließlich lokal und liefert nur diesen Demoordner aus. Alternativer Port: Umgebungsvariable `ORBIT_DEMO_PORT`.

Die Demo ist nicht in die Spielnavigation eingebaut. Sie besitzt eine eigene Kopie der Kampfsimulation und eigene Styles. Es gibt keine Spiel-API-Aufrufe, Anmeldung, Auszahlung oder Veränderung von Spielständen. Die separat beauftragte größere Turmreichweite im Hauptspiel bleibt davon unabhängig.

## Spielen

- „Runde ab Welle 1 starten“ beginnt mit leerem Verteidigungsring, 140 Baupunkten und 25 Sekunden Vorbereitung. „Grafiktest“ startet weiterhin bei Welle 3 mit drei fertigen Türmen. Danach laufen die Wellen regulär weiter.
- Ein gemeinsamer Auftrag pro Welle für Turmbau, Ausbau, Reparatur oder Waffenverbesserung. Über **WAFFE** lassen sich Schaden (ab 65 Punkten, +35 % Grundschaden je Stufe), Feuerrate (ab 75, Schussabstand ×0,9 je Stufe) und Begleitraketen (ab 120, alle 6/5/4 Schüsse) verbessern. Folgestufen kosten jeweils ×1,55, aufgerundet. Alle zwei gehaltenen Wellen wird eine weitere Stufe freigegeben; maximal 5/5/3 Stufen. Verbesserungen gelten bis zum Rundenende.
- Handy: linker Stick zum Zielen, FEUER halten; ABWEHR löst einen Raketenstoß aus. Zwei Finger oder −/+ zoomen die gesamte Spielwelt. Das HUD bleibt fest.
- PC: Maus zum Zielen, Maustaste oder Leertaste zum Feuern. A/D drehen; Q/E starten die Abwehr. Mausrad oder −/+ zoomen, 0 stellt die Startkamera her. P pausiert.
- Freie Plätze des einzelnen Verteidigungsrings antippen und Turm auswählen. Ein Fortschrittsbogen mit Sekunden zeigt den Bau an. Beschädigte Gegner zeigen ihre verbleibende Hülle.
- X beendet die Runde. „Zur Demo-Auswahl“ führt zurück zum Start. Neustarts setzen den Demostand zurück.

## Neue Grafik

`gpu-scene.mjs` rendert die Spielwelt mit WebGL2 und lokalem Three.js:

- Neuer detaillierter Jäger mit Metallpanzerung, roten Markierungen und zwei animierten Triebwerksflammen. Die Grafik wurde eigens für diese Demo erzeugt.
- Detaillierte Fregatte und sechs neue dunkelblaue Geschütze mit offenen Tragarmen, getrennten Modulen, Stahlkanten und Kupfermechanik. Laser, Flak, Raketensilo, Gauss, Tesla und Minen haben unterschiedliche Silhouetten. Schiffe bewegen sich und Geschütze drehen sich zum tatsächlichen Ziel. Diese Objekte sind drehbare 2D-Sprites in der räumlichen Szene.
- Die Türme im Spielfeld sind gegenüber Version 4 um 28 % verkleinert; die Bauvorschauen behalten ihre Größe. Auch die Spielerwaffe ist verkleinert. Reichweiten, Bauplätze, Kosten und Schaden bleiben gleich.
- Waffen zeigen kurze Rückstoßbewegungen, Lichtreflexe auf der Panzerung und passende Mündungsblitze. Flak hat zwei Feuerimpulse, Gauss einen längeren, hellen Impuls; der Laser beginnt am verkleinerten Emitter. `turret-art.mjs` hält Bilddateien, Größe und Drehpunkt zusammen.
- Schusseffekte speichern Richtung und Trefferpunkt beim Auslösen. Ein ausklingender Laser springt dadurch bei einem Zielwechsel nicht auf einen anderen Gegner; ein Turmausbau löst keinen Mündungsblitz aus. Die Spielerwaffe sitzt passend zum bestehenden Geschossursprung.
- Raketen haben modellierte Rümpfe, Spitzen und Leitwerke sowie animierte Abgasflammen. Feindliche Raketen leuchten orange, eigene Abfangraketen blau. Ihre Spuren laufen weich aus; Teslaentladungen haben einen violetten Lichthof und einen hellen Kern.
- Ein zusätzlicher transparenter Abgasschleier bleibt hinter Raketen zurück, verbreitert sich und löst sich auf. `missile-veil.mjs` zeichnet bis zu 320 Rauchpartikel gemeinsam; Zeitablauf und Pause folgen der Simulation.
- Waffen-Upgrades wirken sichtbar: stärkere Geschossimpulse, schnellerer Schusstakt, leuchtende Kondensatoren, kurzer Aufwertungsring und echte Begleitraketen mit eigener Abgasfahne.
- Explosionen werfen kurzlebige Panzerfragmente aus. Strukturierte Rauchwolken lösen sich auf; auch Raketentreffer erzeugen einen Lichtimpuls. Diese Effekte folgen der Simulationszeit und pausieren mit dem Spiel. Fragmentanzahl auf 120 begrenzt; keine zusätzliche Vollbildnachbearbeitung.
- Rotierende 3D-Planetenkugel mit hochaufgelöster Erdoberfläche, separat wandernder Wolkenkarte, Wolkenschatten, Ozeanreflexion und Atmosphäre. Der Planet bleibt in der Startansicht klein.
- Räumliche Asteroiden mit geschlossener, unregelmäßiger Oberfläche und feiner Gesteinsstruktur, Sterne und Nebelhintergrund.
- Animierte Triebwerksflammen und Feuerbälle, leuchtende Projektile, Trefferlicht, Partikel, Rauch und expandierende Explosionsringe. Treffer und Abschüsse stammen aus der laufenden Simulation.
- Bauvorschauen verwenden dieselben Geschützgrafiken wie der Kampf.

Die transparente 2D-Ebene ergänzt Zielhilfe, Raketen- und Teslaspuren, Schadenszahlen, Baufortschritt und Richtungsmarkierungen. Bedienung und HUD sind HTML/CSS. Kamera und Eingaben verwenden dieselben Weltkoordinaten.

Die Darstellung kombiniert detaillierte Sprites, echte 3D-Geometrie und berechnete Effekte. Die Fregatte verwendet weiterhin eine vorhandene Projektgrafik. Version 7 verwendet ausschließlich die neue, vom Nutzer bestätigte offene Turmserie.

## Dateien und Herkunft

- `vendor/`: lokale Kopie von Three.js 0.180.0 und benötigter Zusatzmodule aus der vorhandenen Projektinstallation. MIT-Lizenz unter `vendor/LICENSE`. Kein CDN erforderlich.
- `assets/earth-blue-marble-july.jpg` und `assets/earth-clouds.jpg`: unveränderte NASA-Texturen; Quellen und Nutzungshinweise stehen in `CREDITS.md`.
- `assets/fighter-v3-key.png`: neue Jägergrafik. Die genaue Bildanweisung und der Freistellungsweg beim Rendern stehen in `ART-PROMPTS.md`.
- `assets/turret-*-v7.png`: sechs neue Grafiken mit echter Transparenz; Herkunft und Bildanweisungen stehen in `TURRET-V7-PROMPTS.md`. Die früheren Fassungen werden nicht geladen.
- Fregatte und `assets/deep-space.png`: vorhandene Projektgrafiken; der Nebel stammt aus `public/assets/map/starfield-nebula-v1.png`.
- `assets/upgrade-repair.jpg`: vorhandene Grafik für die Schildreparatur im Menü.
- `reference.png`: früher erzeugtes Konzeptbild, ausschließlich über „Bildvorlage ansehen“ geöffnet. Es ist kein Spielhintergrund.
- `visuals.mjs`, `assets/planet.png` und `assets/fighter.png`: vorheriger Prototyp, als Vergleich vorhanden, vom aktuellen Renderer nicht geladen. `review/before-3d.png` dokumentiert den früheren Stand.

## Prüfung

```powershell
node design/orbit-modern-demo/verify.mjs
```

Der Test benötigt das installierte Chrome. Er startet einen separaten lokalen Server und ein eigenes Browserprofil. Getestet werden 390 × 844, 320 × 568, 844 × 390, 1280 × 800, 1920 × 1080 sowie 1280 × 720 mit 150 % Pixelskalierung (physisch Full HD): WebGL-Start, erreichbare Buttons, Pause, Weltzoom, Bauplatz und Kauf, Stick und Feuer, Abwehr, echte Abschüsse, Ende, Neustart und fehlende Spiel-API-Aufrufe.

Die aktuelle Version zeichnet direkt in den Browser-Bildpuffer. Die mehrstufige HDR/Bloom-Nachbearbeitung wurde nach einem Bericht über Flackern und schwarze Bilder in Desktop-Chrome entfernt. Die transparente 2D-Ebene nutzt keine unabhängige, desynchronisierte Bildausgabe mehr. Leuchteffekte entstehen an den Objekten durch Materialien, Lichter und Sprites. Die interne Auflösung ist auf höchstens zwei Millionen Pixel begrenzt. Die genaue Ursache auf dem betroffenen Gerät konnte nicht direkt gemessen werden; die zuvor beteiligten Bildausgabepfade wurden ersetzt.

Der Test prüft jetzt aufeinanderfolgende Bilder direkt nach der Ausgabe in den Browser-Bildpuffer. Zusätzlich werden in den drei Desktopkonfigurationen jeweils 45 tatsächliche Chrome-Bildschirmaufnahmen während längerer Kämpfe ausgewertet. Der sichtbare Planet muss beleuchtet bleiben, auch bei mehreren gleichzeitigen Explosionen. Diese Prüfung erfasst mehr als die früheren Stichproben aus internen HDR-Puffern, die Flackern bei der Bildausgabe nicht zuverlässig ausschlossen.

Screenshots und Resultate liegen unter `review/`. `detail-desktop.png` zeigt einen näheren Kameraausschnitt aus der laufenden Demo. Die dokumentierte CPU-Renderzeit ist keine Messung der GPU-Bildrate.

Zusätzlich prüft der Browserlauf den Start ab Welle 1, erreichbare Waffen- und Wellenknöpfe, Kaufkosten und Schadenswirkung, das gemeinsame Auftragslimit, Stufenfreigaben, Feuerrate sowie tatsächlich abgefeuerte Begleitraketen und ihren begrenzten Partikeleffekt. Freigabe- und Kostenprüfungen verwenden dabei gezielt vorbereitete Ressourcenstände; die Eingaben laufen über die echte Oberfläche.

Die Handyprüfungen verwenden Chrome-Touch-Emulation. Physische Handys, thermische Belastung und dauerhafte Bildraten auf schwächeren Geräten sind noch nicht geprüft. WebGL2 ist erforderlich; diese Fassung ist ein isolierter Prototyp.
