# Remnants, Piraten und Sektor-Saison: Ist-Zustand und Verbesserungen

Stand: 9. September 2026. Grundlage sind die aktuellen Projektdateien und isolierte Datenbanktests mit `node scripts/audit-pve-season.cjs`. Spielregeln und Live-Spielstände wurden für diese Prüfung nicht verändert. Die unten genannten Bestandszahlen stammen aus der lokal vorhandenen Datenbank; ein identischer Stand auf einem entfernten Server ist damit nicht nachgewiesen. Der konkrete, vom Spieler erwähnte Angriff wurde keinem benannten Kampfbericht zugeordnet.

## Ergebnis zum ausbleibenden Wiederaufbau

Ein vollständig besiegter Remnant-Verband wird aus dem gesamten Sternsystem entfernt. Es gibt weder einen Wiederaufbauauftrag noch einen gespeicherten Rückkehrzeitpunkt für dieses Ziel. Zwei Tage später kann es deshalb weiterhin leer sein.

Neue Remnants werden nur erzeugt, wenn weniger als 18 Systeme das Merkmal `remnant=1` tragen. Dann wird höchstens ein zufälliges, vollständig unbesiedeltes System ohne Hub besetzt. Es muss nicht das zuvor befreite System sein. Piratenhorste tragen ebenfalls `remnant=1` und werden bei dieser Schwelle mitgezählt.

Die lokale Datenbank enthielt bei der Prüfung 648 Systeme, davon 308 mit diesem Merkmal: 289 reine Remnant-Systeme und 19 Piratenhorste. Die Schwelle von 18 ist damit weit unterschritten gegenüber dem tatsächlichen Weltumfang; es findet derzeit kein solcher Remnant-Nachschub statt. Schon die 19 Piratenhorste allein verhindern ihn.

Der reproduzierte Test besiegt eine Wache, verschiebt die Testzeit um 48 Stunden und führt einen Welt-Tick aus. Das Ziel bleibt ohne Wache.

## Remnants heute

- Eine gemeinsame Wache pro Sternsystem, keine eigenständige Flotte pro Planet. Ein Angriff auf Planet I kann also auch Planet II bis V freigeben.
- Bei der Galaxieerzeugung werden feste Flottenpakete nach Entfernungsring verteilt. Einige innere Ringe sind schwächer; die äußeren Gebiete enthalten große Schiffe bis hin zu Dreadnoughts.
- Keine eigene Wirtschaft, Schiffswerft, Forschung oder zeitabhängige Flottenproduktion.
- Nach einem verlorenen Spielerangriff bleiben die berechneten Verteidigerüberlebenden gespeichert. Reine Remnant-Wachen werden nicht regelmäßig aufgefüllt.
- Nach einem gewonnenen Spielerangriff wird die Wache vollständig entfernt. Das System wird grundsätzlich koloniserbar, sofern die anderen Voraussetzungen erfüllt sind.
- Der seltene Ersatzspawn verwendet nur die Flottenpakete der Ringe 2 oder 3. Er bildet nicht die ursprüngliche Stärke eines besiegten äußeren Systems nach.
- Bis zu vier benannte Warlords werden zufällig auf bewachte Systeme gesetzt. Sie ergänzen die Verteidigung um zwei Kreuzer, acht Jäger und zwei Fregatten. Ein Sieg kann ein noch nicht besessenes Relikt vergeben. Warlords können auch Piratenhorste treffen.

Die nachvollziehbare Aufgabe der Remnants ist damit: Erkundungsziele und militärische Hindernisse vor der Expansion. Ein regelmäßiger Farmplatz am selben Ort ist derzeit nicht implementiert.

Quellen: `src/galaxy.js` (`remnantFleetForRing`, `placeRingSystems`), `src/game.js` (`resolveAcsAttack`, `resolveColonize`, `tickGalaxy`).

## Piraten heute

### Horste auf der Karte

Ein Horst ist technisch ein Remnant-System mit einer zusätzlichen Piratenstufe zwischen 1 und 99. Seine Flotte wird aus dieser Stufe berechnet. Die theoretische Zielkampfkraft beträgt `70 × 1,3^(Stufe−1)`; Schiffstypen ändern sich stufenweise. Rundungen und eine Grenze von 8.000 Schiffen je Typ begrenzen die tatsächlich erzeugten Verbände.

Die Galaxie versucht `min(40, 3 + floor(Spitzenstufe × 0,55))` Piratenhorste zu halten. Die Spitzenstufe wird aus der stärksten berechneten Spielerbedrohung abgeleitet. Neue Horste mischen bewusst schwache und starke Gegner: 42 % niedrige Stufen, weitere 36 % mittlere und 22 % nahe der Spitzenstufe.

Bei jedem Piraten-Wachstumsschritt:

