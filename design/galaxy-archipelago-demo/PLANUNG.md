# Galaxien-Archipel: Kapazität und langfristige Entwicklung

Stand: 16. September 2026. Konzept für 200–300 Spieler, deren Kolonien gleichzeitig bestehen. Keine Änderung am Hauptspiel, kein Zugriff auf die produktive Datenbank. Zahlen zur Auslastung sind Szenarien, keine gemessene Wachstumsprognose.

## Was der aktuelle Code vorgibt

- `src/catalog.js`, `maxPlanets`: maximal 36 persönliche Planeten einschließlich Heimatwelt. Freigabe durch `1 + Kolonisationsforschung + floor(Astrophysik / 2)`, gedeckelt bei 36.
- `colonyShipCost` erhöht die Kosten des nächsten Kolonieschiffs exponentiell um Faktor 1,85 je bereits zusätzlichem persönlichen Planeten. Das technische Maximum von 36 ist deshalb kein Beleg dafür, dass normale Spieler dieses nach zwei Jahren erreichen. Ökonomie und tatsächliche Entwicklung müssen gemessen werden.
- `src/galaxy.js`: Die aktuelle Neugenerierung enthält 513 Systeme mit jeweils 2–5 Planeten. Statistisch sind das etwa 1.796 Planeten; die tatsächliche Zahl hängt vom Seed ab. Das ist keine Zählung der laufenden Welt. Bestehende Welten können durch frühere Generatoren und Erweiterungen abweichen.
- NPC-Besatzungen sind derzeit systembezogen. Eine Piratenquote muss daher Systeme samt ihren Planeten berücksichtigen, nicht nur einzelne vermeintlich belegte Planeten.
- `src/npc-sites.js`: Teilverluste beginnen nach sechs Stunden zu regenerieren, der Wiederaufbau dauert weitere 18 Stunden. Vollständig befreite Standorte bleiben 72 Stunden frei. Bereits besiedelte Systeme und Systeme mit anfliegender Kolonisation werden geschützt. Höhere Piratenhorste können beim Wiederkehren eine Stufe gewinnen; einfachste Ziele bleiben erhalten. Das ist ein vorhandener Ansatz für wiederkehrende Inhalte.

## Wie viele Planeten?

Planeten werden durch Spielzeit nicht verbraucht. Entscheidend sind die Anzahl dauerhaft bestehender Reiche, deren Besitz, Allianzwelten, NPC-Belegung und eine gut verteilte freie Reserve.

| Planeten pro Spieler, einschließlich Heimatwelt | 200 Spieler | 300 Spieler |
| --- | ---: | ---: |
| 12 | 2.400 | 3.600 |
| 18 | 3.600 | 5.400 |
| 24 | 4.800 | 7.200 |
| 36, technisches Maximum | 7.200 | 10.800 |

Empfohlener ausbaubarer Rahmen: **6 Galaxien × 800 Systeme × durchschnittlich 4 Planeten = 19.200 Planeten**. In der Demo sind es pro Galaxie exakt 3.200, durch eine gleichmäßige Verteilung von 2–6 Planeten pro System. Der aktuelle Hauptspielgenerator mit 2–5 Planeten erreicht im Mittel nur 3,5: Dort wären 4.800 Systeme im Mittel 16.800 Planeten. Für einen späteren Einbau also entweder den Mix ausdrücklich ändern oder die Systemzahl passend erhöhen; keine stillschweigende Annahme von vier Planeten.

Beispiel einer konservativen Endbelegung:

| Verwendung | Planeten |
| --- | ---: |
| 300 Reiche am Maximum von 36 | 10.800 |
| Allianzwelten, beispielhaft 60 | 60 |
| NPC-Gebiete, rund 15 % der Gesamtfläche | 2.880 |
| Freie Reserve | 5.460 |
| Gesamt | 19.200 |

