# Grafikquellen – Orbit-Feuer Demo 7

## Erdoberfläche

NASA Earth Observatory, **Blue Marble: Next Generation**, globale Basiskarte Juli 2004, 5400 × 2700 Pixel.

- Übersicht: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/
- Unveränderte Quelldatei: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg
- Nutzungshinweise: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Lokale Datei: `assets/earth-blue-marble-july.jpg`

Die Karte wird auf eine rotierende Kugel projiziert. Beleuchtung und Atmosphäre sind Effekte der Demo. Die Spielszene ist eine fiktive Darstellung; NASA unterstützt oder prüft dieses Spiel nicht.

## Wolken

NASA Goddard Space Flight Center, Reto Stöckli, **Blue Marble: Clouds**, 2002. Die unveränderte Graustufenkarte wird als wandernde Wolken- und Schattenmaske verwendet.

- Datensatz: https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/77558l
- Quelldatei: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- Lokale Datei: `assets/earth-clouds.jpg`
- Nutzungshinweise wie oben. Der frühere Visible-Earth-Datensatz wird inzwischen teilweise umgeleitet; die direkte Bilddatei war beim Abruf erreichbar.

## Schiffe, Geschütze und Weltraum

- `assets/fighter-v3-key.png`: für diese Demo mit dem integrierten Bildwerkzeug erzeugter Jäger, ausgerichtet nach `reference.png`. Der grüne Produktionshintergrund wird beim Zeichnen im Shader ausgeblendet. Die Generierungsanweisungen stehen in `ART-PROMPTS.md`.
- `assets/turret-laser-v7.png`, `turret-flak-v7.png`, `turret-silo-v7.png`, `turret-gauss-v7.png`, `turret-tesla-v7.png`, `turret-mine-v7.png`: einzeln mit dem integrierten Bildwerkzeug erzeugte RGBA-Grafiken. Die vom Nutzer bestätigte offene dunkelblaue Lasergrafik dient als Stilreferenz. Quelldateien unverändert kopiert; Transparenz bleibt erhalten. Herkunft und Bildanweisungen: `TURRET-V7-PROMPTS.md`.
- Fregatte: vorhandene freigestellte Stellar-Nexus-Projektgrafik aus `public/assets/orbit-siege/`, unverändert in den Demoordner kopiert. Die alten Turmbilder bleiben zum Vergleich erhalten, werden in der aktuellen Demo jedoch nicht geladen.
- `assets/deep-space.png`: vorhandener Projektnebel aus `public/assets/map/starfield-nebula-v1.png`.
- Triebwerksflammen, Geschossleuchten, Explosionen, Asteroiden, Raketen-Abgasschleier und Aufwertungseffekte: zur Laufzeit berechnete Grafik.
- `reference.png`: früher erzeugtes Konzeptbild; wird nicht als fertiges Spielfeld oder Video verwendet.

## Bibliothek

Three.js 0.180.0, MIT-Lizenz. Lizenztext: `vendor/LICENSE`. Sämtliche Bibliotheksdateien und Grafiken werden lokal ausgeliefert.