- Jeder bestehende Horst bekommt wieder eine vollständige Garnison. Das ist ein sofortiges Auffüllen, kein sichtbarer Bauprozess.
- Unterhalb der Spitzenstufe besteht normalerweise 10 % Aufstiegschance pro Schritt. Kleine Horste bis Stufe 3 überspringen diesen Teil zu 72 %, bleiben also häufiger schwach.
- Mehr als zwei Stufen oberhalb der aktuellen Spitze kann ein Horst mit 8 % Wahrscheinlichkeit um eine Stufe sinken.
- Ein vollständig besiegter Horst verliert seine Piraten- und Remnant-Markierung. Ersatz entsteht zufällig anderswo; der alte Ort besitzt keinen Respawn-Timer.

Die Schritte laufen höchstens alle 90 Sekunden bei Welt-Ticks. Welt-Ticks werden von Spiel-/API-Anfragen ausgelöst. Ein eigenständiger NPC-Hintergrunddienst oder das Nachholen sämtlicher ausgefallener Wachstumsschritte ist im Projekt nicht vorhanden. Zwei Tage ohne Anfragen erzeugen beim nächsten Besuch nicht automatisch zwei Tage Piratenproduktion.

Die Hilfeaussage „über 1–2 Jahre“ ist keine implementierte Zeitsteuerung. Bei aktiver Welt und höherer Spitzenstufe kann ein Horst viel schneller aufsteigen. Reine Remnants steigen dagegen nicht auf.

### Raids auf Spieler

Raids werden unabhängig von einer konkreten Horstflotte erzeugt. Ein zerstörter Horst schaltet daher keine räumlich zugehörige Raid-Quelle aus.

- 12 % Spawnversuch pro zulässigem Galaxie-Tick.
- Höchstens zwei aktive Raids in der gesamten Welt, höchstens einer pro betroffenem Imperium.
- Sechs Stunden Mindestabstand seit dem letzten Raid eines Imperiums; neue Kolonien haben drei Stunden Schutz, sofern ihr Gründungszeitpunkt gesetzt ist.
- Ursprüngliche Vorwarnzeit: fünf bis knapp acht Minuten.
- Der Kampf wartet im aktuellen Stand auf die ausdrückliche Verteidigungsfreigabe. Verstärkung kann vorher anreisen. Wartende Raids können die beiden globalen Plätze dauerhaft belegen.
- Die Zusammenstellung berücksichtigt stationierte Schiffe, deren höchste Schiffsklasse sowie lokale Batterien und Plattformen. Unterwegs befindliche Schiffe und Hangarreserve gehen in diese Piraten-Machtberechnung nicht ein. Eine tatsächliche Forschungsübernahme der Spieler findet nicht statt.
- Für größere lokale Verteidigungen liegt die angestrebte Gewichtung grundsätzlich zwischen 62 % und 102 % der berechneten lokalen Verteidigungsstärke. Das ist keine garantierte Siegchance, weil Schiffskonter, Forschung und Rundungen anders wirken.
- Gewinnen die Piraten, gehen Kampfverluste und 18 % der lokalen Rohstoffbestände verloren. Eine erfolgreiche Abwehr gibt zufällige Beute und XP; manche Belohnungen enthalten Schiffe, Batterien oder ein Relikt.

Die angezeigte Raid-Stufe wird bei erfolgreicher Abwehr für die Belohnungsberechnung aus dem dann aktuellen Imperium erneut berechnet. Sie ist nicht als unveränderliche Schwierigkeits-/Belohnungsstufe im Raid gespeichert.

Quellen: `src/pirates.js` (`raidLevelFor`, `raidFleetFor`, `grow`, `occupyEmpty`), `src/game.js` (`tickWorld`, `spawnRaid`, `defendRaid`, `resolveRaids`).

## Bestätigte Unstimmigkeiten

### Doppelte Piratengarnison und unvollständige Aufklärung

`occupyEmpty`/`grow` speichern bereits eine vollständige Piratengarnison als Remnant-Flotte. Der Kampf lädt diese Flotte und addiert anschließend nochmals `garrisonFor(pirateLevel)`. Die Kartenauskunft zeigt nur die gespeicherte Flotte; der Spionagebericht lässt diese zusätzlich erzeugte Garnison ebenfalls weg. Die Kampfvorhersage verwendet dagegen dieselbe doppelte Aufstellung wie der tatsächliche Kampf.

Reproduktion bei Stufe 19 ohne Warlord:

| Schiff | Kartengarnison | Tatsächlich im Kampf |
|---|---:|---:|
| Jäger | 36 | 72 |
| Fregatten | 8 | 16 |
| Abfangjäger | 15 | 30 |
| Bomber | 7 | 14 |
| Kreuzer | 7 | 14 |
| Zerstörer | 4 | 8 |
| Gesamt | 77 | 154 |

