# Finale Grafikspezifikationen

Werkzeug: eingebautes `image_gen.imagegen`. Referenzbild: das im Gespräch
generierte NEMESIS-Konzept, lokaler Ursprung `exec-d77d8fe5-345f-4d59-b8c7-6c22f1a302b1.png`.
Der Torso diente anschließend als Referenz für Bein, Waffe und Panzerung.
Die Dateien wurden unverändert als PNG in `assets/` übernommen.

## body.png

Generate a production transparent PNG game sprite, only the CENTRAL TORSO AND
HEAD of this exact menacing graphite alien mechanical siege titan, in the same
elevated front three-quarter perspective, with beautiful elaborate graphite
armor, bevels, silver worn edges, pistons, nuanced metallic light. Absolutely no
legs, arms, shoulder weapons or appendages: these will be separate sprites
animated at runtime. A compact floating torso with angular predatory head toward
lower-left front and upper back armor. Attachments end at round mechanical
sockets on both sides. On viewer right shoulder include a round recessed exposed
orange reactor with visible inner mechanical components; a second small recessed
reactor at viewer left shoulder. These must be distinct identifiable exposed
target points. Neutral unhurt idle pose. Body occupies 85 percent of image, fully
visible with plenty of transparent margin. Detailed authored premium modern
mobile 3D game render matching reference quality. Transparent background and
clean alpha edges. No floor, no background, no cast floor shadow, no labels, no
UI, no impact or loose fragments, no glow bleeding to background. Single centered
sprite. Target square high resolution.

## ship.png

Generate a single transparent PNG game sprite of the exact compact blue-and-ivory
heavy hover assault craft in the reference, viewed from above and BEHIND at
45 degree elevation looking forward, nose pointing toward TOP of image.
Symmetric neutral straight orientation (runtime will bank). Swept compact wings,
two long railguns pointing toward top, detailed graphite mechanical internals,
ivory ceramic panels, blue armor accents, visible three circular cyan exhaust
nozzles at rear but NO LONG EXHAUST PLUMES (runtime will animate them). Same
premium mobile 3D game material detail and cool key lighting as reference. Full
craft entirely inside image with 10% transparent margin; only one ship, no floor,
no background, no shadow, no labels no text no UI. Transparent background.
High-resolution square sprite.

## arena.png

Generate ONLY the empty orbital industrial battle arena environment from
reference, with NO titan, NO creatures, NO spacecraft, NO shots, NO UI, NO text,
NO target indicators and NO warning floor markings. Beautiful premium mobile
science-fiction environment illustration suitable for 2.5D game backdrop,
portrait 2:3. Elevated third-person camera looking across a huge flat dark
titanium landing deck into distance, perspective vanishing point around
horizontal center and 38 percent down image. Bottom 62 percent is spacious
detailed textured metallic deck with worn interlocking panels, small orange edge
guide lamps and diffuse reflections. Keep central middle and bottom deck empty
for moving boss and player sprites, no obstacles in play area. Top third shows
massive curved blue planet atmosphere behind distant weathered orbital towers on
left and right edges. Cool cinematic blue light across entire deck, restrained
warm orange industrial lights, atmospheric depth, tasteful detailed authored
3D-render appearance matching reference. Strong depth but readable midtones;
avoid pitch black or heavy smoke. No central focal subject. This will be a
stationary background layer, runtime effects and characters are separate.

## arm.png (zweite Demo-Fassung)

Referenz: `assets/body.png`. Werkzeug: eingebautes Imagegen-Tool.

Use case: game sprite. Generate ONE isolated articulated ROBOT ARM for this
exact graphite mechanical boss, matching its premium realistic rendered metal
material, fine silver worn bevels, orange small lights, machined hydraulic joints
and cool rim lighting. Absolutely one ARM with a clearly recognizable broad
closed mechanical FIST with four plated knuckles and a thumb, NOT a walking leg,
NO claw toes or foot. The shoulder ball joint is at upper RIGHT, upper arm slopes
down-left to elbow, then bulky angular forearm hangs downward ending in a
clenched fist at lower LEFT. Slightly bent elbow, natural powerful humanoid arm
proportions, slender upper arm and substantial but elegant armored forearm. Seen
from elevated front three-quarter game perspective matching reference. Whole arm
fully visible with generous transparent margin. NO torso, NO head, NO legs, NO
second arm, NO floor, NO background, NO shadows around the asset, NO labels or
UI. Output a real RGBA PNG with true transparent alpha background, never a painted
checkerboard. This is one movable component for a two-arm two-leg boss in a game.

