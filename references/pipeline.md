# Media pipeline

```
image (user's, or prompt) ──► tools/<id>.png ──► Kling clip pinned first = last frame ──► build_media.sh video
                                (edit → flat black backdrop)        tools/<id>-motion.mp4        site/media/<id>-loop.mp4
                                                                                                 [colour | mask] 2560×852
```

The page plays `site/media/<id>-loop.mp4`: colour on the left half, the subject mask on the right half, same frames.
The shader reads both from one texture. Everything else (`-cutout.png`, `-poster.jpg`, `-track.json`) is optional.

## tools/subjects/<id>.json

```json
{
  "image": "still prompt (when generating from text)",
  "edit":  "restyle prompt (when the user brought an image)",
  "video": "motion prompt",
  "duration": "15",
  "cfg": 0.7,
  "negative": "static, frozen, still image, …"
}
```
`assets/examples/subjects/` has the five that built the reference pages.

## The still

**Backdrop: flat pure black is the default.** The mask is a flood fill from the frame border through the backdrop
colour (sampled from the corners), so anything that touches the backdrop and *looks like it* gets cut. Black
separates pale, white and bright subjects cleanly (white helmets on white backdrops lose their dome every time). Use a
flat pale backdrop only for a strongly coloured subject on a light page if you prefer — it works (Unfold's poppy).

Still prompt checklist:
- the subject, described like a product / editorial / macro photograph; lighting direction; "ultra detailed"
- **composition:** "sits right of centre and fills about half / two thirds of the frame, leaving calm empty space on
  the left" — the title lives on the left
- "Perfectly flat pure black backdrop (#000000) filling every edge of the frame — no floor, no reflection, no
  gradient, nothing else in the scene"
- "no text, no logos" for products; aspect 3:2 is set by the script

**The user's own image:** `new_project.py --image` puts it at `tools/<id>.png`. If its backdrop is already flat, use it
directly. Otherwise write an `edit` prompt ("Replace the background with a perfectly flat, pure black backdrop … keep
the subject exactly as it is: same pose, framing, lighting …") and run `node tools/generate.mjs <id> edit`. The
untouched original is kept as `tools/<id>-original.*` (gitignored).

Show every still to the user before spending on video.

## The clip (Kling v3 pro image-to-video)

`generate.mjs` sends the still as **both start and end image**, so the clip returns to its first frame and loops
without a seam. Use `"duration": "15"` (the maximum) unless the user asks otherwise — users find 10 s loops short.

Motion prompt lessons (each one cost a regeneration):
- **Pinning both ends makes Kling cautious.** "Gentle / subtle / a little" produces a clip that barely moves. Ask for
  movement explicitly and continuously: "Lots of strong, energetic, clearly visible motion from the first frame to the
  last …", then describe *what* moves *where* ("the moon jelly glides far to the left and returns"), and end with
  "… ending back where it started". Put "slow, hovering in place, barely moving, static, frozen" in the negative.
  Raise `cfg` to 0.8–0.9 when it ignores you.
- **But "freely", "rolling in different directions", "far" invite violent moves** (heads snapping round). For calm
  subjects describe small, slightly uneven moves with magnitudes ("tilts ten to fifteen degrees, eases back past centre
  into a smaller tilt the other way") and say "Nothing sudden".
- Camera moves are allowed when wanted ("the camera slowly zooms out to a medium shot … then zooms back in"); otherwise
  say "Locked camera".
- One continuous take beats stitched segments — users notice joins. A whole cycle can be one prompt ("folds closed
  into a bud … pauses … blooms again … then a breeze").
- Kling may exceed the asked magnitude (a "20°" turntable became ~60°). Check before building.
- Always: "The background stays pure black. No new objects, no cuts."

**Check every clip** before building — `node tools/generate.mjs <id> check` prints the mean difference from frame 0
at six points and writes a contact sheet. Under ~3 through the middle = barely moving → regenerate with stronger
wording. Last frame under ~2 = the loop closes. Show the contact sheet to the user.

## Building the packed loop

```bash
tools/build_media.sh tools/<id>.png <id> video tools/<id>-motion.mp4     # from the project root
```
Crops the clip to 3:2, cuts a mask on every frame (flood fill at 384×256, then blur → re-threshold → erode → soften,
bottom edge feathered so a cropped torso/stem never shows a hard line), and stacks colour | mask. 2–6 min.
No fal key or credit needed: `build_media.sh <png> <id> float|sway` animates a still with ffmpeg alone (a zero-g float
with a drifting visor reflection, or a stem rocking from its base) — a fallback, noticeably less alive than Kling.

Inspect the result: `ffmpeg -i site/media/<id>-loop.mp4 -vf "select='eq(n\,0)+eq(n\,200)',scale=800:-1,tile=1x2" -frames:v 1 sheet.png`
— the mask (right half) should be a clean white silhouette on black on every frame.

## Tracking moving parts (optional)

`python3 tools/track_blobs.py <id> [N] [fps]` finds the N brightest blobs in every frame and follows them, writing
`site/media/<id>-track.json`. The page interpolates by `video.currentTime` so overlays (sonar rings, labels) ride on
the subject. Good for glowing or high-contrast parts; for everything else, place overlays on a fixed source-uv point
measured from the first frame and fade them when the subject moves away.

## Measuring positions for overlays

Overlays are placed in **source uv with y up**: open a frame of the loop's colour half (1280×852), read pixel
coordinates, then `u = x/1280`, `v = 1 − y/852`. `toScreen(u, v)` handles crop, zoom and cursor parallax.

## Cost & keys

A still is cheap (~$0.15); a 15 s Kling v3 pro clip costs much more — check current fal pricing and tell the user
before the first video. Expect 1–2 clip regenerations per subject. `FAL_KEY`: pass it as an env var on the command
(`FAL_KEY=… node tools/generate.mjs …`). Only if the user asks to store it, write it to a `.env.local` that is
gitignored (project root or a parent folder); never echo it back or commit it.
