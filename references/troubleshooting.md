# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page is blank / no canvas | opened from `file://` — WebGL can't read the video | serve it: `python3 -m http.server 5180 -d site` |
| Canvas stays dark for seconds | 2560×852 video still loading; the canvas fades in on the first frame | normal; a poster shows in the fallback only |
| Edits don't show up | the static server's files are cached (CSS/JS especially) | hard reload (Cmd/Ctrl+Shift+R); when scripting a browser, `fetch(url, {cache:'reload'})` then reload |
| Seeking the video in devtools jumps back to 0 | `python -m http.server` handles range requests poorly | wait for playback to reach the moment instead of setting `currentTime` |
| Clip barely moves | pinned start/end + soft wording | see pipeline.md → stronger, explicit motion; `cfg` 0.8–0.9; check with `generate.mjs <id> check` |
| Clip moves violently | "freely", "far", "rolling in different directions" | give magnitudes, "small, unhurried, slightly uneven", "Nothing sudden" |
| Mask eats part of a pale subject | subject's edge matches a pale backdrop | regenerate/edit the still onto pure black |
| Mask leaks into the backdrop on video | backdrop gets darker toward the edges / compression noise | `subject_mask.py` samples the backdrop from the corners with a tolerance; for stubborn cases raise `TOL`/`STEP` at its top |
| Dark rim around wispy subjects on the photo side | the clip blended the wisps into black | un-premultiply on the photo side (shader-recipes.md → Finishing) |
| Title invisible on the subject | inverse of mid-grey is mid-grey | choose a backdrop/subject contrast that inverts well, or push the inverse away from 0.5 |
| Title clipped (descenders cut, letters missing) | font not loaded when the mask was drawn, or letter-spacing ignored | the engine redraws after `document.fonts.load`; keep `.bl` probes; avoid fonts that only exist as variable axes the canvas can't set |
| Glyphs look like tiny dots only | atlas font not loaded or wrong `font` string | `font` must be a CSS family string with quotes, e.g. `'"VT323"'`, and the font must be in the page's `<link>` |
| Callouts/tags run off screen | fixed positions; the crop changes with the aspect ratio | position from `toScreen()`, flip sides when `x + width > innerWidth`, clamp inside the gutter; measure text every frame (fonts load late) |
| Whole page scrolls sideways on phones | one element wider than 375 px — usually the CTA heading at its `clamp()` minimum, or wide display fonts | find it: `[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth)`; give the CTA `font-size: 17vw` on phones |
| Header switcher too wide on phones | many pages | base.css shows numbers only under 760 px |
| Glyph side too noisy / too heavy | plate too opaque or ramp too dense | lower the plate mix, shift the brightness ramp, or reduce the halftone radius exponent |
| Everything too bright / too saturated | blobs added at full strength | scale blob strengths ~0.5 and keep saturation; users notice brightness first |
| Overlays drift off a moving subject | positions measured on one frame | track with `track_blobs.py`, or fade overlays while the subject is away (time ranges from `generate.mjs check`) |
| Text cursor (I-beam) appears over copy | default UA cursor | base.css sets `cursor: default` everywhere and `pointer` on links |
