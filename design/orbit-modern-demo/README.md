# Orbit-Feuer – eigenständige 3D-Demo

Start aus dem Projektverzeichnis:

```powershell
node design/orbit-modern-demo/serve.mjs
```

Auf diesem PC öffnen: **http://127.0.0.1:3121/**. Der Server bindet ausschließlich lokal und liefert nur diesen Demoordner aus. Alternativer Port: Umgebungsvariable `ORBIT_DEMO_PORT`.

Die Demo ist nicht in die Spielnavigation eingebaut. Sie besitzt eine eigene Kopie der Kampfsimulation und eigene Styles. Es gibt keine Spiel-API-Aufrufe, Anmeldung, Auszahlung oder Veränderung von Spielständen. Die separat beauftragte größere Turmreichweite im Hauptspiel bleibt davon unabhängig.

## Spielen

- Start bei Welle 3 mit drei fertigen Türmen und 140 Baupunkten. Danach laufen die Wellen regulär weiter. Ein Bau-, Ausbau- oder Reparaturauftrag pro Welle.
- Handy: linker Stick zum Zielen, FEUER halten; ABWEHR löst einen Raketenstoß aus. Zwei Finger oder −/+ zoomen die gesamte Spielwelt. Das HUD bleibt fest.
- PC: Maus zum Zielen, Maustaste oder Leertaste zum Feuern. A/D drehen; Q/E starten die Abwehr. Mausrad oder −/+ zoomen, 0 stellt die Startkamera her. P pausiert.
- Freie Plätze des einzelnen Verteidigungsrings antippen und Turm auswählen. Ein Fortschrittsbogen mit Sekunden zeigt den Bau an. Beschädigte Gegner zeigen ihre verbleibende Hülle.
- X beendet die Runde. „Zur Demo-Auswahl“ führt zurück zum Start. Neustarts setzen den Demostand zurück.

## Neue Grafik

`gpu-scene.mjs` rendert die Spielwelt mit WebGL2 und lokalem Three.js:

- Neue geometrische Jäger, Fregatten, Raketen und sechs unterschiedliche Geschütztürme mit Panzerplatten, Triebwerken und Cockpits. Die alten Schiffs- und Turm-PNGs werden im Kampf nicht mehr verwendet.
- Metallmaterialien mit Umgebungsreflexionen, gerichtetes Licht und farbige Triebwerke. Geschütze drehen sich zum tatsächlichen Ziel.
- Rotierende Planetenkugel mit beleuchteter Oberfläche, Wolken und atmosphärischem Rand. Der Planet bleibt in der Startansicht klein.
- Räumliche Asteroiden, Sterne und ein Nebelhintergrund.
- Leuchtende Triebwerke und Projektile, Trefferlicht, Partikel, Rauch und expandierende Explosionsringe. Treffer und Abschüsse stammen aus der laufenden Simulation.
- Bauvorschauen werden direkt aus denselben 3D-Turmmodellen gerendert.

Die transparente 2D-Ebene ergänzt Zielhilfe, Raketen- und Teslaspuren, Schadenszahlen, Baufortschritt und Richtungsmarkierungen. Bedienung und HUD sind HTML/CSS. Kamera und Eingaben verwenden dieselben Weltkoordinaten.

Die Modelle sind eigens im Code konstruierte, stilisierte Geometrien. Die Demo verspricht keine identische Reproduktion des ursprünglichen Konzeptbildes oder die Produktionsqualität individuell modellierter und texturierter Assets.

## Dateien und Herkunft

- `vendor/`: lokale Kopie von Three.js 0.180.0 und benötigter Zusatzmodule aus der vorhandenen Projektinstallation. MIT-Lizenz unter `vendor/LICENSE`. Kein CDN erforderlich.
- `assets/planet.png` und `assets/deep-space.png`: unveränderte Kopien vorhandener Projektgrafiken; der Nebel stammt aus `public/assets/map/starfield-nebula-v1.png`.
- `assets/upgrade-repair.jpg`: vorhandene Grafik für die Schildreparatur im Menü.
- `reference.png`: früher erzeugtes Konzeptbild, ausschließlich über „Bildvorlage ansehen“ geöffnet. Es ist kein Spielhintergrund.
- `visuals.mjs` und übrige alte Sprite-Dateien: vorheriger 2D-Prototyp, als Vergleich vorhanden, vom neuen Renderer nicht geladen. `review/before-3d.png` dokumentiert den früheren Stand.

## Prüfung

```powershell
node design/orbit-modern-demo/verify.mjs
```

Der Test benötigt das installierte Chrome. Er startet einen separaten lokalen Server und ein eigenes Browserprofil. Getestet werden 390 × 844, 320 × 568, 844 × 390, 1280 × 800, 1920 × 1080 sowie 1280 × 720 mit 150 % Pixelskalierung (physisch Full HD): WebGL-Start, erreichbare Buttons, Pause, Weltzoom, Bauplatz und Kauf, Stick und Feuer, Abwehr, echte Abschüsse, Ende, Neustart und fehlende Spiel-API-Aufrufe.

Version 2 zeichnet die 3D-Szene direkt in den Browser-Bildpuffer. Die mehrstufige HDR/Bloom-Nachbearbeitung wurde nach einem Bericht über Flackern und schwarze Bilder in Desktop-Chrome entfernt. Die transparente 2D-Ebene nutzt keine unabhängige, desynchronisierte Bildausgabe mehr. Leuchteffekte entstehen an den Objekten durch Materialien, Lichter und Sprites. Die interne Auflösung ist auf höchstens zwei Millionen Pixel begrenzt. Die genaue Ursache auf dem betroffenen Gerät konnte nicht direkt gemessen werden; die zuvor beteiligten Bildausgabepfade wurden ersetzt.

Der Test prüft jetzt aufeinanderfolgende Bilder direkt nach der Ausgabe in den Browser-Bildpuffer. Zusätzlich werden in den drei Desktopkonfigurationen jeweils 45 tatsächliche Chrome-Bildschirmaufnahmen während längerer Kämpfe ausgewertet. Der sichtbare Planet muss beleuchtet bleiben, auch bei mehreren gleichzeitigen Explosionen. Diese Prüfung erfasst mehr als die früheren Stichproben aus internen HDR-Puffern, die Flackern bei der Bildausgabe nicht zuverlässig ausschlossen.

Screenshots und Resultate liegen unter `review/`. `detail-desktop.png` zeigt einen näheren Kameraausschnitt aus der laufenden Demo. Die dokumentierte CPU-Renderzeit ist keine Messung der GPU-Bildrate.

Die Handyprüfungen verwenden Chrome-Touch-Emulation. Physische Handys, thermische Belastung und dauerhafte Bildraten auf schwächeren Geräten sind noch nicht geprüft. WebGL2 ist erforderlich; diese Fassung ist ein isolierter Prototyp.
