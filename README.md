# glyph-landing — a Claude skill

Turn **one image** (yours, or one Claude generates) into an **animated landing page** where the subject is re-drawn
live as a mosaic of glyphs:

- **The hero:** a looping video of your subject, rendered by a WebGL shader as ASCII characters, braille, halftone
  dots, pixel marks or little drawn shapes. Move the cursor left/right to split the **original photo** from the
  **glyph render**; move it up/down to make the grid finer or coarser. The title inverts whatever is behind it.
- **The look:** every page gets its own palette, animated background (night skies, paper washes, 1-bit dither, sun
  rays through haze, deep-sea caustics…), glyph style, font pairing and dense line art (constellations, weather maps,
  blueprints, sonar, specimen sheets) — plus all the copy, written for your subject.
- **Series:** add more pages to the same site; a switcher in the header links them.

Five example pages are in `assets/examples/pages/`: an astronaut on a twilight sky, a poppy on cotton paper, the 1984
Macintosh as a cobalt blueprint, a cumulus cloud in halftone with isobars, and jellyfish in neon braille.

---

## Quick start (for humans)

Paste this into **Claude Code** (or the Claude desktop app's Code tab):

> Install and use the skill from https://github.com/wcm/glyph-landing-skill — make me a glyph landing page for this image.

…or with no image:

> Install and use the skill from https://github.com/wcm/glyph-landing-skill — make me a glyph landing page about a jellyfish, dark and neon.

Claude installs the skill, checks your setup, asks for your fal API key, shows you the still before spending money on
video, checks the video actually moves, then designs and builds the page and verifies it in a browser.

**What you need**

| | |
|---|---|
| An image (optional) | a photo or render of one subject (PNG/JPG/WebP). A flat backdrop is easiest; Claude can replace a busy one |
| A **fal.ai API key** | create one at https://fal.ai/dashboard/keys. A page costs a still or two plus one or two 15-second Kling clips — check fal's current pricing |
| Node.js 18+, ffmpeg, Python 3 | on macOS: `brew install node ffmpeg python` |

---

## For Claude: what to do when a user gives you this repo URL

You are reading the README of a Claude skill. Your job is to install it and then use it for the user's request.

### 1. Install the skill

**Claude Code / desktop Code tab (has a terminal):**

```bash
git clone https://github.com/wcm/glyph-landing-skill ~/.claude/skills/glyph-landing
```

If that folder already exists, update it instead: `git -C ~/.claude/skills/glyph-landing pull`.
A newly installed skill is picked up on the next session. For this session, read
`~/.claude/skills/glyph-landing/SKILL.md` and follow it directly; you don't need to restart.

**Claude.ai / Claude app chat (no terminal):** tell the user to download this repo as a ZIP (green **Code** button →
**Download ZIP**) and upload it under **Settings → Capabilities → Skills** (code execution must be on). The pipeline
needs Node, ffmpeg, a browser preview and network access to fal.ai, which works best in Claude Code — recommend it if
they have it.

### 2. Check prerequisites

Run `node -v` (needs 18+), `ffmpeg -version`, `python3 -V`. If something is missing, give the user the one-line
install (macOS: `brew install node ffmpeg python`; Windows: `winget install OpenJS.NodeJS Gyan.FFmpeg Python.Python.3.12`)
and wait.

### 3. Collect inputs

Ask in one short message:
- **The image** (a file path, or attach it) — or what the page should be about, if they want one generated.
- **A fal API key.** Use it only as an environment variable on each command (`FAL_KEY=… node tools/generate.mjs …`).
  Never write it to a tracked file and never repeat it back.
- **Optional:** the vibe (light/dark, colours, fonts), how much the subject should move, the title or copy tone, what
  the page is for. Anything they don't specify, decide yourself with `references/looks.md` and `references/copy.md`,
  and say what you chose.

### 4. Run the skill

Follow `SKILL.md` from Step 0. Show the still before generating video, check the video's motion before building, and
verify the finished page in a browser at desktop and phone widths.

---

## What's inside

```
SKILL.md                      the workflow Claude follows (start here)
references/
  looks.md                    the seven design decisions per page + the five reference looks
  shader-recipes.md           engine API and drop-in GLSL: backgrounds, glyph renderers, finishing
  pipeline.md                 still / edit / Kling prompts that work, motion checks, packing, masks, tracking
  copy.md                     the seven copy slots with examples
  troubleshooting.md          failure modes seen so far and their fixes
scripts/new_project.py        scaffolds a project, or adds a page to one
assets/template/site/         engine.js (WebGL, video, title mask, cursor, glyph atlas, switcher), base.css, page template
assets/template/tools/        generate.mjs (fal), build_media.sh (packing), subject_mask.py, track_blobs.py
assets/examples/pages/        five complete pages (they expect their media in site/media/, not included)
assets/examples/subjects/     the prompts that generated those five subjects
```

### How a generated project is laid out

```
my-site/
  site/                       serve this folder (python3 -m http.server -d site)
    index.html, <id>.html     one page per subject
    pages.json                the page switcher's list
    engine.js, base.css
    media/<id>-loop.mp4       [colour | mask] packed loop the shader plays (+ -poster.jpg, -cutout.png, -track.json)
  tools/
    subjects/<id>.json        prompts for the still, edit and video
    <id>.png                  the still
    <id>-motion.mp4           the raw Kling clip (gitignored)
```

## License

MIT