Nach einem erfolglosen Angriff werden gemeinsame Überlebende gespeichert; der nächste Kampf kann erneut eine vollständige Zusatzgarnison erhalten. Spätestens beim Wachstumsschritt wird die gespeicherte Garnison ohnehin wieder vollständig hergestellt. Das kann gemeinsame Angriffe und die Einschätzung der Gegnerschäden erheblich verfälschen.

### Belohnungen für leere Ziele

Ein weiterer Angriff auf ein bereits befreites, unbesiedeltes Ziel wird als gewonnener Kampf gewertet, obwohl dort keine Gegner mehr stehen. Er erzeugt erneut Grundbeute, Kampf-XP und 24 Saisonpunkte. Das wurde mit einem tatsächlichen Flottenflug in der Testdatenbank reproduziert.

### Zusammenhang von Gegnerstärke und Beute

Piratenhorste verwenden ihre eigene Stufe für die Zusatzbeute. Reine Remnants verwenden dafür jedoch die globale Piratenbedrohung, nicht die tatsächlich besiegte Remnant-Flotte. Deshalb kann dieselbe Wache je nach Weltzustand unterschiedlich lukrativ sein.

Die Zusatzbeute ist zufällig: Rohstoffe, Jäger, Frachter, Eskorten, Batterien, Datenkerne, Diamanten oder andere Kriegsbeute. Eine zusätzliche Reliktchance von 8 % wird separat geprüft, sofern noch ein passendes unbesessenes Relikt existiert. Der Beutetitel „Relikt im Wrack“ garantiert für sich kein Relikt.

### Unklare Begriffe

„Prisen“ ist kein Tippfehler für „Preise“. Eine Prise bezeichnet erbeutete Schiffe oder Ladung; die Mehrzahl lautet Prisen. Für die Oberfläche ist „Sieg bringt Beute“ verständlicher und auch genauer als „Angriff bringt Prisen“, weil die Zusatzbeute einen Sieg voraussetzt.

## Sektor-Saison heute

Die Saison ist eine persönliche, 14-tägige Aktivitätswertung. Sie ist nicht an eroberte Kartenflächen, gehaltene Sektoren oder eine Allianz-Sektorrangliste gekoppelt. Alle Spieler verwenden dieselben Zeitfenster, beginnend mit dem Anker 5. Januar 2026, 00:00 UTC. Zum Prüfdatum läuft S18 vom 31. August bis 14. September 2026, jeweils 00:00 UTC.

| Ereignis | Saisonpunkte |
|---|---:|
| Gewonnener Kampf, einschließlich NPC-Angriff und erfolgreicher Raid-Abwehr | 24 |
| Abgeschlossene Expedition mit Expeditionsbericht | 12 |
| Aktuell besessene persönliche Kolonie, gegründet in dieser Saison | 120 |
| Insgesamt verbuchter Allianz-Bossschaden in der Saison | 1 je volle 250 Schaden |

Bossschaden zählt bereits bei der verbuchten Teilnahme, unabhängig davon, ob der Boss schon besiegt ist. Persönliche Einsätze, normaler Gebäudeausbau, Forschung oder Orbit-Feuer vergeben in dieser Formel keine Saisonpunkte.

| Benötigte Punkte | Metall | Energie | Helium | Titan | Kristalle | Diamanten |
|---|---:|---:|---:|---:|---:|---:|
| 100 | 900 | 600 | 180 | 0 | 250 | 4 |
| 300 | 1.800 | 1.200 | 450 | 180 | 600 | 10 |
| 700 | 3.500 | 2.200 | 900 | 450 | 1.200 | 22 |

Jede Stufe ist einmal separat abholbar; Punkte werden dabei nicht ausgegeben. Alle drei zusammen ergeben 6.200 Metall, 4.000 Energie, 1.530 Helium, 630 Titan, 2.050 Kristalle und 36 Diamanten. Die Auszahlung geht auf den persönlichen Fokusplaneten und ist serverseitig gegen doppelte Abholung in derselben Saison abgesichert. Am Saisonwechsel gibt es keinen nachträglichen Abholweg für verpasste Belohnungen.

Nach 700 Punkten gibt es keine weiteren Meilensteine. Das entspricht allein 30 Kampfsiegen, 59 Expeditionen, sechs Kolonien oder 175.000 verbuchtem Bossschaden. Das sind Rechenbeispiele, keine Aussage, dass jeder Spieler diese Werte gleich schnell erreichen kann.

### Probleme der Saison

