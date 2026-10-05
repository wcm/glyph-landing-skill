---
name: glyph-landing
description: Build a striking animated landing page where a looping video of one subject is re-drawn live as a mosaic of glyphs (ASCII characters, braille, halftone dots, pixel blocks, organic marks) by a WebGL shader — with a cursor that splits the original photo from the glyph render and resizes the grid, a title that inverts the backdrop behind it, dense animated line work (constellations, weather maps, blueprints, sonar), and a full set of sections and copy. Takes the user's image or generates one with fal (nano-banana-pro), animates it with Kling into a seamless loop, then designs a distinct look (palette, background effect, glyph style, fonts, line art, wording) for it. Use this whenever someone wants an ASCII-art / glyph / dithered / halftone / "text-mode" effect on an image or video, an image-to-animated-website, a shader-driven or generative landing page for a product, object, creature or scene, or more pages in the same series — even if they don't say "landing page".
---

# Glyph landing page

One subject → one page. The subject loops (a Kling clip pinned so its last frame is its first); the shader draws it as
glyphs over an animated backdrop. On the page:

- **Hero:** cursor X splits *photo ← | → glyphs*; cursor Y sets the grid size; a ring and crosshair follow the cursor.
  The title — one word split in two — is drawn by the shader as the inverse of a blurred backdrop. Dense line art,
  some of it tracking the subject.
- **Sections:** manifesto (a true fact with a turn), marquee, four specs, a closing CTA over the subject again.
  Scrolling dissolves the grid into big pixels and back.
- **Series:** several pages share one engine and a page switcher; each page gets its own palette, background effect,
  glyph renderer, fonts, line art and copy.

`assets/examples/pages/` holds five complete pages that show the range (astronaut on a night sky, a poppy on paper, the
1984 Mac as a blueprint, a cloud with halftone and isobars, jellyfish in neon braille). Read one or two before writing a
page; never copy one wholesale — each page is designed fresh for its subject.

## What you need

| Need | Why | How |
|---|---|---|
| A subject | the user's image, or a description to generate one | ask, or take what they gave |
| `FAL_KEY` | stills, edits and video | env var on each command (`FAL_KEY=… node …`); never echo it or write it to a tracked file. Only if the user asks to store it: a gitignored `.env.local` |
| Node 18+, ffmpeg, Python 3 | generator, packing, masks | `node -v`, `ffmpeg -version`, `python3 -V`; macOS `brew install node ffmpeg python` |

Cost: stills are cheap (~$0.15); each 15 s Kling clip costs noticeably more and often needs one retry — check fal
pricing and say so before the first video.

## Step 0 — Agree on intent (one short message, then decide)

- **The subject.** Own image → check it (watermarks: don't remove them — ask for a licensed copy or generate an
  original instead; a photo of a real person → confirm it's them or they have consent; trademarked products are fine
  editorially, without logos). No image → you will generate one; propose a subject that suits the user's goal.
- **The look.** If the user described one, follow it. Otherwise choose all seven decisions in `references/looks.md`
  yourself and say what you chose in a sentence or two. If the project already has pages, make the new one differ from
  each existing page on at least five of the seven.
- **Motion.** What should move and how much ("lots of motion" vs "calm float"); 15 s by default.
- **Copy & framing.** Tone, any facts or names the user wants; otherwise a fictional exhibition / publication / event
  built around the subject (`references/copy.md`).

## Step 1 — Scaffold

```bash
python3 <skill>/scripts/new_project.py <project-dir> <id> --name "Name" --title "First/second" [--image path]
cd <project-dir>/tools && npm install
```

The first call creates the project (`site/` with `engine.js`, `base.css`, `pages.json`, `index.html`; `tools/` with
the pipeline; `.gitignore`). Each later call adds a page (`site/<id>.html`) and registers it in `pages.json` so every
page's switcher shows it.

## Step 2 — Prompts → still → review

Write `tools/subjects/<id>.json` (`references/pipeline.md` has the checklist; `assets/examples/subjects/` the five
that worked). Default to a **flat pure-black backdrop**, the subject right of centre with empty space on the left.

```bash
FAL_KEY=… node generate.mjs <id> still      # from the "image" prompt
FAL_KEY=… node generate.mjs <id> edit       # or: the user's image onto a flat backdrop (original kept)
```

Show `tools/<id>.png`. Iterate until the user is happy — everything downstream inherits it.

## Step 3 — Clip → check → review

```bash
FAL_KEY=… node generate.mjs <id> video      # a few minutes; run in the background
node generate.mjs <id> check                # motion numbers + tools/<id>-sheet.png
```

Read the numbers: under ~3 through the middle means it barely moves — strengthen the wording and regenerate before
building. Show the contact sheet. If the user wants different motion, show them the revised prompt before spending
again.

## Step 4 — Build the packed loop

```bash
cd <project-dir> && tools/build_media.sh tools/<id>.png <id> video tools/<id>-motion.mp4
python3 tools/track_blobs.py <id> 3         # optional: paths of glowing / high-contrast parts for tracking overlays
```

Check a frame of `site/media/<id>-loop.mp4`: the right half must be a clean white silhouette. Then measure the
positions you'll annotate (`references/pipeline.md` → measuring).

## Step 5 — Design the page

Edit `site/<id>.html` (every `EDIT` marker), using `references/looks.md` for decisions,
`references/shader-recipes.md` for the GLSL, and `references/copy.md` for the wording:

1. `:root` tokens and the Google Fonts link.
2. The shader: `field()` (background effect + halo), `scene()` (glyph renderer, plate, ink colour), `photo()`,
   `main()` (fringing, title inversion, finish). Set `stage({ focus, cell, zoom, atlas })`.
3. Title words, sizes and placement; spread sentences; the logo/series name.
4. Line work: dense SVG/DOM built in script, animated; tracking elements in `onFrame` via `toScreen()`.
5. Sections: manifesto, marquee, specs, CTA, footer — with section styling that belongs to this look.
6. Phones: check the `@media (max-width:760px)` block (title size, CTA size, hide crowded labels).

## Step 6 — Preview and verify

```bash
cd <project-dir> && python3 -m http.server 5180 -d site     # open http://localhost:5180/<file>
```

Verify in a browser, not by reading code: the console is clean; the canvas appears; moving the cursor splits and
resizes; the title is legible on the photo and glyph sides; overlays sit on the subject; scroll through every section;
a wide desktop, a near-square window and a 375 px phone with **no horizontal scroll**. Hard-reload after edits
(the static server caches). `references/troubleshooting.md` covers what has gone wrong before.

## Step 7 — Hand over

Tell the user what you built (subject, motion, the seven look decisions, the copy), anything you couldn't make work,
and the knobs they're likely to tweak — fringing constants, plate opacity, grid range, blob strengths, title size —
with where each lives. Leave raw Kling clips out of git (`.gitignore` already does).

## Adding another page

Run `new_project.py <project-dir> <new-id> --name …` again, then Steps 2–6 for that page, choosing a look that
differs from the existing pages.
