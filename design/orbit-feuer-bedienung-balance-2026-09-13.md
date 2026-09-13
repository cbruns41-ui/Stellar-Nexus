# Orbit-Feuer: Bedienung und Balance

Stand: 13. September 2026. Änderungen im lokalen Projekt, noch nicht veröffentlicht.

## Bedienung

- Nach Nutzerkorrektur: Das Fenster füllt das Display dauerhaft. Zwei-Finger-Geste, Mausrad und −/+ bewegen die Kamera zwischen 0,55- und 5-facher Übersicht. Planet, Türme, Gegner, Geschosse, Effekte und Hintergrund skalieren gemeinsam; das HUD bleibt fest. Taste 0 stellt die Übersicht wieder her.
- Die Welt ist von der Displaygröße unabhängig: Planetenradius 52, Anflugradius 850 Welteinheiten. Die Startkamera passt den gesamten Anflugbereich zwischen HUD und Steuerung ein. Auf 390 × 844 ist die Planetengrafik ungefähr 24 Pixel breit. Der Zoom verändert weder Positionen noch Kollisionen oder die Lebensdauer von Geschossen. Insbesondere werden Geschosse außerhalb des sichtbaren Ausschnitts weiter simuliert.
- Pause und Beenden stehen in einer eigenen Leiste mit mindestens 44 Pixel großen Trefferflächen. Anzeigen stehen darunter; das Querformat hält die Zusatzanzeigen links vom Planeten.
- Ein Verteidigungsring mit sechs Bauplätzen. Der Schild ist eine separate Anzeige, kein zweiter Bauring.
- Der Bauplatz wird beim Loslassen einer Zoom-Geste nicht versehentlich geöffnet. Abgebrochene Touch-Eingaben lösen keinen Kauf aus.
- Das Baumenü behält seine Buttons bei unverändertem Angebotszustand, statt sie mit jedem Timer-Tick neu anzulegen.

## Baupunkte und Fortschritt

| Ereignis | Baupunkte |
| --- | ---: |
| Startbudget | 85 |
| Leichter Gegner | 2 |
| Schwerer Gegner | 6 |
| Rakete | 1 |
| Letzter Treffer mit Spielerkanone | zusätzlich 1, bei schweren Gegnern 2 |
| Gehaltene Welle w | 8 + min(20, 2 × w) |

Verfügbare Baupunkte und insgesamt verdiente Baupunkte werden getrennt gezählt. Eine verlorene, nur angefangene Welle zählt im Ergebnis nicht als gehalten. Gegner, die bereits zerstört wurden, können im selben Simulationsschritt nicht mehr den Schild rammen und dadurch ihren Abschuss unterschlagen.

Pro Welle gibt es einen Auftrag für Neubau, Ausbau oder Reparatur. Ungenutzte Aufträge verfallen; nur das Abschließen einer Welle gibt einen neuen Auftrag. Der erste Auftrag steht vor Welle 1 bereit. Neubau dauert vier Sekunden, Ausbau drei; während dieser Zeit feuert der Turm nicht. Pause hält auch die Bauzeit an.

Grundpreise: Laser 80, Silo 95, Flak 90, Gauss 130, Tesla 150, Mine 50. Der Preis eines neuen dauerhaften Turms ist sein Grundpreis × (1 + 0,15 × vorhandene dauerhafte Türme), auf die nächsten fünf Punkte aufgerundet. Minen behalten ihren Grundpreis.

Ausbau von Stufe L kostet Grundpreis × (0,8 + 0,35 × L^1,5), auf die nächsten fünf Punkte aufgerundet. Verfügbares Level: min(8, 1 + floor(gehaltene Wellen / 3)). Stufe 2 öffnet nach drei, Stufe 8 nach 21 gehaltenen Wellen.

Reparatur: bis zu 28 Schildpunkte, erster Preis 50, danach jeweils +25. Bei vollem Schild wird kein Auftrag und kein Budget verbraucht.

Turmreichweite wächst nur um fünf Einheiten je Level ab 145. Die Feuerpause sinkt je Level um drei Prozent. Schaden wächst um 0,18 je Level ab 1, bei Gauss um 0,35 ab 2. Gegnermenge, Tempo und Hülle steigen weiter mit der Welle. Dadurch ersetzt ein voller Ring das Spielerfeuer nicht.

Die serverseitige Ressourcenbeute und Ranglistenberechnung sind weiterhin von gehaltenen Wellen und Abschüssen abhängig. Baupunkte sind ausschließlich Budget innerhalb der Runde.

## Verifikation

`node scripts/verify-orbit-siege.mjs` prüft das echte Spielmodul mit den Styles des Spiels in isoliertem Headless Chrome. Keine Anmeldung und keine Schreibzugriffe auf die Spieldatenbank.

- Touch-Bedienung, Fenstergrenzen und getrennte Toolbar/Anzeigen in 390 × 844, 320 × 568, 844 × 390 und 1280 × 800.
- Pinch und Mausrad verändern die Kamera; Fenstermaße, Weltpositionen und Ringradius bleiben gleich. Gegner in festen Weltpositionen werden bei Zoom korrekt gemeinsam skaliert. Touch-Zielen und Feuer treffen auch Gegner mit negativen Weltkoordinaten. Pause, Fortsetzen und Rückkehr schließen korrekt.
- Erster Laserkauf lässt fünf Baupunkte übrig; ein zweiter Auftrag ist gesperrt und verbraucht keine Punkte. Bauzeit läuft tatsächlich ab.
- Simulierter aktiver Durchlauf mit ausschließlich regulär verdienten Punkten: nach Welle 3 ein Turm, nach Welle 6 drei Türme, Welle 7 gehalten und in Welle 8 mit fünf Türmen besiegt. Das ist eine konkrete Stichprobe mit automatischem Zielen, keine Prognose für jeden Spieler.
- Drei kontrollierte Vergleiche in Welle 8 mit sechs Türmen auf Stufe 2: ohne Spielerfeuer dreimal besiegt; mit Spielerfeuer alle drei Wellen gehalten (72, 14 und 100 Schildpunkte). Der größere Anflugbereich verlängert die Anflugzeit; schwere Gegner können dabei zusätzliche Raketen starten.
- Ein absichtlich überstark gestarteter Test mit sechs Türmen auf Stufe 8 in Welle 20 verliert ohne Spielerfeuer. Regulär ist Level 8 erst nach Welle 21 möglich.
- 83 bestehende Tests bestanden, Syntaxprüfung und `git diff --check` bestanden.

Die Kampftests verwenden den tatsächlichen Simulationsschritt mit festen Zufallsfolgen und beschleunigter Frame-Zeit; Grafikaufrufe sind dort abgeschaltet. Die separaten Layoutprüfungen rendern echte Bilder. Die Browsertests ersetzen keinen Test auf einem physischen Handy und belegen keine perfekte Balance für alle Spielstrategien.

Spielerhilfe: `public/help.html#orbit-feuer`. Wiederholbare Testergebnisse und Screenshots: `tmp/orbit-current-review/` (von Git ignoriert).
