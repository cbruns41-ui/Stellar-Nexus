# Unity-Vorschau der Minispiele

`orbit-fire.png` und `alliance-boss.png` sind direkt mit Unity 6000.6.0f1 gerenderte
Bilder in 1080 × 1440 Pixeln. Modelle, Materialien, Beleuchtung, Effekte und HUD
existieren im Projekt. Die PNGs sind unveränderte Kameraaufnahmen des Prototyps.

Die Szenen liegen unter `unity-colony/Assets/CombatPreview/Generated/`:

- `orbit-fire/Preview.unity`: vier animierte Abfangjäger, Station mit Deckplatten,
  Schutzwänden und Leitungen, bewegliches Doppelgeschütz und Planet.
- `alliance-boss/Preview.unity`: gepanzerter mechanischer Gegner mit rotierendem
  Reaktorring, seitlichen Generatoren, Geschützen und zwei Begleitschiffen.

Gebaut sind abgeschrägte Panzerplatten, mehrteilige Triebwerke, Metallreflexionen,
prozedurale Oberflächentexturen, beleuchtete Kontinente/Wolken/Atmosphäre,
HDR-Leuchten mit Bloom und Tonemapping, Flugbewegung, Zielkreuz, Schussimpulse,
Rückstoß und animierte Trefferfunken. Statische Bauteile von Station, Jägern und
Geschütz sind nach Material zu gemeinsamen Meshes zusammengefasst.

Im Unity-Editor eine Szene öffnen und Play drücken. Im oberen Bildbereich ziehen
zum Zielen; unten rechts drücken oder die Leertaste halten zum Schießen. Der Code
unterstützt gleichzeitiges Zielen und Feuern mit mehreren Touchpunkten. Echte
Strahl-Kollisionen zählen Demo-Treffer; Fehlschüsse erzeugen keine Trefferfunken.
Touchverhalten und Leistung auf echten Handys sind noch nicht getestet.

Die Grafik ist ein eigenständiger Prototyp. Zeit, Schild, Abschüsse, Boss-Hülle
und Kombo in den Beispielbildern sind Gestaltungsbeispiele. Erst beim Schießen
wechselt die Trefferanzeige auf den wirklichen Demo-Zähler. Missionsablauf,
Bossphasen, serverseitige Belohnungen und die Einbindung in die App fehlen noch.

Die Hauptszene und die veröffentlichten WebGL-Dateien werden nicht ersetzt.
Reproduzierbares Rendern mit dem installierten Unity-Editor:

```powershell
& 'C:/Program Files/Unity/Hub/Editor/6000.6.0f1/Editor/Unity.exe' -batchmode -force-d3d11 -quit -projectPath 'C:/Users/cbrun/Desktop/Stellar Nexus/unity-colony' -executeMethod RenderCombatPreviews.Render -logFile 'C:/Users/cbrun/Desktop/Stellar Nexus/tmp/minigame-render.log'
```

Direct3D 11 wird verwendet, weil der Direct3D-12-Lauf auf diesem Rechner beim
Rendern abgestürzt ist. Der Renderlauf speichert und lädt jede Szene erneut,
prüft ihre Animationsreferenzen und verlangt einen erfolgreichen direkten
Treffer sowie einen erfolglosen Schuss neben das Ziel. Beide Szenen bestanden
diesen Test. Die Bilder belegen die tatsächlich gebaute Grafik; sie belegen
keine bestimmte Bildrate, Akkubelastung oder Speichergrenze auf Mobilgeräten.

# Lebendige Basis

Eine modulare Stadt lässt sich auch bei uns bauen. Benötigt werden einzeln
platzierbare Gebäude mit gemeinsamem Stil, Bauteile für Animationen, Bauplätze
mit Trefferflächen sowie Zustände für Bau, Produktion und Stillstand.

Unity dokumentiert diesen Aufbau am Spiel Galactic Colonies, einschließlich
vorberechneter Beleuchtung pro Gebäude und beweglichen Teilen:
https://unity.com/how-to/optimize-lighting-mobile-games

Camel Games beschreibt Age of Origins als Stadtaufbauspiel, veröffentlicht auf
der geprüften Produktseite aber keine belastbare technische Aufschlüsselung
seiner Gebäudedarstellung. Eine bestimmte Engine oder reine 3D-Pipeline wird
hier daher nicht als Tatsache behauptet:
https://www.camelgames.com/game/ageoforigins

Die aktuelle Nexus-Basis verwendet `Vista/colony-approved` als zusammengefasstes
Bild. Sie kann als Gestaltungsvorlage dienen, liefert aber keine separaten
Gebäude, Innenflächen oder beweglichen Bauteile. Genau darin liegt der Aufwand
für einen Umbau, nicht in fehlenden grundsätzlichen Fähigkeiten von Unity.
