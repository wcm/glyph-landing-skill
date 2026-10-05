// ASCII Atlas engine — shared by every page.
// Owns: WebGL stage, packed [colour | mask] video texture, the title mask (DOM words redrawn into a texture),
// cursor split / crosshair / grid size, scroll dissolve, reveal-on-scroll, no-WebGL fallback.
// Each page supplies a fragment shader body (field / scene / main) and optional per-frame hooks.
//
// Uniforms + helpers available to the page shader (see HEADER):
//   uTex (packed video), uText (title mask), uRes, uMouse, uScale, uOff, uTime, uCell, uDissolve, uSplit
//   hash, cover(uv), warp(uv), img(c, lod), msk(c, lod), blob(uv, c, r), box(p, a, b), LW
//   atlas(p, i) — coverage of character i of the page's `atlas` option at cell position p (0..1), font-rendered

const HEADER = `#version 300 es
precision highp float;
uniform sampler2D uTex, uText, uAtlas;
uniform vec2 uRes, uMouse, uScale, uOff;
uniform float uTime, uCell, uDissolve, uSplit, uAtlasN;
out vec4 outColor;

const vec3 LW = vec3(.299,.587,.114);
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
// screen uv -> source uv (left half of the packed video); scale/offset come from JS
vec2 cover(vec2 uv){ return (uv-.5)*uScale + .5 + uOff + (uMouse-.5)*vec2(.012,.008); }
vec2 warp(vec2 uv){
  float t = uTime;
  return uv + .0045*vec2(sin(uv.y*7.+t*.5), sin(uv.x*6.-t*.41)) + .002*sin(vec2(uv.y,uv.x)*31.+t);
}
vec3 img(vec2 c, float lod){ c = clamp(c, vec2(.02), vec2(.98)); return textureLod(uTex, vec2(c.x*.5, c.y), lod).rgb; }
float msk(vec2 c, float lod){ float f = smoothstep(-.02, .12, c.y); c = clamp(c, vec2(.02), vec2(.98)); return f*textureLod(uTex, vec2(.5+c.x*.5, c.y), lod).r; }
float blob(vec2 uv, vec2 c, float r){ vec2 d = (uv-c)*vec2(uRes.x/uRes.y,1.); return exp(-dot(d,d)/(r*r)); }
float box(vec2 p, vec2 a, vec2 b){ return step(a.x,p.x)*step(p.x,b.x)*step(a.y,p.y)*step(p.y,b.y); }
// explicit lod: the cell edge is a discontinuity, so automatic derivatives would pick the blurriest mip there
float atlas(vec2 p, float i){ return textureLod(uAtlas, vec2((floor(i) + p.x)/uAtlasN, p.y), max(log2(64./uCell), 0.)).r; }
`;

// atlas: optional { chars: ' .:-=+*#%@', font: '"VT323"' } — characters ordered light → dense, drawn 64px per cell
// zoom > 1 pulls back from the subject (shows more frame around it); shift moves it, in source uv
// page switcher: an empty <nav class="pages" data-auto></nav> is filled from pages.json
//   [{ "file": "index.html", "no": "01", "name": "Weightless" }, …] — the current page gets aria-current
function fillNav(){
  const nav = document.querySelector('nav.pages[data-auto]');
  if (!nav) return;
  const here = location.pathname.split('/').pop() || 'index.html';
  fetch('pages.json').then(r => r.json()).then(list => {
    nav.innerHTML = list.map(p => `<a href="${p.file}"${p.file === here ? ' aria-current="page"' : ''}><span>${p.no}</span><b>${p.name}</b></a>`).join('');
  }).catch(() => {});
}

