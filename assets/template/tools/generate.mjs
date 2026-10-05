// Subject media for a glyph landing page, generated with fal.
//
//   node generate.mjs <id> still      text → still           tools/<id>.png          (nano-banana-pro)
//   node generate.mjs <id> edit       user's image → still   tools/<id>.png          (nano-banana-pro/edit; the original
//                                                                                     is kept as tools/<id>-original.<ext>)
//   node generate.mjs <id> video      still → looping clip   tools/<id>-motion.mp4   (Kling v3 pro, first = last frame)
//   node generate.mjs <id> check      no API call: motion numbers + a contact sheet of the clip (tools/<id>-sheet.png)
//
// Prompts live in tools/subjects/<id>.json: { image?, edit?, video, duration, cfg?, negative? }.
// FAL_KEY comes from the environment, or from a gitignored .env.local in the project or any parent folder.
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGE_MODEL = "fal-ai/nano-banana-pro";
const EDIT_MODEL = "fal-ai/nano-banana-pro/edit";
const VIDEO_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";
const DEFAULT_NEGATIVE = "static, frozen, still image, camera shake, jitter, cut, new objects, text, logo, background change, flicker, distortion, low quality";

const [id, step] = process.argv.slice(2);
const specFile = join(HERE, "subjects", `${id}.json`);
if (!id || !["still", "edit", "video", "check"].includes(step) || !existsSync(specFile)) {
  console.error("usage: node generate.mjs <id> still|edit|video|check   (needs tools/subjects/<id>.json)");
  process.exit(1);
}
const S = JSON.parse(readFileSync(specFile, "utf8"));
const still = join(HERE, `${id}.png`);
const clip = join(HERE, `${id}-motion.mp4`);

// ——— check: is there enough motion, and does the loop close? ———
if (step === "check") {
  if (!existsSync(clip)) { console.error(`no clip yet: ${clip}`); process.exit(1); }
  const n = Number(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", clip]).toString().trim());
  const gray = (i) => execFileSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", `select=eq(n\\,${i}),scale=320:-2,format=gray`,
    "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  const f0 = gray(0), diff = (b) => { let s = 0; for (let k = 0; k < f0.length; k++) s += Math.abs(f0[k] - b[k]); return s / f0.length; };
  const marks = [.17, .33, .5, .67, .83, 1].map((p) => Math.min(n - 1, Math.round(p * (n - 1))));
  console.log(`[${id}] ${n} frames — mean difference from frame 0 (0–255):`);
  for (const i of marks) console.log(`  frame ${String(i).padStart(4)}  ${diff(gray(i)).toFixed(1)}`);
  console.log("  < 3 through the middle = barely moving · last frame < 2 = loop closes cleanly");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-vf", `select=not(mod(n\\,${Math.max(1, Math.floor(n / 8))})),scale=320:-2,tile=4x2`,
    "-frames:v", "1", "-fps_mode", "vfr", join(HERE, `${id}-sheet.png`)]);
  console.log(`  contact sheet → tools/${id}-sheet.png`);
  process.exit(0);
}

// ——— fal ———
let key = process.env.FAL_KEY;
for (let dir = resolve(HERE, ".."); !key; dir = dirname(dir)) {
  const f = join(dir, ".env.local");
  if (existsSync(f)) key = readFileSync(f, "utf8").match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
  if (dir === dirname(dir)) break;
}
if (!key) { console.error("Set FAL_KEY (https://fal.ai/dashboard/keys), e.g. FAL_KEY=… node generate.mjs …"); process.exit(1); }
const { fal } = await import("@fal-ai/client");
fal.config({ credentials: key });

const log = (tag) => (u) => { if (u.status === "IN_PROGRESS") (u.logs || []).forEach((l) => console.log(`  [${tag}] ${l.message}`)); };
const save = async (url, out) => {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(out, buf); console.log(`[${id}] saved ${out} (${(buf.length / 1e6).toFixed(1)} MB)`);
};
const upload = (path) => fal.storage.upload(new Blob([readFileSync(path)], { type: path.endsWith(".png") ? "image/png" : "image/jpeg" }));

if (step === "still") {
  if (!S.image) { console.error(`subjects/${id}.json has no "image" prompt`); process.exit(1); }
  console.log(`[${id}] generating still with ${IMAGE_MODEL}…`);
  const { data } = await fal.subscribe(IMAGE_MODEL, {
    input: { prompt: S.image, aspect_ratio: "3:2", resolution: "2K", output_format: "png", num_images: 1 },
    logs: true, onQueueUpdate: log("image"),
  });
  await save(data.images[0].url, still);
}

if (step === "edit") {
  if (!S.edit) { console.error(`subjects/${id}.json has no "edit" prompt`); process.exit(1); }
  const orig = readdirSync(HERE).find((f) => f.startsWith(`${id}-original.`));
  let source = orig && join(HERE, orig);
  if (!source) {
    if (!existsSync(still)) { console.error(`put the user's image at tools/${id}.png first`); process.exit(1); }
    source = join(HERE, `${id}-original${extname(still)}`); copyFileSync(still, source);
  }
  console.log(`[${id}] editing with ${EDIT_MODEL}…`);
  const { data } = await fal.subscribe(EDIT_MODEL, {
    input: { prompt: S.edit, image_urls: [await upload(source)], aspect_ratio: "3:2", resolution: "2K", output_format: "png", num_images: 1 },
    logs: true, onQueueUpdate: log("edit"),
  });
  await save(data.images[0].url, still);
}

if (step === "video") {
  if (!existsSync(still)) { console.error(`make the still first: tools/${id}.png`); process.exit(1); }
  const url = await upload(still);
  console.log(`[${id}] animating with ${VIDEO_MODEL} — ${S.duration || "10"} s, a few minutes…`);
  const { data } = await fal.subscribe(VIDEO_MODEL, {
    input: { prompt: S.video, start_image_url: url, end_image_url: url, duration: String(S.duration || "10"),
             cfg_scale: S.cfg ?? 0.7, generate_audio: false, negative_prompt: S.negative || DEFAULT_NEGATIVE },
    logs: true, onQueueUpdate: log("video"),
  });
  await save(data.video.url, clip);
}
