# QA-Korrekturen vom 9. September 2026

## Nachgewiesene Ursachen und Änderungen

- **Kolonisation:** Das persönliche Planetenlimit wurde erst bei Ankunft geprüft. Der Start berücksichtigt jetzt bestehende Planeten und bereits gestartete Kolonisationen; doppelte Ziele werden abgelehnt. Bekannte Remnant-Sperren werden vor dem Abflug gemeldet. Bei nachträglich unmöglicher Landung kehrt die Flotte mit einem erklärenden Bericht zurück. Erfolgreiche Gründungen dokumentieren den Verbrauch genau eines Kolonieschiffs und verlinken die neue Welt.
- **Live-Ankunft:** Der Karten-Planetensprung wurde nur beim Öffnen der Karte befüllt. Er und das offene Systemfenster werden nun mit dem Serverstand aktualisiert. Flüge zeigen ihre ETA direkt beim Zielplaneten. Übersprungene oder veraltete Abschlussabfragen werden erneut versucht; eine fehlgeschlagene Ausbau-Vorschau verwirft den bestätigten Spielstand nicht mehr.
- **Raid:** Verstärkung wurde zuvor über `deploy` geschickt und konnte am Ziel-Hangarlimit scheitern. Sie besitzt jetzt einen Raid-Bezug (`fleets.raid_id`), kämpft gemeinsam im Orbit und kehrt zum Herkunftshangar zurück. Verluste werden auf die beteiligten Flotten verteilt und berichtet. Die Stationierungsgrenze wird dabei nicht überschritten. Wiederholte Freigaben eines laufenden Raids ziehen keine weiteren Schiffe ab.
- **Bestätigte Aktionen:** Flotten- und Raid-Dialoge übernehmen die POST-Antwort sofort. Langsamere ältere Aktualisierungen dürfen diesen Stand nicht zurücksetzen. Auch „Verteidigen“ im Systemfenster erkennt den NPC-Raid und nutzt denselben Ablauf wie der Alarm.
- **Verlorener erster Touch:** Die Gebäudeaktionskarte folgte der Unity-Kamera in jedem Frame. Im echten Touch-Test lag zwischen Anvisieren und Berühren wieder der Canvas unter dem Finger. Die Karte sitzt jetzt fest im sichtbaren Bereich. Sheets erhalten die Eingaben, Benachrichtigungen lassen Klicks durch, und beim laufenden Planetwechsel ist die gesamte Welt vorübergehend inert.
- **Karte:** Trefferflächen berücksichtigen auch die gezeichneten Systemnamen. Mehrere Kategorien funktionieren als Auswahlvereinigung (beispielsweise Eigen oder Feind). Die Suche findet Planetennamen, hebt widersprechende Kategorien auf und öffnet das Systemfenster. Bedienelemente werden vor der Galaxie-Netzwerkantwort gebunden. Doppelte alte Karten-Handler wurden entfernt.
- **Hangar:** Direkt in der Werft stehen planetenbezogener Bestand, Kapazität, Reserve, Bauaufträge, Reisen und ein Bestandsjournal mit Berichtslinks. Zusammengehörende Journalzeilen werden für die Anzeige zusammengefasst. Kolonieschiff-Verbrauch und Verstärkungsverluste erhalten explizite Einträge. Verlustsummen berücksichtigen mehrere eigene beteiligte Flotten.
- **Allianz:** Bei fehlendem Allianzplaneten steht direkt bei der Forschung der Blockierungsgrund mit Gründungsaktion. Vorhandene Einzahlungen bleiben bestehen. Der Kartenmodus öffnet ausdrücklich eine Allianz-Kolonisation aus einem persönlichen Hangar. Finanzierung und Start erfolgen im Allianz-Labor.
- **Bau und Einsätze:** Alle Gebäudeaktionen berücksichtigen die eine planetenbezogene Bauschleife und nennen den sichtbaren Auftrag. Einsatz-Timer verwenden dieselbe Endzeit wie die Warteschlange; Einsätze bleiben bis zur tatsächlichen Abrechnung belegt und nennen ihren Herkunftsplaneten.
- **Werft:** Ungültige Mengen außerhalb 1–50 werden auch serverseitig abgewiesen, statt still auf 50 gekürzt zu werden. Die bestehende Anzeige trennt Ressourcenmaximum, Hangarplatz und Auftragsgrenze.

## Bedienung

Auf der Basis bleiben Aufgaben, Gebäude und Erste Schritte als einheitliche kompakte Bedienelemente. Die zusätzliche Auftragskarte steht im Aufgabenfenster. Gebäudelevel bleiben sichtbar; der Lv-Schalter entfällt. Kartenfilter öffnen über einen kleinen Button neben der Lupe. Raid-Alarm und Orbit-Start belegen getrennte Bereiche.

## Prüfung

- `npm.cmd test`: 60 Tests erfolgreich, einschließlich neuer Fälle für reservierte Kolonieplätze, ungültige Werftmengen, Raid-Verstärkung über der Zielkapazität und die Trennung von Raid-Verstärkung und normalen Abfangmissionen.
- `npm.cmd run check`: JavaScript-Syntaxprüfung erfolgreich.
- `node scripts/verify-colony.mjs --qa-regressions-only`: echte Touch-Ereignisse über Chrome DevTools, isolierte Serverdatenbank. Erfolgreich geprüft: zwei Kolonielandungen von fünf auf sieben Planeten, Systemnamen-Tap, Suche, Fokuswechsel mit offenem Werftfenster, Raid-Freigabe samt Verlustbericht und verschwundenem Alarm, Bau-Sperre, Einsatz-Timer, Orbit-Feuer sowie Allianzgründung mit erhaltenen 89 % Finanzierung bis zu Einzahlung und Forschungsstart. Innerhalb dieser Abläufe wird die Seite nicht neu geladen; allein zum Laden der Testausgangslage gibt es einen Reload. Flug- und Baufristen werden ausschließlich in der Testwelt verkürzt.
- `node scripts/verify-colony.mjs`: komplette Unity-/Mobil-Suite erfolgreich am 9. September um 23:48 Uhr Berlin, ohne Browserfehler. Zusätzlich geprüft: alle 22 Collider, Kameragesten, Tutorial im Aufgabenfenster, Funk, Labor, Navigation, vier Bildschirmgrößen, Flottenabläufe, Allianzfinanzierung und Registrierungsformular. Ergebnis: `tmp/colony-review/verification.json`.

## Geltungsbereich

Die Änderungen liegen lokal vor; ein produktiver Server wurde nicht aktualisiert. Die lokale Datenbank enthält weder die gemeldeten Kolonisierungsflüge noch die zugehörigen Berichte des betroffenen Spielstands. Konkrete historische Verluste des Live-Accounts wurden daher nicht rekonstruiert oder erstattet. Hangars bleiben planetenbezogen; PvP-Regeln und Ressourcentransport-Mechanik wurden nicht geändert. Die bestehende Allianzfinanzierung verwendet weiterhin das Allianzlager.

Beim Ausrollen müssen Server und Webdateien zusammen aktualisiert werden. Der Server ergänzt die neue Flottenspalte beim Öffnen der Datenbank. PWA- und Modulversionen wurden erhöht; ein neuer Unity-Build ist für diese HTML-/Eingabeänderungen nicht erforderlich.
