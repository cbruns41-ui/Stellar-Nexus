# Piratensystem – Konzept, Umsetzung und Betriebsbericht

Stand: 10. September 2026. Im Projekt umgesetzt und lokal geprüft; keine Veröffentlichung auf einem produktiven Server durch diesen Arbeitslauf.

## Warum zwei Tage lang kein neuer Angriff kam

Die alte Planung ließ **höchstens zwei Raids in der gesamten Spielwelt** und einen je Imperium zu. Ein Raid ohne Verteidigungsfreigabe blieb unbegrenzt gespeichert. Zwei liegengebliebene Raids konnten deshalb neue Angriffe für sämtliche Spieler verhindern. Die Ankunftszeit lief trotzdem weiter; ältere Oberflächen zeigten danach dauerhaft „0s“.

Das ist ein nachgewiesener Fehler im bisherigen Code und passt zur gemeldeten Situation. Die konkreten zwei Tage auf dem produktiven Server wurden hier nicht anhand seiner aktuellen Datenbank rekonstruiert.

Weitere Befunde:

- Piratenhorste wurden bei Weltaktualisierungen sofort vollständig aufgefüllt und konnten zufällig aufsteigen. Häufige Serveranfragen beschleunigten ihre Entwicklung.
- Reine Remnants hatten keinen individuellen Wiederaufbau. Eine globale Mindestzahl sollte Ersatz erzeugen, zählte aber auch Piratenhorste mit und wurde in der bestehenden großen Galaxie praktisch nie unterschritten.
- Im Kampf und in der Vorschau wurde bei Horsten zusätzlich zur gespeicherten Flotte eine zweite Standardgarnison addiert. Spionage und Karte zeigten nur die erste.
- Ein Angriff auf einen bereits leeren, freien Planeten konnte erneut einen Sieg samt Beute und XP erzeugen.

Diese Mechanismen wurden ersetzt beziehungsweise korrigiert.

## Das Konzept: eine Fraktion, drei Aufgaben

Spieler sehen künftig durchgehend **Piraten**. Die alten Remnants heißen **Piratenbesatzungen**. Die Unterscheidung ihrer Aufgaben bleibt erhalten:

| Gegner | Aufgabe im Spiel | Entwicklung |
|---|---|---|
| Piratenbesatzung | Ein freies System vor der Kolonisation sichern; regionale PvE-Ziele | Regionale Flottenzusammenstellung bleibt bestehen |
| Piratenhorst | Wiederkehrendes PvE-Ziel mit Stufe und zusätzlicher Beute | Anfängerhorste bleiben leicht; höhere Horste steigen nach einer Niederlage auf |
| Piraten-Raid | Freiwillig freigegebener Verteidigungskampf am eigenen Planeten | Jede neu erzeugte Flotte richtet sich nach der persönlichen militärischen Situation |
| Piratenanführer / Warlord | Seltene stärkere Systemwache mit Reliktchance | Zusätzliche Eskorte gehört zum gespeicherten Flottenbestand |

Das gemeinsame Benennen verursacht kein grundlegendes technisches Problem. Interne Felder wie `remnant`, `pirate` und alte Berichtsdaten bleiben kompatibel. Historische Nachrichten werden nicht nachträglich umgeschrieben. Unterschiedliche Rollen sind sinnvoll: Besatzungen geben der Expansion ein Ziel, Horste liefern wiederkehrende Kämpfe, Raids machen die eigene Verteidigung relevant.

Neue Raids heißen einheitlich Piraten. Die bisher zufällig auftauchende alternative Raid-Bezeichnung „Nexus-Echo“ wird nicht mehr neu erzeugt; bestehende Raids bleiben technisch auflösbar. Der Nexus-Riss und seine Expeditionsfunktion sind davon unabhängig.

## Systemwachen und Wiederaufbau

Eine Systemwache gilt gemeinsam für alle Planeten desselben Systems. Wer Planet I angreift, kämpft gegen dieselbe Wache wie jemand an Planet II. Eine erfolgreiche Befreiung öffnet das ganze System.

Nach einem Gefecht, bei dem die Piraten das System halten:

