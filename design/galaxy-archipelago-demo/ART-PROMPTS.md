# Bildquelle und Generierungsanweisung

`assets/galaxy-v1.png`: eigens für die Archipel-Demo mit dem **integrierten Bildwerkzeug** erzeugt, keine CLI/API-Generierung. Unverändert kopierte RGBA-Quelldatei mit transparentem Hintergrund. Quelle: `C:/Users/cbrun/.codex/generated_images/01a0763d-567f-7250-9806-74f448564a43/exec-f7bb7aee-1299-48c0-a048-fd3c053a2957.png`.

Die sechs Farbvarianten entstehen beim Rendern mit Canvas-Filtern. Kleine zentrale Ringe, Kartenmarker, Routen und Sterne werden zur Laufzeit gezeichnet. Keine sechs separat generierten Galaxien.

Die vier `*-colony.jpg`-Vorschauen sind vorhandene Projektgrafiken aus `public/assets/planets/`, in den Demoordner kopiert. Keine externen Bilddienste zur Laufzeit.

Vollständiger Prompt:

Use case: stylized-concept. Production texture asset for a premium interactive space strategy map. Generate ONE entire perfectly round spiral GALAXY, directly face-on orthographic top view. Genuine TRANSPARENT RGBA background outside the galaxy, including gaps through diffuse outer arms. The galaxy occupies 90 percent of square canvas, perfectly centered. Exquisite high-detail astronomical starlight and layered dusty spiral arms, cool silver white and pale icy blue, dark bronze dust lanes. A SMALL perfectly black circular black hole precisely at image center, radius only 3 percent of total galaxy radius, with a restrained warm ivory accretion ring. Outer arms form a complete natural circular silhouette with gentle fade into transparent space. Four organic twisting arms with fine filaments, tens of thousands of tiny stars, dark negative-space lanes, physically inspired beautiful premium game render, not a flat diagram. Brightness moderate, no blown-out center; enough contrast for UI star markers to overlay later. NO background rectangle, no environment beyond the single galaxy, no planets, no routes, no labels, no UI, no text, no prominent large lens flare stars, no other galaxies, no geometric rings. This will be drawn as a map layer at arbitrary scales; the black-hole center must be exactly centered. Generate high resolution square 2048x2048 if possible.

Die tatsächlich gelieferte Bildauflösung kann von der im Prompt gewünschten Größe abweichen. Die angefragte Größe ist keine zugesicherte Tool-Einstellung.
