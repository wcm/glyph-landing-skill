#!/usr/bin/env bash
# Builds the cut-out still and the packed shader loop from one studio photo on a flat backdrop (any colour).
#   usage (from the project root): tools/build_media.sh <source.png> <name> <float|sway|video> [motion.mp4]
#   e.g. tools/build_media.sh tools/poppy.png poppy video tools/poppy-motion.mp4
#     float — a body at rest in zero-g: sway, bob, figure-eight drift, plus a drifting reflection in the visor
#     sway  — a stem in a draught: rocks around its base, with a slower second harmonic so it never looks mechanical
#     video — real motion from a generated clip (node tools/generate.mjs <id> video); the mask is cut per frame
# Output (site/media/):
#   <name>-cutout.png  — subject on transparent background, 1280x852
#   <name>-loop.mp4    — 12s seamless loop, 2560x852: [colour | subject mask] side by side
#   <name>-poster.jpg  — first frame (colour half) for the no-WebGL fallback
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:?source image}; NAME=${2:?name}; MOTION=${3:-float}; CLIP=${4:-}
OUT=site/media
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; [ -n "${KEEP_TMP:-}" ] && trap - EXIT && echo "tmp: $TMP"
W=1280; H=852; T=12; FPS=30
P="2*PI*t/$T"   # every motion term is a whole-number harmonic of T, so frame 360 == frame 0

# mask is found on a 768px-wide copy — the pure-Python flood fill stays fast and the edge is re-smoothed anyway
ffmpeg -v error -y -i "$SRC" -vf "scale=768:-2:flags=area" "$TMP/small.png"
read SW SH < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$TMP/small.png" | tr ',' ' ')
ffmpeg -v error -y -i "$TMP/small.png" -f rawvideo -pix_fmt rgb24 "$TMP/src.rgb"
python3 tools/subject_mask.py "$SW" "$SH" "$TMP/src.rgb" "$TMP/mask.gray"

# Clean mask at output size: drop specks, blur+re-threshold to smooth ragged contours where a pale subject
# meets the pale backdrop, pull the edge in past the fringe, soften,
# and feather the bottom crop so a cut-off torso/stem never shows a hard line while moving.
ffmpeg -v error -y -f rawvideo -pix_fmt gray -s "${SW}x${SH}" -i "$TMP/mask.gray" \
  -vf "median=radius=4,scale=$W:$H:flags=bicubic,gblur=sigma=7,format=gray,geq=lum='clip((lum(X,Y)-120)*3+128,0,255)',erosion,erosion,gblur=sigma=1.4,geq=lum='lum(X,Y)*clip((H-Y)/(0.10*H),0,1)'" \
  "$TMP/mask.png"
ffmpeg -v error -y -i "$SRC" -vf "scale=$W:$H:flags=lanczos" "$TMP/color.png"

# 1) still cut-out
ffmpeg -v error -y -i "$TMP/color.png" -i "$TMP/mask.png" \
  -filter_complex "[0]format=rgba[c];[1]format=gray[m];[c][m]alphamerge" "$OUT/$NAME-cutout.png"

# 2) loop
if [ "$MOTION" = video ]; then
  [ -f "$CLIP" ] || { echo "video mode needs the motion clip" >&2; exit 1; }
  read FW FH < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$CLIP" | tr ',' ' ')
  # crop the clip to the source's 3:2 framing, then cut a mask for every frame on a 384px copy
  CROP="crop='min(iw,ih*1.5023)':'min(ih,iw/1.5023)'"
  ffmpeg -v error -y -i "$CLIP" -vf "$CROP,scale=$W:$H:flags=lanczos,fps=$FPS" -an "$TMP/clip.mp4"
  ffmpeg -v error -y -i "$TMP/clip.mp4" -vf "scale=384:256:flags=area" -f rawvideo -pix_fmt rgb24 "$TMP/clip.rgb"
  python3 tools/subject_mask.py 384 256 "$TMP/clip.rgb" "$TMP/clip.gray"
  ffmpeg -v error -y -i "$TMP/clip.mp4" \
    -f rawvideo -pix_fmt gray -s 384x256 -framerate $FPS -i "$TMP/clip.gray" \
    -filter_complex "
      [1]median=radius=2,scale=$W:$H:flags=bicubic,gblur=sigma=5,format=gray,
         geq=lum='clip((lum(X,Y)-120)*3+128,0,255)',erosion,erosion,gblur=sigma=1.4,
         geq=lum='lum(X,Y)*clip((H-Y)/(0.10*H),0,1)',format=yuv420p[msk];
      [0]format=yuv420p[col];
      [col][msk]hstack=shortest=1,format=yuv420p[out]" \
    -map "[out]" -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/$NAME-loop.mp4"
  ffmpeg -v error -y -i "$OUT/$NAME-loop.mp4" -frames:v 1 -vf "crop=iw/2:ih:0:0" -q:v 4 "$OUT/$NAME-poster.jpg"
  # the clip may be framed differently from the still — cut the still out of its first frame so they match
  ffmpeg -v error -y -i "$OUT/$NAME-loop.mp4" -frames:v 1 \
    -filter_complex "[0]split[a][b];[a]crop=iw/2:ih:0:0,format=rgba[c];[b]crop=iw/2:ih:iw/2:0,format=gray[m];[c][m]alphamerge" "$OUT/$NAME-cutout.png"
  echo "built: $OUT/$NAME-{cutout.png,loop.mp4,poster.jpg}"
  exit 0
