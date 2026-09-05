# Lebende Unity-Basis

Die Spielansicht verwendet Unity 6000.6.0f1 als WebGL-Diorama in fester 2,5D-Perspektive. Grundlage ist das freigegebene Konzept mit dem weit entfernten Gebirgshorizont. Das Kolonialdock wurde anschließend durch einen futuristischen Dockkomplex mit kantigem Kolonieschiff ersetzt. Alle 22 Gebäude stehen dauerhaft an ihren Positionen, auch auf Stufe 0.

Die Gebäude sind einzelne Polygonflächen mit MeshCollidern auf der Bildkulisse. Es handelt sich nicht um vollständig modellierte, frei drehbare 3D-Gebäude. Die Kulisse hat 1672 × 941 Pixel; starker Zoom ist durch diese Quellauflösung begrenzt. Eine versuchte zusätzliche Bildgenerierung lieferte keine höhere Auflösung und wurde nicht übernommen.

## Spielverhalten

- Gebäude antippen: aktuelle Stufe, Betriebszustand, Ausbaukosten und Fortschritt anzeigen.
- „Info“ öffnet und markiert das betreffende Gebäude in der Infrastruktur.
- „Aufleveln“ sendet genau einen Auftrag an die bestehende Build-API. Fehlende Voraussetzungen, Ressourcen, Maximalstufen und laufende Ausbauten deaktivieren die Aktion.
- Werft, Kolonialdock, Naniten-Werft, Robotikfabrik, Verteidigungszentrum und Forschung reagieren auf die zugehörigen echten Aufträge. Bei Leerlauf steigen dezente Z-Zeichen auf.
- Rohstoffbetriebe unterscheiden Produktion, volles Lager und Stufe 0. Unterstützungseinrichtungen ohne eigene Produktionsschlange zeigen „Bereit“.
- Stufe und Status aktualisieren sich bei Serverantworten und Auftragsabschluss ohne Neuladen. Während des Ausbaus bleibt die aktuelle Stufe sichtbar.
- Ziehen verschiebt die Basis, Mausrad und Zwei-Finger-Geste zoomen. Die Gebäudeliste erreicht auch Gebäude außerhalb des Bildausschnitts. Tasten +/− und Home steuern die Kamera; Escape schließt die Auswahl.
- Levelmarkierungen lassen sich ausblenden. Reduzierte Bewegung wird berücksichtigt; bei ausgeblendeter Basis wird die Renderfrequenz abgesenkt.

## Dateien

- `public/assets/colony/colony-approved.png`: Bildkulisse mit dem überarbeiteten Kolonialdock.
- `unity-colony/Assets/Colony/Resources/Vista/colony-approved.png`: identische Unity-Textur.
- `public/js/city.mjs`: Gebäudepositionen, Konturen und Betriebszustände.
- `public/js/colony-hud.mjs`, `public/css/colony.css`: scharfe, zugängliche Bedienelemente über dem Canvas.
- `public/js/colony-unity.js`: persistente Unity-Instanz, Statusübergabe, Sichtbarkeit und Kamera.
- `unity-colony/Assets/Colony/Scripts`: Kulisse, Colliders, Kamera und Auswahl. Die nachträglich eingebauten Transportfahrzeuge wurden auf Wunsch entfernt.

Die Bildkulisse wurde mit dem eingebauten Imagegen-Werkzeug erzeugt. Vorgabe der ursprünglichen Fassung: den blauen Planetenbogen vollständig durch eine weite Landschaft mit nahezu geradem Gebirgshorizont ersetzen; Gebäude, Wege, Perspektive, Beleuchtung und Bildaufteilung erhalten. Die genaue Vorgabe der Kolonialdock-Überarbeitung steht in `colony-dock-v2-prompt.txt`; die vorherige Grafik liegt in `colony-before-dock-v2.png`.

Die gewünschte zusammenhängende Videoanimation ist noch nicht erstellt oder integriert. Sie soll die vorhandene Gesamtgrafik mit Rauch, Licht, Flugverkehr und Fahrzeugbewegung beleben. Die bisherigen Shader-Effekte sind kein Ersatz dafür. Ausgangsbild und Animationsvorgabe stehen bereit; dafür wird noch ein Videogenerator benötigt.

## Build

Im Projektverzeichnis zunächst die gemeinsame Gebäudegeometrie übertragen:

```powershell
node scripts/prepare-colony.mjs
& 'C:/Program Files/Unity/Hub/Editor/6000.6.0f1/Editor/Unity.exe' -batchmode -nographics -quit -projectPath "$PWD/unity-colony" -executeMethod Colony.Editor.WebGLBuilder.Build -logFile "$PWD/unity-colony/build-living.log"
```

Der Build schreibt die komprimierten `.unityweb`-Dateien nach `public/unity-colony/Build`. Die JavaScript-Einbindung nutzt die Dekompression des Unity-Loaders; dafür sind keine besonderen Content-Encoding-Header am Server erforderlich.

`LegacyResourceScope` nimmt ungenutzte frühere Grafikpakete vorübergehend aus Unity Resources heraus und stellt sie nach dem Build einschließlich ihrer GUIDs wieder her. Es löscht keine Quellgrafiken. Nach einem abgebrochenen Build stellt der nächste Lauf zunächst geparkte Dateien wieder her. Dadurch enthält der Download nur die benötigte Bildkulisse, Shader und Laufzeitdaten.

## Prüfung

```powershell
npm.cmd run check
npm.cmd test
node scripts/verify-colony.mjs
```

Der Browsertest startet seine eigene Instanz auf Port 3100, verwendet ausschließlich `tmp/colony-verification.db` und startet Chrome unsichtbar. Er prüft alle 22 Unity-Treffflächen, Info-Routing, einen echten Ausbau, eine echte Schiffsproduktion, Live-Abschlussanzeigen, Touch-Verschieben, Zwei-Finger-Zoom, mobile Fenstergrenzen und reduzierte Animationen. Für schnelle Abschlussprüfungen wird nur die isolierte Testschlange verkürzt und die Browseruhr vorgerückt.

Screenshots und Browsermeldungen liegen unter `tmp/colony-review`. Die Tests wurden mit 1440 × 960 sowie emulierten 390 × 844 bei Pixelfaktor 2 durchgeführt. Physische Android-/iOS-Geräte und Safari wurden noch nicht getestet; eine geräteübergreifende Bildratenzusage ergibt sich aus diesen Prüfungen nicht.
