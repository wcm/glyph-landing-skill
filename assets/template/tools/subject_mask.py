"""Subject mask for a studio shot on a flat backdrop (any colour — pale grey, black, …).

The backdrop colour is sampled from the frame corners; a flood fill from the border then walks through
pixels close to it. Whatever the fill can't reach is the subject — so dark or pale details *inside* the
subject (a black visor, a white highlight) survive. Pure stdlib — pipe raw RGB in.
usage: subject_mask.py W H in.rgb out.gray      (in.rgb may hold many frames back to back → one mask per frame)
"""
import sys
from collections import deque

W, H = int(sys.argv[1]), int(sys.argv[2])
data = open(sys.argv[3], 'rb').read()
FRAME = W * H * 3
TOL = 40    # how far from the backdrop colour a pixel may be and still count as backdrop
STEP = 10   # largest colour jump the fill may cross between neighbours (absorbs gradients and video noise)


def mask(d):
    P = [(d[i], d[i + 1], d[i + 2]) for i in range(0, len(d), 3)]
    corners = [P[y * W + x] for x in (0, 1, W - 2, W - 1) for y in (0, 1, H - 2, H - 1)]
    ref = [sorted(c[k] for c in corners)[len(corners) // 2] for k in range(3)]

    def backdrop(c):
        return max(abs(c[k] - ref[k]) for k in range(3)) < TOL

    bg = bytearray(W * H)
    q = deque()
    for x in range(W):
        q.extend(((x, 0), (x, H - 1)))
    for y in range(H):
        q.extend(((0, y), (W - 1, y)))
    q = deque(p for p in q if backdrop(P[p[1] * W + p[0]]))
    for x, y in q:
        bg[y * W + x] = 1
    while q:
        x, y = q.popleft()
        c = P[y * W + x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx]:
                n = P[ny * W + nx]
                if backdrop(n) and max(abs(n[k] - c[k]) for k in range(3)) <= STEP:
                    bg[ny * W + nx] = 1
                    q.append((nx, ny))
    return bytes(0 if b else 255 for b in bg)


with open(sys.argv[4], 'wb') as out:
    for f in range(len(data) // FRAME):
        out.write(mask(data[f * FRAME:(f + 1) * FRAME]))