fi

# 2) loop
case "$MOTION" in
float)
  # ±2.4° sway, ±20px bob, ±9px drift; the visor's starfield slides opposite to the sway and breathes
  ffmpeg -v error -y -f lavfi -i "color=black:s=${W}x${H},format=gray" -frames:v 1 \
    -vf "geq=lum='255*clip((1-hypot((X-800)/190,(Y-488)/190))*5,0,1)'" "$TMP/glass.png"
  GRAPH="
    [0]format=rgba,split[base][glass];
    [glass]pad=iw+80:ih+80:40:40,crop=$W:$H:x='40-26*sin($P)':y='40+10*sin(2*$P)',
           eq=brightness='0.035*sin(3*$P)':contrast='1.06+0.06*sin(3*$P)':eval=frame,format=rgba[g0];
    [2]format=gray[vm];[g0][vm]alphamerge[g1];
    [base][g1]overlay=0:0:format=auto[head];
    [1]format=gray[sm];[head][sm]alphamerge,rotate=a='0.042*sin($P)':c=none:ow=iw:oh=ih[rot];
    [3][rot]overlay=x='9*sin(2*$P)':y='-20*sin($P+1.1)':eval=frame:format=auto,split[fa][fb];"
  BG=0xbfbfbf ;;
sway)
  # pivot at the stem's foot (bottom edge, 69% across): pad so the pivot sits at the centre, rotate, crop back
  PX=883; PY=$H
  ffmpeg -v error -y -f lavfi -i "color=black:s=16x16,format=gray" -frames:v 1 "$TMP/glass.png"
  GRAPH="
    [0]format=rgba[c0];[1]format=gray[sm];[c0][sm]alphamerge,
      pad=$((2*W)):$((2*H)):$((W-PX)):$((H-PY)):color=black@0,
      rotate=a='0.026*sin($P)+0.007*sin(3*$P+1.3)':c=none:ow=iw:oh=ih,
      crop=$W:$H:$((W-PX)):$((H-PY)),
      eq=brightness='0.012*sin(2*$P)':eval=frame[rot];
    [3][rot]overlay=0:0:format=auto,split[fa][fb];"
  BG=0xe8e6e1 ;;
*) echo "unknown motion: $MOTION" >&2; exit 1 ;;
esac

ffmpeg -v error -y \
  -loop 1 -framerate $FPS -t $T -i "$TMP/color.png" \
  -loop 1 -framerate $FPS -t $T -i "$TMP/mask.png" \
  -loop 1 -framerate $FPS -t $T -i "$TMP/glass.png" \
  -f lavfi -t $T -i "color=c=black@0:s=${W}x${H}:r=$FPS,format=rgba" \
  -f lavfi -t $T -i "color=c=$BG:s=${W}x${H}:r=$FPS,format=rgba" \
  -filter_complex "$GRAPH
    [4][fa]overlay=0:0:format=auto,format=yuv420p[col];
    [fb]alphaextract,format=yuv420p[msk];
    [col][msk]hstack,format=yuv420p[out]" \
  -map "[out]" -r $FPS -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/$NAME-loop.mp4"

ffmpeg -v error -y -i "$OUT/$NAME-loop.mp4" -frames:v 1 -vf "crop=iw/2:ih:0:0" -q:v 4 "$OUT/$NAME-poster.jpg"
echo "built: $OUT/$NAME-{cutout.png,loop.mp4,poster.jpg}"