Die 60 Allianzwelten sind eine Planungsreserve, kein neues Allianzlimit. Auch 15 % NPC-Fläche ist ein Vorschlag, keine Beschreibung der heutigen Verteilung. Die freie Reserve muss über Regionen und Planetentypen verteilt sein. Ein freier Planet am anderen Kartenende ersetzt keinen erreichbaren Siedlungsplatz.

Wenn 200–300 nur gleichzeitig aktive Spieler bezeichnet, aber mehr inaktive Reiche ihre Kolonien behalten, reicht diese Rechnung nicht: Dann zählt der Besitz aller Reiche. Bei Wachstum über diese Annahme hinaus werden zusätzliche Galaxien ergänzt.

## Nicht alles auf einmal öffnen

Für eine etablierte Welt mit 200–300 Spielern sind zunächst **drei Galaxien mit 9.600 Planeten** ein sinnvoller Ausgangspunkt. Für einen Neustart mit wenigen Dutzend Spielern reicht zunächst eine Galaxie; weitere Regionen werden nach tatsächlichem Bedarf geöffnet. Die Demo zeigt drei und kann auf sechs erweitert werden.

Vorschlag für eine Erweiterung: Sobald in den offenen Regionen etwa **60 % der nutzbaren, nicht für NPCs reservierten Siedlungsfläche** belegt oder durch laufende Kolonisation reserviert sind, eine weitere Galaxie vorbereiten. Zusätzlich regionale Knappheit, Planetentypen, neu angelegte Reiche und 30/90-Tage-Wachstum prüfen. Eine hohe Quote über sieben Tage verhindert ständiges Umschalten; schneller Zuwachs oder lokale Knappheit können eine frühere Erweiterung auslösen.

Beispiel: Bei 9.600 Planeten und 15 % reservierter NPC-Fläche bleiben 8.160 Siedlungsplätze. 60 % davon sind 4.896 belegte oder reservierte Plätze. Dann erweitern, bevor Spieler an die Grenze stoßen. Ohne Spielerzahlen und Besitzentwicklung wäre ein fester Termin wie „Galaxie vier nach sechs Monaten“ willkürlich.

Neue Galaxien werden angehängt. Bestehende Planeten, IDs, Besitzverhältnisse und Flugaufträge bleiben erhalten. Keine automatische Löschung inaktiver Kolonien und kein erzwungener Weltreset. Umgang mit dauerhaft verlassenen Reichen wäre eine eigene, vorher kommunizierte Spielregel.

## Wie die Karte bedient wird

- Übersicht: runde Galaxien, zentrale schwarze Löcher, wenige wichtige Systeme und Verbindungen. Dekorative Lichtpunkte sind keine zusätzlichen Siedlungsplätze.
- Galaxie: mehr Systeme und Namen erscheinen beim Zoomen. Eigene Welten und Auswahl haben Vorrang vor unbedeutenden Beschriftungen.
- System: ein Tap öffnet alle Planeten mit eindeutigen römischen Nummern, Eigentümerstatus und Planetentyp. Suche findet System- und Planetennamen.
- Suche und Filter arbeiten auf den tatsächlichen Daten, nicht nur auf den gerade gezeichneten Markierungen. In der Übersicht zusammengefasste Sterne werden beim Hineinzoomen einzeln erreichbar.
- Flotten werden entlang ihrer Route mit Ziel und echter ETA dargestellt. In dieser Grafikdemo sind es ausschließlich animierte Beispielverbindungen, keine echten Flugaufträge oder Zeitberechnungen.
- Schwarze Löcher sind zunächst Orientierungspunkte. Ein späteres Ereignis- oder Expeditionssystem wäre möglich; keine unangekündigten Flottenverluste durch dekorative Kartenobjekte.

## Was 1–2 Jahre Laufzeit trägt

Eine große Karte schafft Platz, aber keine garantierte Langzeitmotivation. Wiederkehrende NPC-Standorte, anspruchsvollere optionale Gebiete, Allianzprojekte, Forschung und wechselnde Ereignisse müssen fortlaufend Ziele bieten.