1. Die tatsächlichen überlebenden Schiffe werden gespeichert.
2. Sechs Stunden lang werden keine fehlenden Schiffe ersetzt. Das ermöglicht Folgeangriffe und Zusammenarbeit.
3. Danach werden die fehlenden Schiffe innerhalb von 18 Stunden schrittweise ersetzt. Es wird je Schiffstyp abgerundet; einzelne große Schiffe können dadurch erst spät zurückkehren.
4. Nach insgesamt 24 Stunden ist die ursprüngliche Sollflotte wieder erreicht, sofern keine weitere Schlacht oder anfliegende Angriffsflotte den Ablauf unterbricht.
5. Ein weiteres Gefecht speichert die neuen Überlebenden und beginnt erneut mit sechs Stunden Ruhezeit.

Anfliegende Angriffe verhindern ein Auffüllen unmittelbar vor ihrem Eintreffen. Die angezeigten Termine sind deshalb früheste Wiederaufbauzeiten. Wird ein Anflug abgebrochen, kann beim nächsten Weltlauf der inzwischen zeitlich erreichte Wiederaufbaustand übernommen werden.

Nach vollständiger Befreiung:

- Mindestens **72 Stunden** bleibt das System frei.
- Danach kehrt seine Besatzung beziehungsweise sein Horst zurück, falls das System weiterhin unbesiedelt ist.
- Schon **eine besiedelte Welt** schützt das gesamte System vor dieser Wiederbesetzung. Das gilt ebenso für Allianzkolonien.
- Bereits anfliegende persönliche oder Allianz-Kolonisationsmissionen verhindern eine Wiederbesetzung während ihrer Reise.
- Wird eine Kolonisation abgebrochen und ist das Schutzfenster bereits vorbei, darf das weiterhin leere System wieder besetzt werden.
- Auf bereits leere Ziele geschickte Angriffsflotten erhalten einen Rückkehrbericht und kehren ohne neue Beute, XP oder Siegpunkte zurück.

Karte, Spionage und Kampf greifen auf denselben gespeicherten Flottenbestand zu. Die unsichtbare zweite Horstflotte entfällt. Die Eskorte eines neu eingesetzten Anführers wird einmalig hinzugefügt und danach wie jede andere Flotte behandelt. Anführer werden nicht auf gerade beschädigte Wachen oder auf Ziele mit anfliegenden Angriffen gesetzt.

## Stärke über ein bis zwei Jahre

### Besatzungen

Ihre Sollflotte richtet sich nach der Region der Galaxie. Der Außenraum kann dadurch anspruchsvoll bleiben, während die bisher leichte Region erhalten bleibt. Bloße Laufzeit macht diese Ziele nicht immer stärker. Die Ringzuordnung wird jetzt gespeichert; für bestehende Systeme wird sie bei der Umstellung anhand ihrer Position rekonstruiert.

### Horste

- Stufen **1–3** sind dauerhafte Anfängerziele und bleiben auf ihrer jeweiligen Stufe.
- Ab Stufe **4** kehrt ein vollständig besiegter Horst beim nächsten Wiederaufbau **eine Stufe höher** zurück.
- Obergrenze: **99**.
- Ein unangegriffener Horst steigt nicht durch Zeitablauf, Neustarts oder Seitenaufrufe auf.
- Teilangriffe verändern seine Stufe nicht.

Das Flottenbudget verwendet bis Stufe 31 einen begrenzten exponentiellen Abschnitt und wächst danach linear:

`70 × 1,18^min(30, Stufe−1) × (1 + 0,08 × max(0, Stufe−31))`

Die Zusammensetzung wechselt mit der verfügbaren Schiffsklasse. Basiswache und Rundung kommen zum Budget hinzu. Eine zusätzliche Prüfung verhindert, dass ein Schiffsklassenwechsel die berechnete Gesamtstärke gegenüber der vorherigen Stufe senkt; fehlende Stärke wird mit Jägern ausgeglichen. Alle 99 Stufen sind darauf getestet. Das Budget ist eine interne Mischung aus Angriff und Haltbarkeit, **nicht** die im Kampf angezeigte reine Feuerkraft.

Beispiele für frisch erzeugte Horste ohne Anführer:

| Stufe | Schiffe insgesamt | Charakter |
|---|---:|---|
| 1 | 6 | Kleine Jägerwache |
| 3 | 7 | Leichte gemischte Wache |
| 10 | 12 | Jäger, Interceptoren, Fregatten, Bomber, Frachter |
| 19 | 21 | Erste größere Verbände einschließlich Träger |
| 30 | 62 | Schwere Mischung einschließlich Schlachtschiffen |
| 50 | 120 | Großverband mit Dreadnoughts |
| 99 | 305 | Begrenztes Endgame-Ziel statt unendlicher Zahlensteigerung |

Bestehende Überlebendenbestände werden bei der Übernahme nicht pauschal gegen diese Beispieltabelle ausgetauscht. Ein bisher stärkerer Horst kann daher während seines laufenden Lebenszyklus noch vom neuen Standard abweichen; nach Befreiung und Wiederkehr gilt die neue Formel.

### Neue Horste und Flächenverbrauch

Alle sechs Stunden wird geprüft, ob Horste fehlen. Ziel sind ungefähr fünf Prozent der Systeme, mindestens drei und höchstens 40 Horststandorte. Pro Ergänzungslauf kommen höchstens drei neue Standorte hinzu; lange Serverpausen erzeugen keine nachgeholte Massenbesetzung.

Befreite Horststandorte zählen während ihres Schutzfensters weiter mit. Dadurch entstehen nach jedem Sieg nicht zusätzlich neue Horste, während alte Standorte ebenfalls zurückkehren. Kolonisierte Standorte zählen nicht mehr als verfügbare Horste; Ersatz darf auf einem anderen geeigneten freien System entstehen. Hubs, besiedelte Systeme, bekannte bestehende Standorte und Systeme mit Kolonisationsanflug werden nicht als neue Horststandorte gewählt.

Leichte, mittlere und schwere Ergänzungen wechseln sich ab. Als Referenz für neue mittlere und schwere Ziele dient das 75. Perzentil der militärischen Vergleichsstufen von Imperien, die in den letzten sieben Tagen aktiv waren. Ein einzelner extrem starker Spieler bestimmt deshalb nicht automatisch sämtliche neuen Ziele. Vorhandene Horste werden bei dieser Prüfung weder geheilt noch umgestuft.

## Raids im Detail

- **Ein Raid je Commander**, ohne weltweiten Zwei-Raid-Deckel.
- Eine neue Begegnung ist frühestens **sechs Stunden nach Erzeugung des letzten Raids** möglich.
- Die automatische Auswahl berücksichtigt Imperien mit Aktivität innerhalb der letzten 15 Minuten. Eine Rückkehr ins Spiel wird durch den Statusabruf wieder als Aktivität registriert.
- Ziel ist ein persönlicher Planet, keine Allianzstation. Planeten mit bekanntem Gründungszeitpunkt haben drei Stunden Schutz. Historische Datensätze ohne Gründungszeitpunkt gelten als bestehende Welten.
- Anflug: fünf bis knapp acht Minuten.
- Verteidigung kann bereits vorher freigegeben werden. Lokale Verteidigung startet dann sofort; entfernte Verstärkung bestimmt den gemeinsamen Kampfbeginn.
- Ohne Freigabe endet die Begegnung **zwei Stunden nach der angekündigten Ankunft**. Die Piraten ziehen ohne Kampf, Verlust oder Belohnung ab. Ein Funkbericht erklärt den Abzug.
- Eine bereits freigegebene Verteidigung wird nicht durch diesen Ablauf abgebrochen. Sie wird bei Ankunft der Verstärkung abgewickelt, auch wenn der Spieler inzwischen offline ist.
- Ausgewählte entfernte Schiffe kämpfen direkt im Zielorbit und kehren anschließend zu ihrem Ursprung zurück. Sie werden nicht vorher in den Zielhangar gedrückt.

Die Raidflotte verwendet als Vergleich die stationierten persönlichen Schiffe, die lokalen Verteidigungsanlagen und die Schild-/Zitadellenplattform. Allianzschiffe erhöhen diese persönliche Vergleichsflotte nicht. Schiffe unterwegs und die Reserve werden nicht mitgerechnet. Forschung wird nicht einfach auf die Piraten kopiert; eigene Forschung bleibt ein Vorteil. Das ist eine Schwierigkeitsanpassung, keine Garantie für einen Sieg.

