#!/usr/bin/env python3
"""Scaffold a glyph landing page — or add another page to an existing project.

    python3 new_project.py <project-dir> <id> --name "Weightless" [--title "Weight/less"] [--image path] [--no 07]

First call creates the project:
    <project>/site/              engine.js, base.css, media/, pages.json, and the first page as index.html
    <project>/tools/             generate.mjs (fal), build_media.sh, subject_mask.py, track_blobs.py, package.json
    <project>/.gitignore         node_modules, raw Kling clips, .env.local
Every call (first or later) adds one page:
    site/<id>.html               from the template, title words and numbering filled in (index.html for the first page)
    site/pages.json              gains an entry, so every page's switcher shows it
    tools/subjects/<id>.json     prompt skeleton for generate.mjs
    tools/<id>.png               the user's image, if --image was given (converted to PNG; original kept beside it)
Nothing is generated and no API is called.
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL / "assets" / "template"

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("id")
ap.add_argument("--name", required=True, help="page / issue name, e.g. 'Weightless'")
ap.add_argument("--title", help="the hero word split in two with a slash, e.g. 'Weight/less' (default: name split in half)")
ap.add_argument("--image", help="the user's subject image (otherwise the still is generated from a prompt)")
ap.add_argument("--no", help="issue number shown in the switcher (default: next in sequence)")
a = ap.parse_args()

if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", a.id):
    sys.exit("id must be lowercase letters, digits and dashes, e.g. 'poppy' or 'night-sky'")
proj = Path(a.project).expanduser().resolve()
site, tools = proj / "site", proj / "tools"

# ——— create the project on first use ———
if not (site / "engine.js").exists():
    if proj.exists() and any(proj.iterdir()):
        sys.exit(f"{proj} exists, is not empty and is not a glyph-landing project; pick a new folder")
    site.mkdir(parents=True); (site / "media").mkdir(); (tools / "subjects").mkdir(parents=True)
    for f in ("engine.js", "base.css"):
        shutil.copy2(TEMPLATE / "site" / f, site / f)
    for f in ("generate.mjs", "build_media.sh", "subject_mask.py", "track_blobs.py", "package.json"):
        shutil.copy2(TEMPLATE / "tools" / f, tools / f)
    (tools / "build_media.sh").chmod(0o755)
    (site / "pages.json").write_text("[]\n")
    (proj / ".gitignore").write_text(
        "node_modules/\n.DS_Store\n.env.local\n"
        "# raw Kling downloads (30–50 MB each) — regenerate with: node tools/generate.mjs <id> video\n"
        "tools/*-motion.mp4\ntools/*-sheet.png\n"
        "# the user's original images may be personal photos or third-party art\ntools/*-original.*\n")
    print(f"created project {proj}")

pages = json.loads((site / "pages.json").read_text())
if any(p["id"] == a.id for p in pages):
    sys.exit(f"a page with id '{a.id}' already exists")

file = "index.html" if not pages else f"{a.id}.html"
no = a.no or f"{len(pages) + 1:02d}"
w1, _, w2 = (a.title or "").partition("/")
if not a.title:
    half = (len(a.name) + 1) // 2
    w1, w2 = a.name[:half], a.name[half:].lower()

html = (TEMPLATE / "site" / "page.template.html").read_text()
for k, v in {"{{NAME}}": a.name, "{{ID}}": a.id, "{{NO}}": no, "{{WORD1}}": w1, "{{WORD2}}": w2}.items():
    html = html.replace(k, v)
(site / file).write_text(html)
pages.append({"id": a.id, "file": file, "no": no, "name": a.name})
(site / "pages.json").write_text(json.dumps(pages, indent=2, ensure_ascii=False) + "\n")

spec = {
    "image": "" if not a.image else None,
    "edit": "" if a.image else None,
    "video": "",
    "duration": "15",
    "cfg": 0.7,
    "negative": "static, frozen, still image, camera shake, jitter, cut, new objects, text, logo, background change, flicker, distortion, low quality",
}
spec = {k: v for k, v in spec.items() if v is not None}
(tools / "subjects" / f"{a.id}.json").write_text(json.dumps(spec, indent=2) + "\n")

if a.image:
    src = Path(a.image).expanduser()
    if not src.is_file():
        sys.exit(f"image not found: {src}")
    orig = tools / f"{a.id}-original{src.suffix.lower()}"
    shutil.copy2(src, orig)
    png = tools / f"{a.id}.png"
    if src.suffix.lower() == ".png":
        shutil.copy2(src, png)
    else:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), str(png)], check=True)
    print(f"  image → tools/{png.name} (original kept as tools/{orig.name})")

print(f"added page {no} '{a.name}' → site/{file}")
print(f"  next: write the prompts in tools/subjects/{a.id}.json, then: cd {tools} && npm install")