Piraten brauchen Einsteiger-, mittlere und schwere Ziele. Nicht alle Gegner dürfen automatisch mit den stärksten Spielern hochskalieren. Wiederaufbau und freie Kolonisationsfenster sichtbar anzeigen; keine neuen Besatzungen unter bestehenden Kolonien und keine überraschende Verstärkung unmittelbar vor einem bereits gestarteten Angriff.

Saisons können Ranglisten und Ereignisse erneuern, während Kolonien und grundlegender Fortschritt bestehen bleiben. Die Zahl gleichzeitig aktiver Piratenstandorte sollte sich am Bedarf und der regionalen Aktivität orientieren, nicht unbeschränkt mit jedem vergangenen Tag steigen.

Vor Freigabe messen: aktive und erhaltene Reiche, Besitzverteilung (Median und obere 10 %), freie erreichbare Plätze pro Region/Typ, Kolonisationsgeschwindigkeit, tägliche NPC-Kämpfe, Wiederaufbauzeiten, Ressourcenzufluss und Ausgaben. Daraus folgen Erweiterung und Balancing. Die heutige exponentielle Kolonieschiff-Kostenkurve muss dabei gesondert geprüft werden; diese Demo verändert sie nicht.

## Technischer Einbau später

Die Demo nutzt unabhängige Beispieldaten. Ein späterer Einbau braucht eigene Galaxie-IDs, stabile System-/Planeten-IDs, Migration und Tests. Eine rein optische Neuplatzierung darf Entfernungen, Sprungverbindungen und laufende Flugzeiten nicht nebenbei ändern. Darstellungskoordinaten und Spielentfernungen müssen zunächst getrennt behandelt werden; neue Reiserouten wären eine ausdrücklich getestete Regeländerung.

### Flugzeit zwischen Galaxien

Keine Luftlinie über die Kartengrafik. `x/y` in der Datenbank bleiben lokale Koordinaten innerhalb einer Galaxie; die Archipel-Ansicht rechnet daraus nur Anzeigepunkte.

- **Gleiche Galaxie:** unveränderte `travelPlan`-Formel (Distanz, Link-Hops, Schiffstempo, Warp/Hyperspace, Bake, Spezies/Relikt/Allianz).
- **Andere Galaxie:** Anflug zum öffentlichen Sprungtor + Sprung + Anflug vom Ziel-Tor. Pathfinding wählt die schnellste erreichbare Torkette. Ohne Route kein Auftrag.
- **Sprungdauer:** Basis 30 Minuten (6 Ticks). Warp und Hyperspace kürzen höchstens um 40 Prozent, Untergrenze 15 Minuten, immer tick-aligned. Öffentliche Routen werden nie instant.
- **Reichweite:** Jeder lokale Abschnitt muss `hopsAllowed` erfüllen. Der Sprung zählt nicht als Warp-Hop, braucht aber Warp ≥ 1. Neue Spieler bleiben damit in der Heimatgalaxie, bis sie ein Tor erreichen.
- **Treibstoff:** lokale Beine wie bisher über Hops; je Sprung zusätzlich die Kosten von 4 Hops.
- **Tore:** öffentlich, an zentralen und äußeren Hubs. Verbindungen sternförmig über Aurelia. Keine Spieler-Baukosten für die Galaxie-Tore selbst.

Für 4.800 Systeme und 19.200 Planeten sind nicht alle Planetenbilder und Details gleichzeitig zu laden: Systemzusammenfassungen für den sichtbaren Ausschnitt, Planetendetails erst nach Auswahl, Suchindex unabhängig von der Darstellung. Räumlicher Index, Zoomstufen, begrenzte Namen und sichtbare Routen halten die Bedienung ruhig. NPC- und Wirtschaftsberechnung erfolgt zeitbasiert in begrenzten Arbeitspaketen oder bei Bedarf, nicht einmal pro Planet und Bildschirmframe. Die Demo validiert das Bedienkonzept, keine Serverkapazität für 300 echte Spieler.