## Gemeinsame Vorgabe für leg.png, weapon.png, armor.png

Use case: game sprite. Generate a single isolated object on a genuinely
transparent alpha background. No checkerboard pattern. No ground plane or
shadows. Detailed high quality 3D rendered game sprite. Only one item centered
with generous transparent margins.

### leg.png

ONE complete isolated insectoid walking leg for this mechanical boss. Long
three-jointed armored leg, hip ball at upper right, upper limb sweeping down-left
into angular knee, lower shin curves back down-right then clawed foot pointing
lower left, fully visible, cool graphite armor and machined titanium pistons,
matching reference material and viewing perspective. No body, no other parts.
Sprite extends diagonally from upper right to lower left. True transparent
background.

### weapon.png

ONE detached heavy twin-barrel shoulder weapon for this mechanical boss. Ball
mounting joint at lower right, angular armored machinery housing center, long
twin barrels pointing toward upper left, matching reference detailed graphite
metal, orange tiny indicator strips, cool blue rim light. No body, no other
parts. Full assembly in frame. True transparent background.

### armor.png

ONE curved graphite mechanical shoulder armor plate from this boss, an irregular
shield-shaped beveled multilayer plate designed to cover a reactor; front
three-quarter view, matching reference scratched graphite ceramic, small silver
exposed edges and fine mechanical engravings. No body, no other parts. Full plate
in frame. True transparent background.


## Überarbeitung v3 – Abgleich mit dem ersten Konzept (7. September 2026)

Referenz: `C:/Users/cbrun/.codex/generated_images/01a0763d-567f-7250-9806-74f448564a43/exec-d77d8fe5-345f-4d59-b8c7-6c22f1a302b1.png`.

Befund: Die bisherige Figur war zu aufrecht, ihr Kopf zu lang, die Gliedmaßen
zu dünn und die Haltung zu symmetrisch. Neu sind der kompaktere, nach vorn
gebeugte Rumpf mit sichtbarer Hüfte, breite keilförmige Schienbeine, kräftige
Unterarme mit Fäusten und geschlossene Schulterplatten. Im Canvas werden zwei
Beine und zwei Arme aufgebaut; der hintere Ellbogen ist angewinkelt, der vordere
Arm stützt nach unten. Das hintere Bein steht innen, damit es neben dem großen
Unterarm sichtbar bleibt. Reaktorpositionen werden gemeinsam von Darstellung
und Trefferauswertung verwendet. Die größere Entfernung bleibt erhalten.

Gemeinsamer Prompt-Präfix: "Use case: identity-preserve / game asset extraction. The attached original concept is the visual identity to preserve."

Erstellung mit dem eingebauten Imagegen-Tool; jeweils das ursprüngliche
Konzeptbild als Referenz, anschließend das erzeugte Einzelteil als Referenz
für die Freistellung. Keine nachträgliche manuelle Rasterbearbeitung.

### assets/body-v3.png

Extract and faithfully reconstruct ONLY the CENTRAL BODY, PELVIS and HEAD of THIS EXACT boss from the reference. Preserve this exact robot design, its charcoal graphite material and silhouette. Important comparison: the reference is a hunched forward predatory machine with a relatively SHORT compact pointed angular head projecting toward viewer-left, horizontally spread shoulders, narrow articulated waist, a little visible hanging pelvis, layered angular segmented armor. It is NOT a vertical elongated beetle shell, NOT a giant narrow triangular nose, NOT an egg-shaped upright body. The body leans DOWN AND FORWARD, chest axis slopes lower-left to upper-right, there is a clear distinction between the short predatory helmet/head on the viewer-left front and the slightly wider shallow armored upper back behind it. Preserve the slightly open jagged mechanical mouth, solid shield-like brow and top shoulder plating of the original. The camera perspective MUST match the original front three-quarter view, looking slightly downward from the player's side; do not switch to overhead/top-down view. Remove all arms and legs completely, terminate at dark mechanical attachment sockets. Keep the exposed orange circular reactor on viewer RIGHT shoulder, restrained glow with inner metal rings, positioned at about 81% image width and 48% image height. Keep one much smaller secondary shoulder joint port at viewer-left around 22% width,45% height, subtle and dark. Remove all detached debris, sparks, UI and scene. The resulting body should have a wide horizontal silhouette, approximately 1.15 to 1.3 times as wide as tall, with visibly narrow belly and compact head. Preserve reference geometry rather than inventing another robot. Isolated single centered body with 10% transparent margins. Genuine transparent alpha background, absolutely no painted checkerboard, no black/gray ground or shadow. Production game sprite, high quality.

