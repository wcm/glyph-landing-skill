# Shader recipes

Each page passes a GLSL body to `stage({ fs })`; engine.js prepends the header below. The body defines `field()`,
`scene()`, `photo()` and `main()`. Copy recipes in and adapt — every page in `assets/examples/pages/` is a complete,
working combination.

## Engine API

```js
stage({
  fs,                       // GLSL body
  focus: [.6, .5],          // subject centre in source uv (y up); the crop leans toward it
  cell: [4, 36],            // grid px at cursor top → bottom (exponential)
  zoom: 1, shift: [0, 0],   // >1 pulls back to show more frame; shift in source uv (Hello uses 1.3 / [-.02, 0])
  atlas: { chars, font },   // optional font glyph texture (chars light → dense), font as a CSS family string
  onFrame({ t, now, p, mx, my, video, toScreen }) {},   // per frame while the hero is visible
});
// toScreen(u, v) → { x, y, scale }: source uv (y up) → screen px, including the cursor parallax. scale = px per uv (vertical).
```

Header uniforms and helpers:

```glsl
uniform sampler2D uTex, uText, uAtlas;   // packed video [colour | mask], title mask, glyph atlas
uniform vec2 uRes, uMouse, uScale, uOff; // canvas px, cursor 0..1 (y up), crop
uniform float uTime, uCell, uDissolve, uSplit, uAtlasN;   // cell px, scroll dissolve 0..1, split x 0..1, atlas size
const vec3 LW;                           // luminance weights
float hash(vec2); vec2 cover(vec2 uv);   // screen uv → source uv
vec2 warp(vec2 uv);                      // gentle dreamy wobble (optional)
vec3 img(vec2 c, float lod); float msk(vec2 c, float lod);   // lod = blur (mipmaps); msk fades at the bottom crop
float blob(vec2 uv, vec2 centre, float r);                   // aspect-correct gaussian
float box(vec2 p, vec2 a, vec2 b); float atlas(vec2 p, float i);
```

## Backgrounds — `vec3 field(vec2 uv, vec2 c)`

`uv` is the screen position, `c` the source position (for halos/ghosts that follow the subject). End most fields with
a halo: `col += tint * msk(c, 5.) * k;`

**Night sky (Weightless)** — dim saturated blobs, two counter-glows, twinkling stars:
```glsl
vec3 col = mix(vec3(.004,.005,.025), vec3(.012,.015,.09), uv.y);
col += vec3(.02,.09,.46) * blob(uv, vec2(.12+.08*sin(t*.17), .64+.12*sin(t*.11)), .48);
col += vec3(.85,.20,.04) * blob(uv, vec2(-.02,-.07), .36);              // sun low on the left
col += vec3(.05,.30,1.)  * blob(uv, vec2(1.05,.30), .33) * .95;         // blue counterweight, not mirrored
col = max(mix(vec3(dot(col, LW)), col, 1.3), 0.);                      // push saturation
float sh = hash(floor(uv*uRes/3.));
col += vec3(.92,.95,1.) * step(.9965, sh) * (.35 + .65*pow(.5+.5*sin(t*(1.+sh*3.) + sh*80.), 3.));
```

**Paper & pastel washes (Unfold)** — `mix` toward pastel tints instead of adding light:
```glsl
vec3 col = vec3(.952,.944,.925);
col = mix(col, vec3(1.,.74,.58), blob(uv, vec2(.90,.98), .46) * .7);   // peach
col = mix(col, vec3(.74,.86,.74), blob(uv, vec2(.02,.06), .44) * .7);  // sage
col -= (hash(floor(uv*uRes/2.)) - .5) * .02;                            // paper tooth
```

**1-bit ordered dither (Hello)** — compute a light level, then posterise with a Bayer matrix:
```glsl
float bayer(vec2 p){ ivec2 q = ivec2(mod(p, 4.));
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[q.x+q.y*4]+.5)/16.; }
float g = level(uv, c), d = bayer(floor(uv*uRes/2.));                   // 2 px dots
vec3 col = g < .5 ? mix(DEEP, MID, step(d, g*2.)) : mix(MID, LIGHT, step(d, (g-.5)*2.));
```
Keep a smooth `tone(level)` twin for the inverse title, or the title inverts the dither noise.

**Sky with domain-warped haze and occluded rays (Updraft):**
```glsl
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+17.; a*=.5; } return s; }   // vn = value noise
vec2 q = uv*vec2(uRes.x/uRes.y,1.)*2.2;
float w = fbm(q + vec2(t*.04,0.) + 1.6*fbm(q*.8 - vec2(t*.025, t*.01)));
col = mix(col, vec3(1.,.96,.92), smoothstep(.45,.85,w)*.45);
// rays (in main, once): march from the pixel toward the sun in source uv, collecting light where the subject isn't
vec2 sd = SUN - c; float acc = 0.;
for (int i = 1; i <= 14; i++){ vec2 s = c + sd*float(i)/14.; acc += (1. - msk(s, 2.5)) * sunGlow(s, .35); }
col += vec3(1.,.82,.55) * (acc/14.) * (.55 + .45*vn(vec2(atan(sd.y, sd.x)*24., t*.15))) * .35;
```