Die Stufe wird aus der erzeugten Raidflotte bestimmt und zusammen mit dieser gespeichert. Ein späterer Ausbau oder Flottenwechsel erhöht die Belohnungsstufe eines bereits bestehenden Raids nicht nachträglich.

Bei einer verlorenen freigegebenen Verteidigung gelten die tatsächlichen Kampfverluste; zusätzlich gehen 18 Prozent jeder lokalen Ressource verloren. Bei erfolgreicher Abwehr werden die Belohnungen unmittelbar am angegriffenen Planeten gutgeschrieben. Beides erhält einen Kampfbericht. Überschüssige Belohnungsschiffe landen in der lokalen Reserve.

## Beute, Relikte und Saison

„Prisen“ ist ein korrektes Wort aus der Seefahrt: erbeutete Schiffe beziehungsweise Fracht. Es bedeutet nicht „Preise“. In den zentralen Spielertexten steht jetzt **Beute**; bestehende Aufgabentitel wie „Prisenrecht“ bleiben als Name erhalten.

Ressourcen und XP verwenden eine begrenzte stufenabhängige Skalierung. Der frühere exponentielle Beutefaktor wurde ersetzt durch:

`Modusfaktor × (1 + 0,12 × (Stufe−1))`

Modusfaktoren: Horst 1,45; normale Besatzung 1,2; Raidabwehr 1. Weitere Grundbeträge hängen von der Stufe und dem Beutefund ab. Das bedeutet kein identisches Paket bei jedem Sieg. Diamanten, Schiffspakete und einzelne Nebenressourcen haben eigene Mengenregeln und steigen nicht bei jeder Stufe.

Die Hauptfunde verteilen sich wie folgt:

| Fund | Wahrscheinlichkeit |
|---|---:|
| Ressourcenfracht | 22 % |
| Geborgene Jäger | 18 % |
| Frachter mit Fracht | 12 % |
| Eskortschiffe | 10 % |
| Verteidigungsanlagen | 10 % |
| Kristalldaten und zusätzliche XP | 10 % |
| Diamantenfund | 8 % |
| Schweres Schiffspaket | 6 % bei Besatzung/Horst; bei Raid stattdessen Daten |
| Weitere Wrackdaten | 4 %, bei Raid zusammen 10 % |

Dazu kommt bei passender Verfügbarkeit eine separate Chance von acht Prozent auf ein noch fehlendes Relikt. Ein besiegter Anführer kann zusätzlich dem führenden Angreifer ein noch unbesessenes Relikt gewähren. Bereits vollständige Sammlungen erhalten dadurch kein neues identisches Relikt. Der frühere irreführende Fundtitel „Relikt im Wrack“ ohne tatsächliches Relikt heißt jetzt „Daten aus dem Wrack“.

Bei Angriffen kehren Ressourcen mit den Flotten zurück; im gemeinsamen Angriff werden sie nach Frachtkapazitätsanteilen verteilt. Geborgene Schiffe begleiten eine der zurückkehrenden Flotten; geborgene Verteidigungsanlagen werden am Startplaneten des führenden Angriffs gutgeschrieben. Das bestehende Transportsystem wurde nicht erweitert.

Echte Siege zählen weiterhin für Tages-/Wochenaufgaben, Fortschritt und die Sektorsaison. Leere Ziele erzeugen einen Flottenbericht anstelle eines erfolgreichen Kampfberichts und geben deshalb keine zusätzlichen Saison-Siege. Schadlos abgezogene Raids geben ebenfalls keine Punkte.

Die Sektorsaison bleibt eine persönliche 14-Tage-Aktivitätswertung: 24 Punkte je Sieg, 12 je Expedition, 120 je aktuell gehaltener persönlicher Kolonie aus dieser Saison und ein Punkt je 250 Boss-Schaden. Ihre drei Ressourcenmeilensteine liegen weiterhin bei 100/300/700 Punkten. Sie ist keine territoriale Kontrolle durch Piraten. Eine spätere Überarbeitung sollte insbesondere den wachsenden Boss-Schaden normalisieren, damit fortgeschrittene Allianzen die Schwellen nicht immer schneller erreichen; das wurde in diesem Piratenumbau nicht als versteckte Änderung am Bosskampf umgesetzt.

