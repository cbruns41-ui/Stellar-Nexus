# Handy-Eingabe: Gebäude, Allianz-Boss und Raid-Verteidigung

Stand: 11.09.2026. Änderungen lokal umgesetzt und geprüft; noch nicht veröffentlicht.

## Gebäude auf der Basis

Die mobile CSS-Regel für die kleinen Werkzeugknöpfe traf auch die verschachtelten Gebäudezeilen. Dadurch wurden diese auf 44 Pixel Breite zusammengeschoben. Die Regel gilt jetzt nur für die direkten Werkzeugknöpfe. Gebäudezeilen nutzen die volle Listenbreite, gut lesbare Namen und mindestens 48 Pixel Höhe. Die vorhandenen Schaltflächen behalten beim Aktualisieren ihre Identität.

## Allianz-Boss

Im tatsächlich eingebetteten NEMESIS-Spiel dient der rechte Feuerknopf jetzt gleichzeitig zum Zielen: gedrückt halten und den Finger ziehen. Das Fadenkreuz bleibt beim ersten Aufsetzen an seiner bisherigen Position. Links kann unabhängig davon mit dem Stick ausgewichen werden. Direktes Berühren des Spielfelds zielt und feuert ebenfalls. Loslassen oder ein abgebrochener Touch beendet die jeweilige Eingabe. Schadensberechnung und Bossstärke wurden dadurch nicht verändert.

## Raid-Verteidigung

Die Planeten- und Schiffsauswahl scrollt innerhalb des Dialogs; Zusammenfassung und Startknopf bleiben sichtbar. Fehler erscheinen direkt am Startknopf. Während der Anfrage zeigt dieser den laufenden Start an. Nach 20 Sekunden ohne vollständige Antwort erscheint ein Hinweis auf den unbestätigten Ausgang und der Spielstand wird erneut abgefragt. Die Aktion wird nicht automatisch wiederholt, weil sie auf dem Server bereits ausgeführt sein könnte.

Die zuvor ergänzte Raid-Lebensdauer bleibt Bestandteil des aktuellen Änderungsstands: Ohne Verteidigungsfreigabe zieht der Raid zwei Stunden nach Ankunft ohne Schiffsverluste ab. Eine bestätigte Verteidigung wird als Mission verarbeitet und erhält nach dem Kampf einen Bericht. Der zitierte alte Text „Der Raid wartet auf deine Feuerfreigabe“ ist im aktuellen lokalen Stand nicht mehr vorhanden. Der Live-Server wurde bei dieser Prüfung nicht verändert.

## Nachweise

- 69 automatisierte Tests bestanden; Syntaxprüfung bestanden.
- Alle 22 Gebäude bei 320 und 390 Pixel Bildschirmbreite auf lesbare Namen und Öffnen durch den ersten Touch geprüft.
- Raid-Dialog mit sieben Planeten bei 320 × 568, 390 × 844 und 844 × 390 Pixeln geprüft. Ungültige Auswahl zeigt einen Fehler; korrigierte Auswahl startet die Verteidigung. Nach dem Kampf liegt ein Bericht vor und das Banner verschwindet.
- Allianz-Boss im produktiven iframe-Ablauf mit simulierten Touch-Eingaben in Hoch- und Querformat geprüft: Zielen, echte Treffer, gleichzeitiges Bewegen, Touch-Abbruch und serverseitig gewertete Kampfbeiträge.
- Vollständige mobile Browserprüfung ohne Browserfehler: `node scripts/verify-colony.mjs --mobile-inputs-only`.

Die Browserprüfung emuliert ein Touch-Gerät. Eine Prüfung auf einem physischen Smartphone war nicht Bestandteil dieses Durchlaufs.