export function stage({ fs, focus = [.6, .47], aspect = 1280/852, cell = [3, 36], zoom = 1, shift = [0, 0], atlas, onFrame = () => {} }){
  fillNav();
  const root = document.documentElement;
  const canvas = document.getElementById('stage');
  const video = document.getElementById('src');
  const gl = canvas.getContext('webgl2', {antialias:false, premultipliedAlpha:false});
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), {threshold:.15});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  if (!gl){ root.classList.add('fallback'); return; }

  // ——— program ———
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, HEADER + fs));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const u = {res:U('uRes'), mouse:U('uMouse'), scale:U('uScale'), off:U('uOff'), time:U('uTime'), cell:U('uCell'), dis:U('uDissolve'), split:U('uSplit')};

  const texture = (unit, internal, format, px, minFilter) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 1, 1, 0, format, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const ttex = texture(1, gl.R8, gl.RED, new Uint8Array([0]), gl.LINEAR);
  const vtex = texture(0, gl.RGBA, gl.RGBA, new Uint8Array([0,0,0,255]), gl.LINEAR_MIPMAP_LINEAR);   // unit 0 stays bound
  gl.uniform1i(U('uTex'), 0); gl.uniform1i(U('uText'), 1); gl.uniform1i(U('uAtlas'), 2);

  // ——— glyph atlas: one 64px cell per character, white on black, mipmapped ———
  if (atlas){
    const n = [...atlas.chars].length, font = `64px ${atlas.font}`;
    gl.uniform1f(U('uAtlasN'), n);
    const atex = texture(2, gl.R8, gl.RED, new Uint8Array([0]), gl.LINEAR_MIPMAP_LINEAR);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vtex);
    document.fonts.load(font, atlas.chars).then(() => {
      const ac = document.createElement('canvas'); ac.width = 64*n; ac.height = 64;
      const ax = ac.getContext('2d');
      ax.fillStyle = '#000'; ax.fillRect(0, 0, ac.width, 64);
      ax.fillStyle = '#fff'; ax.font = font; ax.textAlign = 'center'; ax.textBaseline = 'middle';
      [...atlas.chars].forEach((ch, i) => ax.fillText(ch, i*64 + 32, 34));
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, atex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, ac);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vtex);
    });
  }

  // ——— fit: landscape cover-fit biased toward the subject; portrait shrinks it to float inside the field ———
  let W = 0, H = 0, dpr = 1, S = [1, 1], O = [0, 0];
  function resize(){
    const ca = innerWidth/innerHeight;
    if (ca >= aspect) S = [.94, .94*aspect/ca];
    else if (ca > .85) S = [.94*ca/aspect, .94];
    else S = [.74, .74*aspect/ca];
    O = [(focus[0]-.5)*Math.max(1-S[0], 0) + shift[0], (focus[1]-.5)*Math.max(1-S[1], 0) + shift[1]];
    S = [S[0]*zoom, S[1]*zoom];
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.round(innerWidth*dpr); H = Math.round(innerHeight*dpr);
    canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', resize); resize();

  // ——— title mask: DOM words (kept for layout + a11y) redrawn white-on-black, in their own font ———
  const tcan = document.createElement('canvas'), tctx = tcan.getContext('2d');
  const words = [...document.querySelectorAll('.word')].map(el => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.selectNodeContents(node);
    const cs = getComputedStyle(node.parentElement);
    return {node, range, probe: el.querySelector('.bl'), cs, font: s => `${cs.fontStyle} ${cs.fontWeight} ${s}px ${cs.fontFamily}`};
  });
  let textKey = '', fontsReady = false;
  document.fonts.ready.then(() => Promise.all(words.map(w => document.fonts.load(w.font(100), w.node.textContent))))
    .then(() => { fontsReady = true; textKey = ''; });
  function updateText(){
    if (!fontsReady) return;
    const geo = words.map(w => [w.range.getBoundingClientRect().left, w.probe.getBoundingClientRect().top]);
    const key = geo.flat().map(v => v.toFixed(1)).join() + W + 'x' + H;
    if (key === textKey) return;
    textKey = key;
    if (tcan.width !== W || tcan.height !== H){ tcan.width = W; tcan.height = H; }
    tctx.clearRect(0, 0, W, H); tctx.fillStyle = '#fff'; tctx.textBaseline = 'alphabetic';
    words.forEach((w, i) => {
      tctx.font = w.font(parseFloat(w.cs.fontSize)*dpr);
      if ('letterSpacing' in tctx) tctx.letterSpacing = `${parseFloat(w.cs.letterSpacing || 0)*dpr}px`;
      tctx.fillText(w.node.textContent, geo[i][0]*dpr, geo[i][1]*dpr);
    });
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ttex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, tcan);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vtex);
  }

  // ——— input + video ———
  let mx = .5, my = .5, tmx = .5, tmy = .5;
  addEventListener('pointermove', e => { tmx = e.clientX/innerWidth; tmy = 1 - e.clientY/innerHeight; });
  let fresh = false, ready = false, lastVT = -1;
  const rvfc = 'requestVideoFrameCallback' in video;
  const onVF = () => { fresh = true; video.requestVideoFrameCallback(onVF); };
  if (rvfc) video.requestVideoFrameCallback(onVF);
  const kick = () => video.play().catch(() => {});
  video.addEventListener('loadeddata', () => { fresh = true; kick(); });
  addEventListener('pointerdown', kick, {once:true});
  addEventListener('touchstart', kick, {once:true, passive:true});
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) video.removeAttribute('autoplay');

  // source uv (GL, y up) -> screen px, including the cursor parallax baked into cover()
  const toScreen = (sx, sy) => ({
    x: ((sx - .5 - O[0] - (mx-.5)*.012)/S[0] + .5) * innerWidth,
    y: (1 - ((sy - .5 - O[1] - (my-.5)*.008)/S[1] + .5)) * innerHeight,
    scale: innerHeight/S[1],                    // source-uv units → px (vertical)
  });

  const split = document.getElementById('split'), gridTag = document.getElementById('gridTag');
  const hsplit = document.getElementById('hsplit'), ring = document.getElementById('ring');
  const cta = document.querySelector('.cta');
  const t0 = performance.now();

  function frame(now){
    requestAnimationFrame(frame);
    const t = (now - t0)/1000;
    mx += (tmx - mx)*.05; my += (tmy - my)*.05;
    const p = Math.min(Math.max(scrollY/innerHeight, 0), 1);
    const q = cta ? Math.min(Math.max(1 - cta.getBoundingClientRect().top/innerHeight, 0), 1) : 0;
    const dissolve = p*(1-q);
    root.style.setProperty('--p', p.toFixed(4)); root.style.setProperty('--mx', (mx-.5).toFixed(3)); root.style.setProperty('--my', (my-.5).toFixed(3));

    if ((fresh || video.currentTime !== lastVT) && video.readyState >= 2){
      lastVT = video.currentTime;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.generateMipmap(gl.TEXTURE_2D);
      fresh = !rvfc;
      if (!ready){ ready = true; canvas.classList.add('on'); root.classList.add('gl-on'); }
    }
    if (dissolve > .995 && ready) return;          // hidden behind opaque panels mid-page

    // cursor height sets the grid: top = fine, bottom = coarse, eased exponentially
    const cellCss = cell[0]*Math.pow(cell[1]/cell[0], 1 - my);
    const cx = (mx*innerWidth).toFixed(1), cy = ((1-my)*innerHeight).toFixed(1);
    split.style.transform = `translateX(${cx}px)`;
    hsplit.style.transform = `translateY(${cy}px)`;
    ring.style.transform = `translate(${cx}px,${cy}px)`;
    root.style.setProperty('--d', `${(22 + cellCss*1.6).toFixed(1)}px`);
    gridTag.style.top = `${cy}px`;
    gridTag.textContent = `Grid ${cellCss.toFixed(1)}px`;

    gl.uniform2f(u.res, W, H); gl.uniform2f(u.mouse, mx, my); gl.uniform2f(u.scale, S[0], S[1]); gl.uniform2f(u.off, O[0], O[1]);
    gl.uniform1f(u.time, reduce ? 0 : t); gl.uniform1f(u.cell, cellCss*dpr); gl.uniform1f(u.dis, dissolve); gl.uniform1f(u.split, mx);
    updateText();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (p < 1) onFrame({t, now, p, mx, my, video, toScreen});
  }
  requestAnimationFrame(frame);
}
