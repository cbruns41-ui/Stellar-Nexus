# NEMESIS – Allianz-Bosskampf und separate Grafikdemo

Im Spiel: **Kommando → Allianz → NEMESIS-Kampf öffnen**. Der eingebettete
Kampf verwendet dieselben Grafiken wie die Demo und wird über `?alliance=ID`
mit dem angemeldeten Commander verbunden. Das Öffnen der Vorschau verbraucht
keine Freigabe; erst **Angriff starten** reserviert sie auf dem Server.

## Regeln im Spiel

- Zwei Starts pro Commander und UTC-Tag, unabhängig von Bossstufe oder Allianz.
  Auch Abbruch, Neuladen und ein Sieg setzen das Tageslimit nicht zurück.
- Neue Allianzen beginnen bei Stufe 1. Laufende Bossstände werden übernommen;
  ein Wochenwechsel setzt weder HP noch Stufe zurück.
- Jeder bestätigte Angriff reduziert die gemeinsame Hülle und Panzerung.
  Bei gleichzeitigem Abschluss werden Beiträge addiert; ein bereits besiegter
  Gegner kann keine zweite Belohnung auslösen oder Schaden an Stufe 2 übertragen.
- Beim Sieg erhalten alle zu diesem Zeitpunkt zur Allianz gehörenden Mitglieder
  automatisch das beim Start angezeigte Ressourcenpaket auf ihren Heimatplaneten.
  Funk → Nachrichten enthält den Lieferbeleg, ohne Abholbutton. Vor dem Sieg
  gibt es keine Ressourcen. Lagerüberlauf wird beim nächsten Tick nicht gelöscht.
- Die nächste Stufe erscheint sofort, mit mindestens 70 % mehr HP und mindestens
  25 % mehr Belohnung je Ressource. Die alte Grenze von 25 Millionen HP entfällt.
- Ein Angriff dauert 40 Sekunden; eine Freigabe kann maximal 30 Minuten offen
  bleiben. Bei einem Speicherfehler lässt sich derselbe Abschluss wiederholen.
  Ein noch offener Verlauf wird pro Commander in der Tab-Sitzung gesichert und
  nach Neuladen zum Abschluss angeboten. Ein verlorener Tab kann dadurch nicht
  rückwirkend eine neue tägliche Freigabe erzeugen.

## Skalierung und Serverwertung

Flottenmacht zählt Angriffswerte stationierter Schiffe, Reserven und fliegender
Flotten; Allianzplaneten zählen nicht doppelt als private Flotte. Boss-HP,
Allianz-Macht und Mitgliederzahl werden pro Stufe festgehalten. Rekrutierung
oder Schiffsbewegungen heilen so keinen verwundeten Boss. Der Spielerschaden
und sein Schild verwenden seine Flottenmacht beim Start und die Werte der Stufe.

Stufe 1 hat mindestens 100.000 HP, ansonsten `Flottenmacht × 24 + Mitglieder ×
12.000`. Folgestufen verwenden das Maximum aus der aktuellen Allianz-Skalierung
mit Faktor `1,7^(Stufe−1)` und `vorherige HP × 1,7`, aufgerundet. Werte oberhalb
des sicheren JavaScript-Ganzzahlbereichs werden abgelehnt statt still gekappt.

Das Grundpaket pro Mitglied beträgt 3.600 Metall, 2.400 Energie, 1.400 Kristall,
1.000 Helium, 500 Titan und 20 Diamanten. Ein Machtfaktor erhöht das Paket bereits
auf Stufe 1; jede weitere Stufe erhöht jede Ressource um mindestens 25 %.
Die Anzeige und die tatsächliche Gutschrift verwenden dieselbe Serverfunktion.

