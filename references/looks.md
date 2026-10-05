# Choosing a look

A glyph landing page is one subject, re-drawn as a mosaic of glyphs by a shader, on a backdrop that carries the mood,
with a title that inverts whatever is behind it and line work that makes the page feel instrumented. Every page makes
seven choices. **Derive each one from the subject and the user's words** — and when a project has several pages, make
each page differ on at least five of the seven so the set reads as a range, not a template.

| # | Choice | What it is | Where it lives |
|---|---|---|---|
| 1 | **Theme & palette** | light / dark / mid-tone; ~6 tokens | `:root` in the page |
| 2 | **Background effect** | the animated field the subject sits in | `field()` in the shader |
| 3 | **Glyph renderer** | how a cell turns into a mark | `scene()` in the shader |
| 4 | **Type** | display face for the title, body face, label mono | Google Fonts `<link>` + tokens |
| 5 | **Title treatment** | the split word and how it's inked | `.word` + `main()` |
| 6 | **Line work** | dense diagram language around the subject | `.art` SVG / DOM + `onFrame` |
| 7 | **Finish** | fringing, grain, scanlines, bloom, vignette | `main()` |

## The five reference pages (assets/examples/pages)

| | Weightless (astronaut) | Unfold (poppy) | Hello, world (1984 Mac) | Updraft (cloud) | Biolume (jellyfish) |
|---|---|---|---|---|---|
| Theme | deep night, saturated twilight | light, cotton paper | mid-tone cobalt blueprint | golden-hour sky | pure black, neon |
| Background | moving colour clouds, sun + blue counter-glow, twinkling stars | pastel watercolour washes, paper tooth | 1-bit Bayer dither in three blues, scanlines | domain-warped fbm haze, crepuscular rays occluded by the subject | surface caustics, 3 parallax layers of marine snow |
| Glyphs | drawn boxes `· – + = □ ■`, dark plate | drawn SDF `· ○ ◉ ✱ ✿ ●` in the subject's own colour, faint colour block | font atlas ` .:-=+*#%@` (VT323), acid-yellow highlights on navy plates | duotone halftone (45° cool shadow dots + 15° warm highlight dots) + contour lines | braille atlas `⠁⠃⠇⡇⣇⣧⣷⣿`, neon, on black |
| Type | DM Serif Display / Bodoni Moda / JetBrains Mono | Bricolage Grotesque / Instrument Serif / Geist Mono | Pixelify Sans / Space Mono / VT323 | Fraunces / IBM Plex Sans + Mono | Syne / Major Mono Display |
| Title | serif, "Weight / *less*" | heavy lowercase grotesk "un / fold" | pixel font "Hello, / world." + blinking caret | soft serif "Up / *draft*" | wide extrabold "Bio / lume" |
| Line work | constellation (nodes, rings, orbits, travelling sparks), reticle on the visor | golden-angle seed head with parastichy arms, rotating dial, specimen callouts, scale bar, herbarium label | graph paper, rotating 3D wireframe, dimension lines, title block, square cursor | 16 isobars round an "L", 70 animated streamlines, 121-tick altitude scale, sun protractor | 54-line current bundle, sonar rings that track each bell, 96 glow rays, 141-tick depth gauge |
| Finish | radial RGB fringing + iridescent sheen | strong misregistration (glyph side > photo side) | horizontal-only CRT convergence, screen tearing | moderate fringing, warm grain | strong fringing + bloom |

## 1 · Theme & palette