**Deep sea (Biolume)** — caustic net near the surface, parallax particles drifting up:
```glsl
vec2 q = uv*vec2(asp,1.)*5.; float k = 0.;
for (int i = 0; i < 3; i++){ q += .55*vec2(sin(q.y*1.3 + t*.45), cos(q.x*1.1 - t*.35)); k += abs(sin(q.x) + sin(q.y)); }
col += vec3(.1,.55,.75) * pow(1. - clamp(k/5., 0., 1.), 7.) * .3 * smoothstep(.4, 1., uv.y);
for (int L = 0; L < 3; L++){                                             // marine snow
  float s = 34. + float(L)*26.;
  vec2 g = uv*vec2(asp,1.)*s + vec2(sin(t*.2 + float(L))*.6, -t*(.25 + .2*float(L)));
  vec2 id = floor(g), f = fract(g) - .5, o = vec2(hash(id+3.), hash(id+9.)) - .5;
  col += vec3(.55,.85,1.) * smoothstep(.07, 0., length(f - o*.6)) * step(.86, hash(id + float(L)*7.)) * (.18 + .14*float(L));
}
```

## Glyph renderers — `vec3 scene(vec2 fc)`

Common cell setup (grid anchored at the centre so the size change zooms outward; optional row-shift glitch):
```glsl
float cs = uCell * (1. + uDissolve*3.);
vec2 ctr = uRes*.5, gfc = fc - ctr, id = floor(gfc/cs), p = fract(gfc/cs);
vec2 cuv = cover(((id + .5)*cs + ctr)/uRes);
vec3 ic = img(cuv, 1.); float l = dot(ic, LW);
float m = step(hash(id*1.37 + 3.1), smoothstep(.22, .85, msk(cuv, .5)) * (1. - uDissolve*.75));   // dithered edge
float tw = hash(id + floor(t*5. + hash(id)*5.));                                                   // twinkle
```

**Boxes:** `if (v < .14) 0; else if (v < .28) box(p,.38,.62) …` — dot, dash, plus, double bar, hollow square, block.

**SDF organic** (crisp at any size, `aa = 1.3/cs`):
```glsl
float disc(vec2 q,float r,float aa){ return smoothstep(r+aa, r-aa, length(q)); }
float ring(vec2 q,float r,float w,float aa){ return smoothstep(w+aa, w-aa, abs(length(q)-r)); }
// ramp: disc(.1) → ring(.24) → ring(.32)+disc(.1) → 3 crossed segments → 5 small rings round a dot → disc(.42)
```
Ink amount for colourful subjects: `clamp(sat*.8 + (1.-l)*.8 - .1, 0., 1.)` (saturated or dark → more ink).

**Font atlas** (`stage({ atlas: { chars: ' .:-=+*#%@', font: '"VT323"' } })`):
```glsl
col = mix(col, plate, m*.88);
col = mix(col, ink, atlas(p, clamp(l + (tw-.5)*.07, 0., .999) * uAtlasN) * m);
```
Braille: `chars: '⠀⠁⠃⠇⡇⣇⣧⣷⣿', font: '"Noto Sans Symbols 2"'`. For neon on black use the max channel for `l` and
`ic/max(mx,.04)` for a fully saturated hue, and add the glyph (`col += neon * atlas(...)`).

**Halftone duotone** (rotated screens, dot radius from shadow; a second screen for highlights):
```glsl
const float A = .7854; mat2 R = mat2(cos(A), -sin(A), sin(A), cos(A));
vec2 g = R*(fc - ctr)/cs, id = floor(g), p = fract(g) - .5;
vec2 cuv = cover((transpose(R)*((id + .5)*cs))/uRes + .5);
float l2 = smoothstep(.12, .85, l), rS = .46*pow(1. - l2, 2.);          // mid-tones stay light
col = mix(col, shadowInk, smoothstep(rS + aa, rS - aa, length(p)) * m);
```

**Contour lines** through the blurred brightness (in `main`, glyph side only):
```glsl
float f = dot(img(c, 2.2), LW)*16. - uTime*.12;
float iso = 1. - min(abs(fract(f - .5) - .5)/max(fwidth(f), 1e-4), 1.);
col = mix(col, lineInk, iso * smoothstep(.3, .8, msk(c, 1.5)) * .55 * side);
```

## Finishing — `main()`

```glsl
vec2 fc = gl_FragCoord.xy, uv = fc/uRes, d = uv - .5;
float md = length((uv - uMouse)*vec2(uRes.x/uRes.y, 1.));
vec2 off = d * uRes.y * (.008 + .012*smoothstep(.35, 0., md));          // radial fringing, stronger near the cursor
// horizontal-only (CRT): vec2 off = vec2(uRes.y*(.0018 + .004*smoothstep(.3, 0., md)), 0.);
float side = step(uSplit*uRes.x, fc.x);
vec3 col = side > .5 ? vec3(scene(fc+off).r, scene(fc).g, scene(fc-off).b)
                     : vec3(photo(fc+off*.5).r, photo(fc).g, photo(fc-off*.5).b);
```

- **Photo side:** `mix(field(uv, oc), img(oc, 0.), smoothstep(.05, .6, msk(oc, 0.)))`. For a bright, wispy subject cut
  from black (clouds, smoke, fire), un-premultiply so edges keep their colour instead of dragging a dark rim:
  `a = smoothstep(.02,.5,maxChannel)*smoothstep(0.,.35,mask); col = mix(sky, c/max(a,.08), a);`
- **Inverse title:** `col = mix(col, 1. - blurredBackdrop, texture(uText, uv).r)` where the backdrop is the field
  plus the subject at `lod 4.2`. Use the smooth twin of dithered fields.
- **Scanlines** `col *= .94 + .06*step(.5, fract(fc.y/3.));` · **bloom** `col += g*g*msk(c,3.)*.9` with `g = img(c,3.6)`
  · **vignette** `col *= 1. - k*pow(length(d*vec2(1.05,1.25)), 2.)` · **grain** `col += (hash(fc + fract(uTime*7.)*91.) - .5)*.05`.
- Cost: `scene()` runs three times per pixel for fringing. Keep loops in `main()` (rays, contours) out of `scene()`.