## Umstellung und langfristiger Betrieb

Die neue Tabelle `npc_sites` speichert je System Rolle, Stufe, Sollflotte, Überlebende, letzten Schadenszeitpunkt, Befreiungszeitpunkt und Siege. Sie wächst mit den Systemen, nicht mit jedem Timer-Tick. Raid-Ablauf und Stufe liegen am Raid selbst.

Vorhandene aktive NPC-Wachen werden übernommen. Bei früher befreiten Systemen wird anhand vorhandener erfolgreicher NPC-Kampfberichte ein Standort rekonstruiert. Diese Standorte erhalten bei der ersten Umstellung ein neues 72-Stunden-Fenster, statt sofort wieder besetzt zu werden. Ohne einen noch vorhandenen passenden Bericht lässt sich eine alte Befreiung nicht zuverlässig rekonstruieren. Normale freie Systeme werden deshalb nicht pauschal als ehemalige NPC-Ziele behandelt.

Alte nicht freigegebene Raids mit längst überschrittener Ankunft werden nach denselben Ablaufregeln schadlos beendet. Bereits freigegebene Verstärkungen bleiben Teil ihres Kampfes. Datenbankneustarts setzen gespeicherte Schutz- und Wiederaufbauzeiten nicht zurück.

Zeitabhängige Zustände werden weiter bei Serveranfragen abgearbeitet, typischerweise mit maximal etwa 90 Sekunden Abstand für die Weltpflege. Es ist kein zusätzlicher dauerhaft laufender Hintergrundprozess erforderlich. Nach einer Pause wird der anhand der Zeitstempel erreichte Zustand berechnet; es werden nicht Millionen ausgefallener Sekunden nachgespielt. Ohne Anfragen wird die Datenbank erst beim nächsten Zugriff aktualisiert. Bei vollständig geschlossener App wird deshalb keine sekundengenaue Hintergrundmeldung zugesichert.

Die Obergrenzen, dauerhaften Anfängerziele, Kolonisationsfenster und begrenzten Beutefaktoren machen die Mechanik für eine lange Laufzeit belastbarer. Sie sind keine Garantie, dass zwei Jahre ohne neue Inhalte abwechslungsreich genug bleiben. Sinnvolle spätere Ergänzungen wären wechselnde sichtbare Schiffsschwerpunkte einzelner Horste und saisonale PvE-Aufgaben. Neue Pflicht-PvP-Regeln sind dafür nicht nötig.

## Prüfung

- `npm.cmd test`: **67 Tests bestanden**, darunter sieben neue Tests zum Piratenlebenszyklus.
- Zeitreisen über 730 Tage, wiederholte Befreiungen bis Stufe 99, Anfängergrenzen, fehlender Offline-Angriffsstau und Datenbankneustarts geprüft.
- Gesicherte Kolonisationsanflüge, Schutz durch Kolonien, Wiederaufbaupausen und Erholung nach Teilverlusten geprüft.
- Gleiche Wache in Vorschau und echtem Bericht, keine wiederholten Belohnungen auf leeren Zielen, gespeicherte Raid-Belohnungsstufe geprüft.
- `npm.cmd run check`: JavaScript-Prüfungen bestanden.
- `node scripts/verify-colony.mjs --qa-regressions-only`: isolierter Handy-Browsertest bestanden. Automatischer Raid-Abzug, unveränderte Schiffsbestände, stabiler erster Tap, Verteidigung samt Verstärkung, Bericht und Banner-Abbau geprüft. Ebenso die bisherigen Kolonisations-, Menü-, Werft-, Einsatz-, Orbit- und Allianz-Regressionen.

Der Browsertest verwendet eine separate Testdatenbank. Es wurden weder aktive Spielstände gelöscht noch diese Änderungen automatisch veröffentlicht. Die Hilfe enthält den neuen Abschnitt „Piraten & Wiederaufbau“; das Systemfenster zeigt Befreiungs- und Wiederaufbautermine. PWA-Versionen wurden angehoben, damit die aktualisierte Oberfläche nach Veröffentlichung geladen wird.