Start from the subject's light: a glowing subject wants dark (Biolume), a soft natural one wants paper (Unfold), an object
of design history wants a period-true system (Hello's blueprint), a sky wants its own sky (Updraft).

- Tokens base.css reads: `--bg --ink --ink-dim --hair --accent --accent-2 --panel --line --line-glow --tag-bg --cta-fade`
  plus fonts `--display --serif --mono --sans`. Define all of them.
- One loud accent, one counterweight (`--accent-2`): orange + electric blue, cobalt + acid yellow, cyan + magenta.
- **The inverse title lands on 1 − backdrop.** Pick the backdrop with that in mind: cobalt → acid yellow, paper →
  near-black, navy → pale gold, orange petals → electric blue. Grey subjects invert to grey — accept or nudge.
- Light pages: let ink be dark and glyphs coloured; dark pages: glyphs light or neon on a darkened plate.

## 2 · Background effect (shader `field()`)

Never just a flat colour. Pick one *principle* and commit (recipes in shader-recipes.md):

| Principle | Good for |
|---|---|
| drifting colour blobs + stars | space, night, dreams |
| pastel washes + paper tooth | botanicals, fashion, editorial calm |
| ordered dither (Bayer) in 2–3 tones | retro tech, print, 1-bit |
| domain-warped fbm + light rays occluded by the subject's mask | weather, smoke, volume, light |
| caustics + parallax particles | water, deep sea, underwater |
| halftone / screen-printed gradient | pop, music, sport |
| scanning bands, interference, moiré | electronics, sound, signals |

Always add a soft **halo** from `msk(c, 5.)` so the subject sits in its own light, and keep motion slow (periods of
5–30 s) so the subject's own movement stays the star. Saturation and brightness are the first things users react to:
on dark pages keep blobs dim but saturated; nudge with `col = mix(vec3(dot(col, LW)), col, 1.3)`.

## 3 · Glyph renderer (shader `scene()`)

The cell grid is anchored at the screen centre (so the cursor-driven size change zooms outward). Per cell: sample the
subject's colour and brightness at the cell centre, dither the subject's edge with `step(hash(id), mask)`, then draw.

| Renderer | Feel | Map brightness to… |
|---|---|---|
| drawn boxes / bars | digital, cinematic | a ramp of `box()` shapes |
| SDF organic shapes | botanical, soft, fashion | dot → ring → ring+dot → asterisk → flower → disc |
| font atlas (`stage({ atlas })`) | the most literal ASCII; any font, any charset | character index |
| braille atlas | dense, technical, glowing | dot count `⠀⠁⠃⠇⡇⣇⣧⣷⣿` |
| halftone screens | print, volume, light | dot radius (shadow) + a second rotated screen for highlights |
| contour lines | topography, volume | iso-lines of blurred brightness (`fract` + `fwidth`) |

Choose ink colour deliberately: the subject's own colour pushed to full saturation (neon, botanical), a fixed ink
(blueprint white, newsprint navy), or a ramp (white → acid yellow on the brightest). Put a darkened or tinted
**plate** behind glyphs (`mix(col, plate, m*k)`) so they stay legible — users often ask to tune its opacity.

## 4 · Type

Three roles, from Google Fonts: **display** (title, CTA, big numbers), **body/editorial** (manifesto, spread
sentences — often an italic serif), **labels** (mono, small caps feel). Each page in a set gets a different display
face. Heavy and wide display faces survive the inverse-on-noise title best; hairline faces disappear — if the user
loves a thin face, increase size or weight. Atlas fonts: monospace or pixel faces (VT323, Space Mono, JetBrains Mono)
or symbol fonts (Noto Sans Symbols 2 for braille).

## 5 · Title treatment

- One word split in two (`Weight / less`, `un / fold`, `Up / draft`, `Bio / lume`, `Hello, / world.`), placed
  top-left and bottom with an offset; the halves drift apart on scroll (`--p`).
- The shader draws it as **the inverse of a blurred backdrop**, so it is legible on any image without being noisy.
  The DOM words stay in the page for layout, screen readers and the no-WebGL fallback; keep the `.bl` baseline probe.
- Optional DOM decoration that tracks the word (Hello's blinking caret positioned from a `Range` rect).

## 6 · Line work — make it dense

The line work is what makes these pages feel designed rather than filtered. Aim for **one diagram language per page,
drawn densely** (dozens to hundreds of marks), plus **one or two elements that track the subject** via `toScreen()`:

- Diagram languages: constellations, star charts, orbits · phyllotaxis / Fibonacci spirals · weather maps (isobars,
  streamlines, wind barbs) · engineering drawings (dimension lines, title blocks, wireframes, graph paper) · sonar /
  radar sweeps · topographic contours · circuit traces · musical staves · seismographs · specimen sheets.
- Tracking elements: reticles, callouts with leader lines, dimension lines, sonar rings, altitude/depth markers.
  If the subject moves a lot, extract its path from the video (`tools/track_blobs.py`) instead of guessing.
- Ticks and scales: 100+ ticks reads as "instrument". Label every 10th.
- Animate slowly: stroke-dash drawing on load, travelling sparks, rotation over 60–240 s, sonar pings, breathing.
- Callouts measured on one frame drift when the subject moves; fade them while it's away (Hello fades its dimensions
  during the turntable) or track it.

## 7 · Finish

Colour fringing is part of the signature. Split the image into channels with a per-pixel offset that grows toward the
edges and near the cursor; users tune it often, so name the constants clearly. Variants: radial RGB (default),
horizontal-only (CRT), misregistration (print). Usually the glyph side gets more fringing than the photo side.
Add grain (±0.04–0.075), a light vignette, and where it fits: scanlines, bloom from `img(c, 3.6)`, iridescent sheen.

## Interaction (engine, every page)

Cursor X splits **photo ← | → glyphs**; cursor Y sets the grid size (top fine → bottom coarse); a ring follows the
cursor and shows the grid size. Restyle per page (`#ring` square on Hello, neon on Biolume) and rename the split labels
(`← Specimen / Signal →`, `← Sky / Forecast →`, `← Lens / Braille →`).
