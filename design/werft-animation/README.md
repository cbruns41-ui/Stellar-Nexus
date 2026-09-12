# Werft – separate Animationsvorschau

Diese Vorschau ist vollständig vom Spiel getrennt. Es wurden keine Dateien in `public/`, keine Unity-Szene, keine Spielstände und keine Serverfunktionen geändert.

## Öffnen

`index.html` im Browser öffnen. Alternativ im Projektordner starten:

```powershell
node design/werft-animation/serve.mjs
```

Anschließend http://localhost:3120/ öffnen. Der Vorschau-Server bindet ausschließlich an den eigenen Rechner.

## Bedienung

- **Pause / Animation:** automatisches Öffnen und Schließen anhalten bzw. starten.
- **Tor öffnen / schließen:** einen einzelnen Vorgang abspielen.
- **Toröffnung:** einen Zwischenstand direkt einstellen.
- **Original ansehen:** mit der bisherigen Basisgrafik vergleichen.
- **Nahaufnahme / Gesamte Basis:** zwischen Detail und bestehender Gesamtansicht wechseln.

Die Animation verwendet eine bearbeitete Torfläche, die hinter dem ursprünglichen Rahmen verschoben wird. Das geparkte Schiff wird aus dem Original im Vordergrund erhalten. Während der Bewegung werden vorhandene Leuchten dezent aufgehellt. Es ist keine Videoanimation und noch keine Animation der gesamten Basis.

## Grafiken und Bildbearbeitung

Erstellt mit dem eingebauten **image_gen**-Werkzeug. Ausgangspunkt war `public/assets/colony/colony-approved.png` (1672 × 941 Pixel).

- `basis-original.png`: unveränderte Kopie der Spielgrafik.
- `tor-geschlossen.png`: erste Bildbearbeitung mit geschlossenem Tor; Referenz für den zweiten Schritt.
- `tor-hintergrund.png`: ergänzte Torfläche hinter dem geparkten Schiff; diese Textur nutzt die Animation ausschließlich innerhalb der Toröffnung.
- [Erster vollständiger Bild-Prompt](bild-prompt.txt).
- [Vollständiger Prompt für die verdeckte Torfläche](bild-prompt-hintergrund.txt).

Die vergrößerte Ansicht zeigt die Auflösungsgrenze der vorhandenen Basisgrafik. Eine höher aufgelöste Neuzeichnung war nicht Teil dieser Probe.

## Prüfung

```powershell
node design/werft-animation/verify.mjs
```

Geprüft: Bilder laden, Zwischenstände der Torbewegung, Pause, Vergleich mit Original, Gesamtansicht, Touch-Bedienung bei 390 × 844 Pixeln, keine horizontale Überbreite und keine Zugriffe auf Spiel-APIs. Bei vollständig geöffnetem, angehaltenem Tor ist das Canvas pixelgleich mit der Originalansicht. Keine Browserfehler.

Ergebnis: [review/verification.json](review/verification.json). Vorschaubilder liegen in `review/`.