- Die Saisonkarte wird in der Handyansicht ausdrücklich per CSS ausgeblendet. Es gibt keinen gleichwertigen mobilen Saisonzugang.
- Die offene Karte aktualisiert den Saisonblock nicht separat, wenn neue Daten oder eine Abholantwort eintreffen. Punktestand und Schaltfläche können bis zum Neuöffnen der Weltansicht veraltet bleiben.
- Punkte werden aus Berichten und derzeitigen Kolonien neu berechnet. Ein echtes, unveränderliches Saison-Ereignisprotokoll fehlt. Die Testlöschung von zwei Kampfberichten senkte den Stand um 48 Punkte. Die normale Berichtspflege schützt Kampf- und Expeditionsberichte derzeit ausdrücklich; dies ist daher ein Architekturproblem, kein nachgewiesenes tägliches Löschen dieser Punkte.
- Leere Ziele zählen als Siege. Gegnerstärke und tatsächlich zerstörte Schiffe spielen für die 24 Punkte keine Rolle.
- Rohschaden am mitwachsenden Boss kann später die Saisonwertung dominieren, während alle Belohnungen feste Mengen behalten.
- Name und Darstellung versprechen eine stärkere Verbindung zu Sektoren, als die Punkteformel tatsächlich besitzt.

Quellen: `src/sectorSeason.js`, `src/allianceBoss.js`, `public/js/app.js` (`galaxy`, `refresh`, `renderView`), `public/css/style.css` (mobile `.map-season`).

## Verbesserungsvorschlag, noch nicht umgesetzt

1. **Zuerst verlässliche Gegnerdaten:** eine einzige gespeicherte Garnison je NPC-Besetzung; Karte, Spionage, Vorhersage und Kampf lesen denselben Zustand. Keine zweite unsichtbare Garnison.
2. **Klare Lebenszyklen:** Zustand „besetzt“, „geschwächt“, „befreit“ sowie ein sichtbarer Termin für Regeneration oder Neubildung. Geschwächte Garnisonen wachsen schrittweise nach; keine vollständige Heilung im 90-Sekunden-Takt.
3. **Remnants als Expansionsgegner:** Befreite Ziele bleiben zum Kolonisieren frei. Neue Invasionen entstehen bevorzugt in anderen unbesiedelten Systemen. Ein separater Zielbestand richtet sich nach Weltgröße und verfügbaren Expansionsräumen, statt Piraten mitzuzählen. Wer wiederholbare Kämpfe am selben Ort möchte, bekommt ausdrücklich als solche gekennzeichnete Gefechts-/Anomalieziele.
4. **Piraten als wiederkehrende Jagdziele:** regionale Horste mit eindeutiger Stufe, sichtbarem Wiederaufbau und begrenztem Wachstum. Beispielwerte zum Balancieren: mehrere Stunden Schutz nach Befreiung, Ersatzhorst nach 6–12 Stunden, höhere Stufen langsamer. Diese Zeiten sind Vorschläge, keine aktuellen Regeln.
5. **Raids verständlich anbinden:** Optional Herkunftshorst anzeigen und dessen Zerstörung mit einer lokalen Raid-Pause belohnen. Die Sicherheit gegen unangekündigte Offlineverluste beibehalten. Wartende Raids dürfen nicht die gesamte Welt blockieren.
6. **Faires Skalieren:** Militärmacht einschließlich unterwegs befindlicher und reservierter Schiffe ermitteln. Gegnerstufe und Beutestufe bei Entstehung einfrieren. Frühspielerbereiche behalten; Unterstützung durch eine Allianz muss einen messbaren Unterschied machen.
7. **Beute an echte Leistung knüpfen:** keine wiederholte Siegerbeute, XP oder Saisonpunkte ohne Gegner. Stärke, Schwierigkeit und Beute derselben Besetzung zusammen definieren; mögliche Belohnungen vor dem Start anzeigen.
8. **Saison auf Handy nutzbar machen:** eigenes erreichbares Panel mit Laufzeit, Punkteschlüsseln, allen Meilensteinen und klaren Abholbuttons. Nur die betroffenen Zahlen und Statuswerte live aktualisieren.
9. **Saisonpunkte dauerhaft buchen:** jedes qualifizierte Ereignis genau einmal verbuchen; Berichte sind dann nur noch die lesbare Dokumentation. Bossbeiträge über abgestufte oder begrenzte Punkte abbilden. Weitere Meilensteine oder ein sinnvoller Abschluss verhindern eine nach wenigen Aktionen erledigte Saison.
10. **Bezeichnung entscheiden:** Für die bestehende Funktion passt „Aktivitätssaison“. Soll es eine Sektor-Saison bleiben, sollten regionale PvE-Aufträge, befreite Systeme und gemeinsame Ziele tatsächlich in die Wertung eingehen. Dafür ist keine Änderung des PvP nötig.

Priorität: doppelte Garnison und Belohnung leerer Ziele beheben, anschließend Wiederaufbau und Rückmeldung klären, dann die mobile Saison und deren Balance verbessern.