### assets/leg-v3.png

Create ONLY ONE detached walking LEG faithfully matching the large angular BLADE-LIKE leg on VIEWER LEFT of the original boss, not a bird leg and not a thin hydraulic skeleton. Exactly one mechanical hip joint upper RIGHT, a short thick thigh pointing left to the bent knee at upper-left/middle, then a LONG BROAD tapered armored shin going DOWN to a pointed angular foot at lower left. One clear bend at the knee; compact dark hip hinge, black steel upper-leg pistons inside thick panels, a prominent orange small joint bolt at the knee, substantial layered graphite triangular shin armor with tiny silver worn edges. Weight-bearing foot is a broad angular metal wedge, NOT three toes, NOT talons or a claw. Preserve original powerful silhouette with clean flat surfaces, restrained surface wear and deep metallic recesses. Front three-quarter perspective matching original, not top-down. Leg stands wide and crouched: hip high at right, knee farther to left, shin descending nearly vertically. No arms, no hands, no torso, no other parts. Entire single isolated leg visible with 10 percent margins. Real alpha transparent background, no floor, no drop shadow or matte gradients behind object. This is an actual game sprite component to animate.

### assets/arm-v3.png

Create ONLY ONE detached ARM faithfully matching the massive right-side arm of the original boss. Strong short mechanical upper arm, visibly bent elbow, and a LARGE LONG HEAVY angular armored forearm ending in a broad mechanical knuckled hand. Forearm substantially thicker than upper arm and weight-bearing, visually like a powerful armored gauntlet, NOT a skinny hydraulic stick. Match the original graphite layered angular armor, wide overlapping rectangular forearm plates, deep titanium joints and subtle silver edge wear. Original arm posture: shoulder ball joint upper RIGHT, upper arm angles down-left to elbow around midheight, then heavy forearm and hand point nearly down to lower LEFT. There should be only 2 arm segments, one elbow and one wrist. Hand has clearly distinct plated knuckles and thumb, not insect toes. Match exact front three-quarter viewpoint and cool restrained metal lighting of reference. No orange reactor built into forearm, only subtle tiny orange strips. Only one limb, NO shoulder torso, NO extra body part, NO leg. Fully contained with 10% margins on REAL alpha transparent background. No floor, shadow, gray gradient or checkerboard. Preserve original formidable thick forearm silhouette. Single game sprite.

### assets/armor-v3.png

Create ONLY ONE detached shoulder armor panel closely matching the flying graphite armor panel at the top right of this reference. An irregular beveled shield shape of overlapping dark charcoal angular metal plates, subtle machined seams, small silver worn edges, fairly clean dark broad faces. Front three-quarter view. It covers a reactor, so it MUST be opaque armor with absolutely NO circular reactor, NO glowing core, NO eyes, NO rings, no luminous parts. A compact plate about 1.2 times as tall as wide, entirely in frame with generous padding. Single isolated object, true alpha transparency. No floor, backdrop, shadow, checkerboard, text or effects. A faithful armor fragment from this exact original robot, not another robot part.

### Freistellung aller vier Einzelteile

Remove the background from this image and make the background transparent. Keep the mechanical object unchanged. Output a transparent PNG.

### Übernommene RGBA-Ergebnisse

- `body-v3.png`: `exec-25757d18-2d92-4412-894b-bd0d19cac5dd.png`, 1448 × 1086.
- `leg-v3.png`: `exec-dbd9a5f2-6844-428f-95b6-a698625c5787.png`, 1145 × 1374.
- `arm-v3.png`: `exec-01587b8a-0e24-4f57-800d-bd1489dc36da.png`, 1024 × 1536.
- `armor-v3.png`: `exec-44d55b19-1950-405d-9d3d-678011813a06.png`, 1151 × 1367.

Die Quelldateien stammen aus demselben oben genannten Generated-Images-Ordner.
Die Demo lädt ausschließlich die Kopien in `assets/`. Alte Einzelteile bleiben
als Vergleichsstand erhalten, werden aber nicht zusätzlich geladen.