`src/allianceBoss.js` reserviert Starts und wertet Eingabeverläufe mit derselben
deterministischen Simulation wie der Browser aus. Der Server akzeptiert keine
eingereichte Schadenszahl. Schussfolge, Bewegung, Ziele, Ausweichen und Spielzeit
werden nachgerechnet; die Simulation läuft ohne Zufall. Wie bei jedem vom Client
gelieferten Eingabeverlauf verhindert dies keine automatisierte perfekte Eingabe.
Sieg, Ressourcen, Belege und Stufenwechsel erfolgen in einer Datenbanktransaktion.
Wiederholte Abschlüsse derselben Session liefern dasselbe Ergebnis ohne neue
Gutschrift. Der alte Score-Endpunkt liefert HTTP 410.

## Separate Demo

Start: `node scripts/serve-nemesis-demo.mjs`, dann
http://localhost:3110/demos/nemesis/ öffnen. Der normale Nexus-Server kann die
Demo ebenfalls unter `/demos/nemesis/` ausliefern.

Die Demo verwendet Canvas 2D mit einer gegliederten 2,5D-Figur: genau zwei Beine
mit Kniebewegungen, zwei Arme mit Fäusten und Ellbogenbewegungen, ein beweglicher,
schlankerer Rumpf, zwei abtrennbare
Panzerteile und animierte Reaktoreffekte. Grafiken wurden mit dem eingebauten
Imagegen-Tool erstellt. Unity-WebGL-Dateien der Basis bleiben unverändert.
Ohne `?alliance=ID` ruft die separate Demo keine API auf und vergibt keine
Spielbelohnungen. Nur dieser separate Modus erlaubt unbegrenzte Testangriffe.

Die Darstellung kommt dem Konzeptbild durch dessen Materialstil und passende
Einzelgrafiken näher. Sie ist keine vollständige 3D-Rekonstruktion: Perspektive
und Beleuchtung der Grafikteile sind vorgegeben; freie Kamerafahrten sind damit
nicht möglich. Die Arena ist ein Hintergrundbild mit leichter Parallaxe.

## Bedienung

- Maus bewegen / oberen Bildbereich berühren: zielen.
- Maustaste, Leertaste oder Feuerknopf halten: feuern.
- Stick, A/D oder Pfeiltasten: seitlich bewegen.
- Ausweichknopf oder Umschalttaste: schneller Ausweichstoß mit Abklingzeit.
- Pause oder Escape: Kampf anhalten. Ein Tabwechsel pausiert automatisch.
- Ton ist zunächst aus und lässt sich oben einschalten.

Schulterpanzerung hält zwölf gezielte Treffer aus. Danach verursacht der
freigelegte Reaktor mehr Schaden. Treffer erzeugen Risse, bleibende Einschläge,
Rückbewegung, Funken, herausfliegende Teile und Rauch. Der Boss kündigt drei
Angriffsarten mit einer Gefahrenzone an. Verlassen der Zone oder rechtzeitiges
Ausweichen verhindert Schaden. Ein Versuch dauert höchstens 40 Sekunden.

Der Boss steht weiter hinten (Darstellungsmaßstab 0,70). Der Oberkörper ist
zusätzlich auf 76 % seiner bisherigen Breite verschlankt. Trefferzonen verwenden
dieselben Skalierungen, Drehungen und Bildschirmproportionen wie die Darstellung;
die alte große Trefferfläche bleibt nicht unsichtbar bestehen. Bewegungstempo
und seitliche Bewegungsstrecke wurden erhöht. Angriffe haben nur noch 0,7–1,0
Sekunden Vorwarnung und verursachen 30–44 Schaden bei 100 Spielerschildpunkten.

## Fortlaufender Allianz-Test

Der Testboss hat 100.000 Hüllenpunkte. Jeder Angriff startet mit einem frischen
Spielerschiff, während Boss-Hülle und beschädigte Panzerung erhalten bleiben.
Bei Zeitablauf endet der eigene Angriff, nicht die gesamte Begegnung. Nach einem
Abschuss zählt der bereits verursachte Schaden weiter. Selbst perfektes Feuer
ohne eingehenden Schaden benötigt in der Simulation mehrere vollständige Angriffe.

