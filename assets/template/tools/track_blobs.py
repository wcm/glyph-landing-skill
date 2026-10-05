"""Tracks the N brightest blobs (e.g. glowing jellyfish bells) through a packed loop, for page overlays.

Reads the colour half of site/media/<name>-loop.mp4 at a low resolution, finds bright connected regions per frame,
keeps the N largest and follows each from frame to frame by nearest match. Writes site/media/<name>-track.json:
[{ "fps": F, "pts": [[u, v], …] }, …] — u, v in source uv with v pointing up (the shader's convention).
usage (from the project root): python3 tools/track_blobs.py <name> [N=3] [fps=10]
"""
import json
import subprocess
import sys

name = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3
FPS = int(sys.argv[3]) if len(sys.argv) > 3 else 10
W, H = 192, 128
THRESH = 150            # brightest channel above this counts as "glowing"

raw = subprocess.run(
    ['ffmpeg', '-v', 'error', '-i', f'site/media/{name}-loop.mp4',
     '-vf', f'crop=iw/2:ih:0:0,fps={FPS},scale={W}:{H}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    check=True, capture_output=True).stdout
frames = [raw[i:i + W * H * 3] for i in range(0, len(raw), W * H * 3) if len(raw) - i >= W * H * 3]


def blobs(d):
    hot = bytearray(1 if max(d[i], d[i + 1], d[i + 2]) > THRESH else 0 for i in range(0, len(d), 3))
    seen, found = bytearray(W * H), []
    for start in range(W * H):
        if not hot[start] or seen[start]:
            continue
        stack, sx, sy, n = [start], 0, 0, 0
        seen[start] = 1
        while stack:
            i = stack.pop()
            x, y = i % W, i // W
            sx, sy, n = sx + x, sy + y, n + 1
            for j in (i - 1 if x else -1, i + 1 if x < W - 1 else -1, i - W, i + W):
                if 0 <= j < W * H and hot[j] and not seen[j]:
                    seen[j] = 1
                    stack.append(j)
        found.append((n, sx / n / W, 1 - sy / n / H))
    found.sort(reverse=True)
    return [(u, v) for _, u, v in found[:N]]


tracks = None
for f in frames:
    pts = blobs(f)
    if tracks is None:
        pts += [(0.5, 0.5)] * (N - len(pts))
        tracks = [[p] for p in pts]
        continue
    free = list(pts)
    for t in tracks:                       # greedy nearest match; a lost blob holds its last position
        last = t[-1]
        if free:
            best = min(free, key=lambda p: (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2)
            if (best[0] - last[0]) ** 2 + (best[1] - last[1]) ** 2 < 0.03:
                free.remove(best)
                t.append(best)
                continue
        t.append(last)

out = [{'fps': FPS, 'pts': [[round(u, 4), round(v, 4)] for u, v in t]} for t in tracks]
json.dump(out, open(f'site/media/{name}-track.json', 'w'))
print(f'tracked {len(out)} blobs over {len(frames)} frames → site/media/{name}-track.json')