Dieser Ablauf simuliert nacheinander angreifende Allianzpiloten nur lokal.
`localStorage` speichert Hülle, Panzerung und Angriffsnummer unter
`nemesis-demo-alliance-v2`; auch Neuladen heilt den Boss nicht. Es gibt keine
Synchronisation zwischen Mitgliedern, Geräten oder Browsern in diesem Testmodus. Der
Pausenknopf bietet ausdrücklich „Testboss zurücksetzen“ für einen neuen Test.

## Prüfung

`npm test` enthält echte Datenbank- und HTTP-Tests in `test/alliance-boss.test.js`:
Tageswechsel, Allianzwechsel, Abbruch, serverseitige Wiedergabe, doppelte und
gleichzeitige Abschlüsse, automatische Auszahlung samt Beleg, Lagerüberlauf,
sofortige Folgestufe, Skalierung über die alte HP-Grenze und ungültige Eingaben.

`node scripts/verify-nemesis-demo.mjs --live` startet die vollständige App mit
separater Testdatenbank und Chrome. Es prüft den angemeldeten Weg aus der Allianz,
Belohnungsvorschau, echten Maus-/Touchkampf, Serverwertung, Sieg, Belohnung eines
nicht kämpfenden Mitglieds, Nachrichtenbeleg, Tageslimit und Rückkehr zur Allianz.
Screenshots und Ergebnis: `tmp/nemesis-live-review/`.

`node --test test/nemesis-demo.test.mjs` prüft Fehlschüsse, Panzerungszustände,
Schadensunterschiede, einmalige Angriffsauswirkungen, Bewegung/Ausweichen,
Abklingzeiten, genaue verkleinerte Trefferzonen, Schadenserhalt zwischen Angriffen,
stärkere Gegenschläge und einen vollständigen Sieg über viele Angriffe.

`node scripts/verify-nemesis-demo.mjs` startet einen eigenen statischen Server
ohne Datenbank und Chrome. Der Test bedient echte Maus-, Tastatur- und
Mehrfinger-Touchereignisse. Er prüft Bewegung, Fehlschüsse, Panzerungsbruch,
Reaktortreffer, Pause, Spielerabschuss, Angriffswechsel, gespeicherte Wunden nach
Neuladen und das ausdrückliche Zurücksetzen des Testbosses; dazu die
Bedienelemente bei 390×844, 360×640 und 844×390. Screenshots und Ergebnis liegen
unter `tmp/nemesis-review/`. Der Test schließt seinen eigenen Browser/Server.

Die Demo lädt sechs PNGs. Downloadzeit, Speicherverbrauch,
Bildrate und Akkubelastung auf echten Mobilgeräten sind noch nicht vermessen.
Die Browserprüfung emuliert Bildschirmgrößen und Touchereignisse, keine reale
Handy-GPU. Eine feste mobile Bildrate wird nicht zugesichert.

## Grafikherkunft

Die produktiv genutzten Grafiken liegen vollständig in `assets/`:
`arena.png`, `body-v3.png`, `leg-v3.png`, `arm-v3.png`, `armor-v3.png`, `ship.png`.
Die v3-Überarbeitung orientiert Kopf, Rumpf, breite Schienbeinpanzer und Fäuste
erneut am ersten Konzept. Der hintere Arm ist angewinkelt; der vordere Arm
stützt nach unten. Das hintere Bein bleibt neben dem Unterarm sichtbar.
Die neuen Schulterplatten verdecken die Reaktoren bis zum Panzerungsbruch.
Die früheren Einzelgrafiken bleiben als Vergleichsstand erhalten und werden
nicht zusätzlich geladen. Trefferzonen liegen auf den neuen Reaktorpositionen.
`weapon.png` aus der ersten Demo bleibt als wiederverwendbare Grafik für ein
anderes Geschütz verfügbar, wird von diesem Boss aber nicht mehr geladen.
Generierung: eingebautes Imagegen-Tool, 7. September 2026. Stilreferenz war das
in der Unterhaltung erzeugte NEMESIS-Konzeptbild. Die verworfenen Atlasversuche
sind nicht Teil der Demo. Die endgültigen Prompt-Spezifikationen stehen in
`art-prompts.md`.
