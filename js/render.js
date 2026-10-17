// ENDZONE KINGS — Three.js renderer (night-game stadium, articulated players, bloom)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TEAMS, OFF_PLAYS, HALF_W } from './sim.js?v=1792271925';
import { drawFaceTexture, faceParams } from './faces.js?v=1792271925';
import { drawLogo } from './logos.js?v=1792271925';
import { buildSidelines, colorSidelines, updateSidelines, seatTexture, buildBowlExtras, colorFlags, waveFlags } from './stadium.js?v=1792271925';

const W = HALF_W * 2;
const SKIN = ['#6b4226', '#8d5524', '#a8693f', '#c68642', '#e0ac69', '#f1c27d', '#4a2c18'];
// away uniform: white jersey with the team color as numbers and trim (or the dark home color if the home team already wears something light)
const lum = h => { const n = parseInt(String(h).slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
function awayKit(t, home) {
  const light = home && lum(home.jersey) > 0.62;
  if (light) return lum(t.jersey) > 0.62 ? { ...t, jersey: t.trim && lum(t.trim) < 0.5 ? t.trim : '#1d2433', num: '#ffffff' } : t;   // both light: away goes dark
  const col = t.jersey === '#121a14' ? '#18c964' : t.jersey;
  return { ...t, jersey: '#f3f4f1', num: col, trim: lum(t.trim) > 0.8 ? col : t.trim };
}
const vis = (t, k) => (t[k] === '#121a14' ? '#18c964' : t[k]); // readable accent color

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t._canvas = c;
  return t;
}
const lerp = (a, b, t) => a + (b - a) * t;
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const ai = a.index ? a.toNonIndexed() : a, bi = b.index ? b.toNonIndexed() : b;
  for (const key of ['position', 'normal']) {
    const A = ai.attributes[key].array, B = bi.attributes[key].array, out = new Float32Array(A.length + B.length);
    out.set(A); out.set(B, A.length); g.setAttribute(key, new THREE.BufferAttribute(out, 3));
  }
  return g;
}
const kickingNow = S => S.ph === 'kickset' || S.ph === 'kick';
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.pr = this.basePR(quality);
    r.setPixelRatio(this.pr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = quality === 'high';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070b1f, 0.0042);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.3, 900);
    this.cam.position.set(0, 12, -20);
    this.camMode = 'player';
    this.userZoom = 1;   // scroll / +- to pull the camera back and see more of the field
    this.focus = new THREE.Vector3(0, 0, 25);
    this.camPos = new THREE.Vector3(0, 12, 5);
    this.shake = 0;
    this.pmeshes = new Map();
    this.time = 0;
    this.teams = null;
    this.hype = 0.15; this.hypeTarget = 0.15;
    this.boardKey = '';

    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.buildWorld();
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.4, 0.93);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // three tiers: high (everything), low ("Fast": no shadows/bloom, half crowd), potato ("Chromebook": low-res,
  // simple players and crowd, fewest draw calls)
  basePR(q) { return q === 'high' ? Math.min(window.devicePixelRatio || 1, 1.75) : q === 'low' ? 1 : 0.7; }
  setQuality(q) {
    const was = this.quality;
    this.quality = q;
    this.r.shadowMap.enabled = q === 'high';
    this.key.castShadow = q === 'high';
    this.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.pr = this.basePR(q); this.r.setPixelRatio(this.pr);
    this.applyCrowdQuality();
    if (this.precip) this.precip.geometry.setDrawRange(0, q === 'potato' ? Math.floor(this.precip.geometry.attributes.position.count * 0.3) : Infinity);
    if ((was === 'potato') !== (q === 'potato')) this.clearPlayers();   // rebuild players at the new detail level
    this.resize();
  }
  // dynamic resolution for slow machines: nudge the render scale to hold the frame rate
  adaptResolution(fps) {
    if (this.quality === 'high') return;
    const lo = this.quality === 'potato' ? 0.45 : 0.6, hi = this.basePR(this.quality);
    let pr = this.pr;
    if (fps < 42) pr = Math.max(lo, pr - 0.08); else if (fps > 57) pr = Math.min(hi, pr + 0.04);
    if (Math.abs(pr - this.pr) > 0.001) { this.pr = pr; this.r.setPixelRatio(pr); this.resize(); }
  }
  applyCrowdQuality() {
    if (!this.fans) return;
    const q = this.quality, full = this.fans[0].userData.full;
    const n = q === 'high' ? full : q === 'low' ? Math.floor(full * 0.55) : Math.floor(full * 0.32);
    const [bodies, heads, arms, caps] = this.fans;
    bodies.count = n; heads.count = n;
    arms.count = q === 'potato' ? 0 : n; caps.count = q === 'potato' ? 0 : n;
    // potato: swap to a few-triangle body and head
    const sw = (m, key) => { const g = q === 'potato' ? m.userData.lite : m.userData.fullGeo; if (g && m.geometry !== g) m.geometry = g; };
    sw(bodies); sw(heads);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(w, h); }
    this.cam.aspect = w / h;
    this.cam.fov = w / h < 1 ? 68 : 54;
    this.cam.updateProjectionMatrix();
  }

  // ======================= WORLD =======================
  buildWorld() {
    const s = this.scene;
    this.sky = canvasTex(4, 512, () => {});
    s.background = this.sky;
    this.buildStars();

    this.hemi = new THREE.HemisphereLight(0x9fb6ff, 0x1d3a18, 0.6); s.add(this.hemi);
    const key = this.key = new THREE.DirectionalLight(0xfff3dd, 2.15);
    key.position.set(-25, 70, 35);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 10; sc.far = 160;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    s.add(key); s.add(key.target);
    const fill = this.fill = new THREE.DirectionalLight(0xb9c8ff, 0.9); fill.position.set(40, 50, 120); s.add(fill);
    const rim = this.rim = new THREE.DirectionalLight(0xffe2b0, 0.6); rim.position.set(30, 40, -60); s.add(rim);

    const surround = new THREE.Mesh(new THREE.PlaneGeometry(110, 190), new THREE.MeshStandardMaterial({ color: 0x1c5524, roughness: 1 }));
    surround.rotation.x = -Math.PI / 2; surround.position.set(0, -0.03, 50); surround.receiveShadow = true; s.add(surround);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 128), new THREE.MeshStandardMaterial({ color: 0x24692c, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.015, 50); apron.receiveShadow = true; s.add(apron);

    this.fieldMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    const fg = new THREE.PlaneGeometry(W, 120); fg.rotateZ(Math.PI);
    this.field = new THREE.Mesh(fg, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2; this.field.position.set(0, 0, 50); this.field.receiveShadow = true;
    s.add(this.field);

    this.buildBowl();
    this.buildGoalposts();
    this.buildPylons();
    buildSidelines(this);

    const lineGeo = new THREE.PlaneGeometry(W, 0.3);
    this.losLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.fdLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    for (const l of [this.losLine, this.fdLine]) { l.rotation.x = -Math.PI / 2; l.position.y = 0.025; l.renderOrder = 2; s.add(l); }

    this.buildBall();
    this.buildMarkers();
    this.routeGroup = new THREE.Group(); s.add(this.routeGroup);
    this.routeKey = '';
    this.buildWeather();
    this.setWeather('clear', 'night');
  }

  // ======================= WEATHER + TIME OF DAY =======================
  buildWeather() {
    const N = 5000, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 90; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 90; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainTex = canvasTex(16, 64, (c) => { const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(200,220,255,0)'); gr.addColorStop(1, 'rgba(210,225,255,0.85)'); c.fillStyle = gr; c.fillRect(7, 0, 2, 64); });
    this.snowTex = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
    this.precip = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, map: this.rainTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    this.precip.frustumCulled = false; this.precip.visible = false; this.precipSeed = seed;
    this.scene.add(this.precip);
    // a thin layer of snow (or a wet sheen) over the field
    this.cover = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 128), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 0.9, depthWrite: false,
      map: canvasTex(256, 256, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256); const d = c.getImageData(0, 0, 256, 256); for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = 120 + Math.random() * 135; c.putImageData(d, 0, 0); }) }));
    this.cover.rotation.x = -Math.PI / 2; this.cover.position.set(0, 0.012, 50); this.cover.renderOrder = 1; this.cover.receiveShadow = true;
    this.cover.material.map.wrapS = this.cover.material.map.wrapT = THREE.RepeatWrapping; this.cover.material.map.repeat.set(6, 12);
    this.scene.add(this.cover);
  }
  setWeather(wx = 'clear', tod = 'night') {
    if (this.wx === wx && this.tod === tod) return;
    this.wx = wx; this.tod = tod;
    const TOD = {
      night: { sky: ['#02030a', '#070c24', '#142055', '#22306e'], fog: 0x070b1f, hemi: [0x9fb6ff, 0x1d3a18, 0.6], key: [0xfff3dd, 2.15], fill: 0.9, rim: 0.6, stars: 0.7, exp: 1.0, env: 0.35, bloom: 0.32 },
      dusk: { sky: ['#1b1440', '#4a2a6a', '#c2557a', '#ffb067'], fog: 0x4a2f4a, hemi: [0xffc7a0, 0x2a2a18, 0.75], key: [0xffc58a, 2.0], fill: 0.7, rim: 0.9, stars: 0.15, exp: 1.0, env: 0.4, bloom: 0.28 },
      day: { sky: ['#2f6fd6', '#5d97e8', '#a9cdf5', '#dfeefc'], fog: 0xb8d4f0, hemi: [0xdfefff, 0x3b5a2a, 1.05], key: [0xffffff, 2.7], fill: 1.0, rim: 0.4, stars: 0, exp: 0.95, env: 0.55, bloom: 0.12 },
    }[tod] || {};
    const sk = TOD.sky.slice();
    if (wx === 'rain' || wx === 'fog' || wx === 'snow') { const gray = tod === 'day' ? ['#6d7887', '#8b95a3', '#a9b2bd', '#c4cad2'] : tod === 'dusk' ? ['#22202e', '#3a3446', '#5e5363', '#7d7280'] : ['#040509', '#0b0e1c', '#1a2036', '#262c44']; for (let i = 0; i < 4; i++) sk[i] = gray[i]; }
    const c = this.sky._canvas.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 512);
    [0, 0.5, 0.8, 1].forEach((t, i) => gr.addColorStop(t, sk[i]));
    c.fillStyle = gr; c.fillRect(0, 0, 4, 512); this.sky.needsUpdate = true;
    const fogCol = wx === 'fog' ? (tod === 'day' ? 0xc9d0d8 : tod === 'dusk' ? 0x6a5e6c : 0x2a3040) : wx === 'snow' ? (tod === 'day' ? 0xd6dde6 : 0x3a4256) : wx === 'rain' ? (tod === 'day' ? 0x8a949f : 0x161b2a) : TOD.fog;
    this.scene.fog.color.setHex(fogCol);
    this.scene.fog.density = wx === 'fog' ? 0.022 : wx === 'snow' ? 0.0085 : wx === 'rain' ? 0.0075 : tod === 'day' ? 0.0022 : 0.0042;
    const dim = wx === 'clear' ? 1 : wx === 'fog' ? 0.8 : 0.75;
    this.hemi.color.setHex(TOD.hemi[0]); this.hemi.groundColor.setHex(TOD.hemi[1]); this.hemi.intensity = TOD.hemi[2] * (wx === 'clear' ? 1 : 1.1);
    this.key.color.setHex(TOD.key[0]); this.key.intensity = TOD.key[1] * dim;
    this.key.position.set(tod === 'dusk' ? -60 : -25, tod === 'dusk' ? 38 : 70, tod === 'dusk' ? 20 : 35);
    this.fill.intensity = TOD.fill; this.rim.intensity = TOD.rim;
    if (this.starPts) this.starPts.material.opacity = wx === 'clear' ? TOD.stars : 0;
    this.r.toneMappingExposure = TOD.exp;
    this.scene.environmentIntensity = TOD.env;
    if (this.bloom) this.bloom.strength = TOD.bloom;
    this.precip.visible = wx === 'rain' || wx === 'snow';
    const pm = this.precip.material;
    if (wx === 'rain') { pm.map = this.rainTex; pm.size = 0.55; pm.opacity = 0.75; }
    if (wx === 'snow') { pm.map = this.snowTex; pm.size = 0.22; pm.opacity = 0.95; }
    pm.needsUpdate = true;
    this.cover.material.opacity = wx === 'snow' ? 0.5 : 0;
    this.cover.visible = wx === 'snow';
    this.fieldMat.roughness = wx === 'rain' ? 0.45 : 0.92;
    this.fieldMat.color.setHex(wx === 'rain' ? 0xc8d4cc : 0xffffff);
  }
  stepWeather(dt) {
    if (!this.precip.visible) return;
    const pos = this.precip.geometry.attributes.position, a = pos.array, sd = this.precipSeed;
    const rain = this.wx === 'rain', fx = this.focus.x, fz = this.focus.z, t = this.time;
    this.precip.position.set(fx, 0, fz);
    for (let i = 0, n = sd.length; i < n; i++) {
      const k = i * 3;
      if (rain) { a[k + 1] -= dt * (26 + sd[i] * 10); a[k] += dt * 2.5; }
      else { a[k + 1] -= dt * (1.6 + sd[i] * 1.4); a[k] += Math.sin(t * 0.8 + sd[i] * 20) * dt * 0.9; a[k + 2] += Math.cos(t * 0.6 + sd[i] * 14) * dt * 0.5; }
      if (a[k + 1] < 0) { a[k + 1] += 40; a[k] = (Math.random() - 0.5) * 90; a[k + 2] = (Math.random() - 0.5) * 90; }
    }
    pos.needsUpdate = true;
  }

  buildStars() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.9 + 0.15, R = 500;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * R; pos[i * 3 + 1] = Math.sin(ph) * R * 0.7 + 60; pos[i * 3 + 2] = 50 + Math.sin(th) * Math.cos(ph) * R;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false }));
    this.scene.add(this.starPts);
  }

  drawField(teams) {
    const PX = 22;
    const cw = Math.round(W * PX), ch = 120 * PX;
    const tex = canvasTex(cw, ch, (c) => {
      const Z = z => (110 - z) * PX, X = x => (HALF_W - x) * PX;
      for (let i = 0; i < 24; i++) {
        const g = c.createLinearGradient(0, 0, cw, 0);
        const a = i % 2 ? ['#2a8033', '#2f8a38'] : ['#226e2a', '#27772f'];
        g.addColorStop(0, a[0]); g.addColorStop(0.5, a[1]); g.addColorStop(1, a[0]);
        c.fillStyle = g; c.fillRect(0, Z(-5 + i * 5), cw, 5 * PX);
      }
      const img = c.getImageData(0, 0, cw, ch), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 16; d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.5; }
      c.putImageData(img, 0, 0);
      teams.forEach((ti, k) => {
        const t = TEAMS[ti];
        const z0 = k === 0 ? -10 : 100;
        const base = t.jersey === '#121a14' ? '#0f3a1e' : t.jersey;
        const g = c.createLinearGradient(0, Z(z0 + 10), 0, Z(z0));
        g.addColorStop(0, shadeHex(base, -0.15)); g.addColorStop(1, shadeHex(base, -0.35));
        c.fillStyle = g; c.fillRect(0, Z(z0 + 10), cw, 10 * PX);
        c.save(); c.beginPath(); c.rect(0, Z(z0 + 10), cw, 10 * PX); c.clip();
        c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = PX * 0.8;
        for (let x = -ch; x < cw + ch; x += PX * 3) { c.beginPath(); c.moveTo(x, Z(z0 + 10)); c.lineTo(x + 10 * PX, Z(z0)); c.stroke(); }
        c.restore();
        c.save(); c.translate(cw / 2, Z(z0 + 5)); if (k === 0) c.rotate(Math.PI);
        c.font = `900 ${PX * 7}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = PX * 0.5; c.strokeStyle = vis(t, 'trim') === vis(t, 'jersey') ? '#000' : t.trim; c.lineJoin = 'round';
        c.strokeText(t.name.toUpperCase(), 0, PX * 0.3);
        c.fillStyle = '#ffffff'; c.fillText(t.name.toUpperCase(), 0, PX * 0.3);
        const tw = c.measureText(t.name.toUpperCase()).width, ls = PX * 6.6;
        for (const sx of [-1, 1]) drawLogo(c, ti, ls, sx * (tw / 2 + PX * 2.2 + ls / 2) - ls / 2, -ls / 2);
        c.restore();
      });
      c.fillStyle = '#e8ebef';
      c.fillRect(0, 0, PX * 0.55, ch); c.fillRect(cw - PX * 0.55, 0, PX * 0.55, ch);
      c.fillRect(0, 0, cw, PX * 0.55); c.fillRect(0, ch - PX * 0.55, cw, PX * 0.55);
      for (let y = 0; y <= 100; y += 5) c.fillRect(PX * 0.5, Z(y) - (y % 10 ? 2 : 3), cw - PX, y % 10 ? 4 : 6);
      for (let y = 1; y < 100; y++) {
        if (y % 5 === 0) continue;
        for (const hx of [-HALF_W + 1.3, -2.1, 4.1, HALF_W - 0.3]) c.fillRect(X(hx), Z(y) - 2, PX * 1, 4);
      }
      c.font = `900 ${PX * 3}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let y = 10; y <= 90; y += 10) {
        const lab = String(y <= 50 ? y : 100 - y);
        for (const side of [-1, 1]) {
          c.save(); c.translate(X(side * (HALF_W - 9)), Z(y)); c.rotate(side * Math.PI / 2);
          c.fillText(lab.split('').join('  '), 0, 0);
          if (y !== 50) {
            const dir = (y < 50 ? -1 : 1) * side;
            c.beginPath(); c.moveTo(dir * PX * 3.3, -PX * 0.5); c.lineTo(dir * PX * 4.1, -PX * 0.1); c.lineTo(dir * PX * 3.3, PX * 0.3); c.closePath(); c.fill();
          }
          c.restore();
        }
      }
      c.save(); c.translate(cw / 2, Z(50));
      c.beginPath(); c.arc(0, 0, PX * 5.2, 0, Math.PI * 2); c.fillStyle = 'rgba(8,13,40,0.92)'; c.fill();
      c.lineWidth = PX * 0.4; c.strokeStyle = '#ffc83d'; c.stroke();
      c.beginPath(); c.arc(0, 0, PX * 4.5, 0, Math.PI * 2); c.lineWidth = PX * 0.1; c.stroke();
      const sz = PX * 0.028;
      c.beginPath(); c.moveTo(-118 * sz, 30 * sz); c.lineTo(-138 * sz, -78 * sz); c.lineTo(-62 * sz, -24 * sz); c.lineTo(0, -108 * sz); c.lineTo(62 * sz, -24 * sz); c.lineTo(138 * sz, -78 * sz); c.lineTo(118 * sz, 30 * sz); c.closePath();
      const gg = c.createLinearGradient(0, -110 * sz, 0, 30 * sz); gg.addColorStop(0, '#fff0a8'); gg.addColorStop(1, '#e08a00'); c.fillStyle = gg; c.fill();
      c.fillStyle = '#ffc83d'; c.font = `900 ${PX * 1.7}px "Big Shoulders Display", Impact, sans-serif`; c.fillText('ENDZONE KINGS', 0, PX * 2.4);
      c.restore();
    });
    tex.anisotropy = Math.min(16, this.r.capabilities.getMaxAnisotropy());
    if (this.fieldMat.map) this.fieldMat.map.dispose();
    this.fieldMat.map = tex; this.fieldMat.needsUpdate = true;
  }

  // ---------- stadium bowl ----------
  bowlPoint(t, scale) {
    const a = 46 * scale, b = 84 * scale, n = 5;
    const c = Math.cos(t), s = Math.sin(t);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * a, 50 + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * b];
  }

  buildBowl() {
    const s = this.scene;
    const N = 220;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x1b2140, roughness: 0.9 });
    const seatTex = seatTexture();
    const seatMat = new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.85, side: THREE.DoubleSide });
    const deck = (s0, y0, s1, y1, rows) => {
      const pos = [], idx = [], uv = [];
      for (let r = 0; r <= rows; r++) {
        const f = r / rows, sc = lerp(s0, s1, f), y = lerp(y0, y1, f);
        for (let i = 0; i <= N; i++) { const [x, z] = this.bowlPoint(i / N * Math.PI * 2, sc); pos.push(x, y, z); uv.push(i / N * 26, r / 16 * 2); }
      }
      for (let r = 0; r < rows; r++) for (let i = 0; i < N; i++) {
        const a = r * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const dm = new THREE.Mesh(g, seatMat); dm.receiveShadow = true; s.add(dm);
      return { s0, y0, s1, y1, rows };
    };
    const ring = (sc, y0, y1, mat, tiles = 24) => {
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= N; i++) { const [x, z] = this.bowlPoint(i / N * Math.PI * 2, sc); pos.push(x, y0, z, x, y1, z); uv.push(i / N * tiles, 0, i / N * tiles, 1); }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.Mesh(g, mat); s.add(m); return m;
    };
    const lower = deck(1.0, 2.2, 1.42, 19, 14);
    const upper = deck(1.52, 27, 1.95, 50, 13);
    ring(1.0, 0, 2.2, new THREE.MeshStandardMaterial({ color: 0x1b2140, roughness: 0.9, side: THREE.DoubleSide }));
    ring(1.42, 19, 27.3, new THREE.MeshStandardMaterial({ color: 0x0c1028, roughness: 0.7, side: THREE.DoubleSide }));
    ring(1.95, 50, 58, new THREE.MeshStandardMaterial({ color: 0x1b2140, roughness: 0.9, side: THREE.DoubleSide }));
    const suites = canvasTex(512, 32, (c, w, h) => {
      c.fillStyle = '#0a0d20'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 32; i++) { c.fillStyle = Math.random() < 0.8 ? `hsl(${40 + Math.random() * 20},80%,${55 + Math.random() * 25}%)` : '#111833'; c.fillRect(i * 16 + 2, 6, 12, 20); }
    });
    suites.wrapS = THREE.RepeatWrapping;
    const suiteRing = ring(1.42, 21.5, 24.5, new THREE.MeshBasicMaterial({ map: suites, side: THREE.DoubleSide, color: 0xaaaaaa }), 40);
    suiteRing.position.y = 0; suiteRing.scale.set(0.997, 1, 0.997); suiteRing.position.z = 50 * 0.003;
    this.ribbonTex = canvasTex(2048, 64, () => {}, true);
    this.ribbonTex.wrapS = THREE.RepeatWrapping;
    const ribMat = new THREE.MeshBasicMaterial({ map: this.ribbonTex, side: THREE.DoubleSide, toneMapped: false });
    const rib1 = ring(0.995, 0.5, 1.8, ribMat, 6);
    const rib2 = ring(1.415, 25.2, 26.9, ribMat, 8);
    this.ribbons = [rib1, rib2];

    // roof + light banks
    ring(1.95, 58, 60, new THREE.MeshStandardMaterial({ color: 0x0e1330, roughness: 0.6, side: THREE.DoubleSide }));
    const roofPos = [], roofIdx = [];
    for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2; const [x1, z1] = this.bowlPoint(t, 1.95); const [x2, z2] = this.bowlPoint(t, 1.55); roofPos.push(x1, 60, z1, x2, 63, z2); }
    for (let i = 0; i < N; i++) { const a = i * 2; roofIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3)); rg.setIndex(roofIdx); rg.computeVertexNormals();
    s.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x151b3d, roughness: 0.7, side: THREE.DoubleSide })));
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }), 120);
    const glowTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.25, 'rgba(255,240,200,0.45)'); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    const glows = [];
    for (let i = 0; i < 120; i++) {
      const t = i / 120 * Math.PI * 2; const [x, z] = this.bowlPoint(t, 1.6);
      const o = new THREE.Object3D(); o.position.set(x, 62, z); o.lookAt(0, 0, 50); o.updateMatrix();
      lamps.setMatrixAt(i, o.matrix);
      if (i % 3 === 0) glows.push(x, 61.5, z);
    }
    s.add(lamps);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
    s.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff1d6, fog: false })));

    // jumbotrons above each end zone
    this.boardTex = canvasTex(1024, 512, () => {});
    for (const z of [-34, 134]) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new RoundedBoxGeometry(34, 17.5, 1.6, 3, 0.4), new THREE.MeshStandardMaterial({ color: 0x0b0e1c, roughness: 0.5, metalness: 0.4 }));
      g.add(frame);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
      scr.position.z = 0.82; g.add(scr);
      g.position.set(0, 70, z); g.lookAt(0, 20, 50);
      s.add(g);
    }
    buildBowlExtras(this, ring);
    this.buildCrowd([lower, upper]);
  }

  buildCrowd(decks) {
    // torso with a little shape, a head, two arms (they shoot up when the place goes nuts), caps on some, signs here and there
    const bodyGeo = this.lathe('fan_torso', [[0.0001, 0.86], [0.17, 0.84], [0.27, 0.74], [0.26, 0.45], [0.23, 0.12], [0.2, 0.0], [0.0001, 0]], 8); bodyGeo.scale(1, 1, 0.68);
    const headGeo = new THREE.IcosahedronGeometry(0.17, 1); headGeo.translate(0, 1.04, 0);
    const armGeo = (() => { const l = new THREE.CapsuleGeometry(0.055, 0.42, 2, 5); l.translate(0, -0.2, 0); const L = l.clone(); L.translate(-0.3, 0.8, 0); const Rr = l.clone(); Rr.translate(0.3, 0.8, 0); return mergeTwo(L, Rr); })();
    const capGeo = new THREE.SphereGeometry(0.18, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); capGeo.translate(0, 1.07, 0);
    const spots = [];
    const N = 220;
    for (const d of decks) {
      for (let r = 0; r < d.rows; r++) {
        const f = (r + 0.5) / d.rows, sc = lerp(d.s0, d.s1, f), y = lerp(d.y0, d.y1, f);
        let prev = this.bowlPoint(0, sc), acc = 0;
        for (let i = 1; i <= N * 8; i++) {
          const t = i / (N * 8) * Math.PI * 2, p = this.bowlPoint(t, sc);
          acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
          if (acc >= 1.0) { acc = 0; const ang = Math.atan2(p[0], p[1] - 50); const aisle = Math.abs(((t * 26 / (Math.PI * 2)) % 1) - 0.52) < 0.04; if (!aisle && Math.random() < 0.93) spots.push([p[0], y, p[1]]); }
        }
      }
    }
    // shuffle so a reduced crowd still fills every section instead of emptying the upper deck
    for (let i = spots.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
    const count = spots.length;
    this.crowdU = { uTime: { value: 0 }, uHype: { value: 0.2 } };
    const mkMat = (arms) => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdU.uTime; sh.uniforms.uHype = this.crowdU.uHype;
        sh.vertexShader = 'uniform float uTime;\nuniform float uHype;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           float jump = max(0.0, sin(uTime * (5.0 + fract(aPhase * 7.3) * 3.0) + aPhase * 6.2831));
           float idle = sin(uTime * 1.3 + aPhase * 6.2831) * 0.03;
           ${arms ? `
           float up = clamp(uHype * 1.6 - 0.25 + fract(aPhase * 13.7) * 0.5 - 0.25, 0.0, 1.0) * (0.75 + 0.25 * jump);
           float wave = sin(uTime * 4.0 + aPhase * 20.0) * 0.25 * up;
           float ang = -2.6 * up + wave;
           vec3 piv = vec3(0.0, 0.8, 0.0);
           vec3 q = transformed - piv;
           float cs = cos(ang), sn = sin(ang);
           transformed = piv + vec3(q.x * (1.0 - 0.25 * up), q.y * cs - q.z * sn, q.y * sn + q.z * cs);` : ''}
           transformed.y += idle + jump * jump * 0.5 * uHype;
           if (position.y > 0.95) transformed.x += sin(uTime * 3.0 + aPhase * 9.0) * 0.04 * uHype;`);
      };
      return m;
    };
    const bodies = new THREE.InstancedMesh(bodyGeo, mkMat(false), count);
    const heads = new THREE.InstancedMesh(headGeo, mkMat(false), count);
    const arms = new THREE.InstancedMesh(armGeo, mkMat(true), count);
    const caps = new THREE.InstancedMesh(capGeo, mkMat(false), count);
    const phase = new Float32Array(count);
    const o = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const skin = SKIN.map(c => new THREE.Color(c));
    const hair = ['#0d0906', '#2b1a10', '#4a2e1a', '#a0662f', '#c9a15a'].map(c => new THREE.Color(c));
    this.signSpots = [];
    for (let i = 0; i < count; i++) {
      const [x, y, z] = spots[i];
      o.position.set(x, y, z); o.lookAt(0, y, 50);
      o.rotation.y += (Math.random() - 0.5) * 0.4;
      const kid = Math.random() < 0.08, sc = kid ? 0.72 : 0.9 + Math.random() * 0.22; o.scale.set(sc, sc, sc);
      o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix); arms.setMatrixAt(i, o.matrix);
      const capped = Math.random() < 0.3;
      caps.setMatrixAt(i, capped ? o.matrix : zero);
      const sk = skin[(Math.random() * skin.length) | 0];
      heads.setColorAt(i, Math.random() < 0.18 ? hair[(Math.random() * hair.length) | 0].clone().lerp(sk, 0.35) : sk);
      arms.setColorAt(i, sk);
      bodies.setColorAt(i, skin[0]); caps.setColorAt(i, skin[0]);
      phase[i] = Math.random();
      if (Math.random() < 0.025) this.signSpots.push({ m: o.matrix.clone(), ph: phase[i] });
    }
    for (const m of [bodies, heads, arms, caps]) { m.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1)); m.frustumCulled = false; this.scene.add(m); }
    this.crowdBodies = bodies; this.crowdCaps = caps; this.crowdSpots = spots;
    for (const m of [bodies, heads, arms, caps]) { m.userData.full = count; m.userData.fullGeo = m.geometry; }
    // few-triangle stand-ins for slow machines
    const liteBody = new THREE.BoxGeometry(0.44, 0.86, 0.3); liteBody.translate(0, 0.43, 0); liteBody.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const liteHead = new THREE.IcosahedronGeometry(0.17, 0); liteHead.translate(0, 1.04, 0); liteHead.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    bodies.userData.lite = liteBody; heads.userData.lite = liteHead;
    this.fans = [bodies, heads, arms, caps];
    this.applyCrowdQuality();
    this.buildSigns();
  }

  buildSigns() {
    // hand-made signs held up in the crowd
    const texts = ['DEFENSE!', 'LET\'S GO!', '#1 FAN', 'TOUCHDOWN!', 'KINGS!', 'GAME DAY', 'HOLD THAT LINE', 'HI MOM!'];
    const cols = [['#ffffff', '#c1121f'], ['#ffd400', '#111111'], ['#ffffff', '#1d4ed8'], ['#111111', '#ffd400'], ['#ffffff', '#15803d'], ['#f97316', '#111111'], ['#ffffff', '#7c3aed'], ['#fde68a', '#be185d']];
    const geo = new THREE.PlaneGeometry(1.25, 0.62); geo.translate(0, 1.75, 0.15);
    const per = Math.ceil(this.signSpots.length / texts.length);
    this.signs = [];
    texts.forEach((t, k) => {
      const tx = canvasTex(256, 128, (c, w, h) => {
        c.fillStyle = cols[k][0]; c.fillRect(0, 0, w, h); c.lineWidth = 6; c.strokeStyle = cols[k][1]; c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = cols[k][1]; c.font = `900 ${t.length > 9 ? 34 : 46}px "Big Shoulders Display", Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save(); c.translate(w / 2, h / 2); c.rotate((Math.random() - 0.5) * 0.12); c.fillText(t, 0, 4); c.restore();
      });
      const mat = new THREE.MeshLambertMaterial({ map: tx, side: THREE.DoubleSide });
      const spots = this.signSpots.slice(k * per, (k + 1) * per); if (!spots.length) return;
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      const ph = new Float32Array(spots.length);
      spots.forEach((sp, i) => { im.setMatrixAt(i, sp.m); ph[i] = sp.ph; });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdU.uTime; sh.uniforms.uHype = this.crowdU.uHype;
        sh.vertexShader = 'uniform float uTime;\nuniform float uHype;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           float jump = max(0.0, sin(uTime * (5.0 + fract(aPhase * 7.3) * 3.0) + aPhase * 6.2831));
           transformed.y += jump * jump * 0.5 * uHype + sin(uTime * 2.0 + aPhase * 9.0) * 0.06;
           transformed.x += sin(uTime * 2.5 + aPhase * 5.0) * 0.12 * (0.3 + uHype);`);
      };
      im.geometry = geo.clone(); im.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      im.frustumCulled = false; this.scene.add(im); this.signs.push(im);
    });
  }

  colorCrowd(teams) {
    const cols = [TEAMS[teams[0]], TEAMS[teams[1]]].map(t => [new THREE.Color(vis(t, 'jersey')), new THREE.Color(t.pants), new THREE.Color(vis(t, 'trim'))]);
    const misc = ['#d9dce6', '#1f2433', '#3a3f55', '#7c2d12', '#1e3a8a'].map(c => new THREE.Color(c));
    const spots = this.crowdSpots;
    for (let i = 0; i < spots.length; i++) {
      const [x, , z] = spots[i];
      const side = (z < -5 || z > 105) ? (Math.random() < 0.5 ? 0 : 1) : (x < 0 ? (Math.random() < 0.82 ? 0 : 1) : (Math.random() < 0.82 ? 1 : 0));
      const r = Math.random();
      const c = r < 0.6 ? cols[side][0] : r < 0.75 ? cols[side][2] : r < 0.85 ? cols[side][1] : misc[(Math.random() * misc.length) | 0];
      this.crowdBodies.setColorAt(i, c);
      if (this.crowdCaps) this.crowdCaps.setColorAt(i, Math.random() < 0.6 ? cols[side][Math.random() < 0.5 ? 0 : 2] : misc[(Math.random() * misc.length) | 0]);
    }
    this.crowdBodies.instanceColor.needsUpdate = true;
    if (this.crowdCaps) this.crowdCaps.instanceColor.needsUpdate = true;
  }

  drawRibbon(teams) {
    const c = this.ribbonTex._canvas, x = c.getContext('2d');
    const T = teams.map(i => TEAMS[i]);
    const segs = [['ENDZONE KINGS', '#ffc83d', '#0b1030'], [T[0].name.toUpperCase(), '#fff', vis(T[0], 'jersey')], ['HABIR STUDIOS', '#fff', '#ff5a3d'], [T[1].name.toUpperCase(), '#fff', vis(T[1], 'jersey')]];
    const w = c.width / segs.length;
    segs.forEach(([txt, fg, bg], i) => {
      const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, shadeHex(bg, 0.2)); g.addColorStop(1, shadeHex(bg, -0.3));
      x.fillStyle = g; x.fillRect(i * w, 0, w, 64);
      x.fillStyle = fg; x.font = '900 44px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, i * w + w / 2, 35);
    });
    this.ribbonTex.needsUpdate = true;
  }

  drawBoard(S) {
    const c = this.boardTex._canvas, x = c.getContext('2d'), w = c.width, h = c.height;
    const T = (S ? S.teams : this.teams).map(i => TEAMS[i]);
    x.fillStyle = '#05070f'; x.fillRect(0, 0, w, h);
    const msg = S && S.msg && S.msg.big ? S.msg.text : '';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (msg) {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#ff7a00');
      x.fillStyle = g; x.font = '900 210px "Big Shoulders Display", Impact, sans-serif';
      x.fillText(msg.replace('!', '').replace('’', "'"), w / 2, h / 2 + 10);
    } else {
      for (let k = 0; k < 2; k++) {
        const cx = k === 0 ? w * 0.25 : w * 0.75;
        x.fillStyle = vis(T[k], 'jersey'); x.fillRect(k === 0 ? 30 : w / 2 + 15, 30, w / 2 - 45, 120);
        x.fillStyle = '#fff'; x.font = '900 100px "Big Shoulders Display", Impact, sans-serif';
        x.fillText(T[k].abbr, cx, 96);
        x.font = '900 220px "Big Shoulders Display", Impact, sans-serif'; x.fillText(S ? String(S.sc[k]) : '0', cx, 300);
      }
      x.fillStyle = '#ffc83d'; x.font = '900 80px "Big Shoulders Display", Impact, sans-serif';
      if (S) {
        const clk = Math.max(0, Math.ceil(S.clk));
        x.fillText(`${S.q >= 5 ? 'OT' : 'Q' + S.q}   ${Math.floor(clk / 60)}:${String(clk % 60).padStart(2, '0')}`, w / 2, 450);
      } else x.fillText('ENDZONE KINGS', w / 2, 450);
    }
    x.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
    this.boardTex.needsUpdate = true;
  }

  buildGoalposts() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.35, metalness: 0.3 });
    const pad = new THREE.MeshStandardMaterial({ color: 0x1b2140, roughness: 0.8 });
    for (const z of [-10, 110]) {
      const g = new THREE.Group(); const back = z < 0 ? -1 : 1;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 3.3, 12), mat); base.position.set(0, 1.65, back * 1.5); g.add(base);
      const padM = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2, 12), pad); padM.position.set(0, 1, back * 1.5); g.add(padM);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 10), mat); arm.rotation.x = Math.PI / 2; arm.position.set(0, 3.3, back * 0.75); g.add(arm);
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.2, 12), mat); cross.rotation.z = Math.PI / 2; cross.position.y = 3.3; g.add(cross);
      for (const x of [-3.1, 3.1]) {
        const u = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 10), mat); u.position.set(x, 8.3, 0); g.add(u);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.3), new THREE.MeshBasicMaterial({ color: 0xff5a1f, side: THREE.DoubleSide })); flag.position.set(x, 13.5, 0.2); g.add(flag);
      }
      g.position.z = z; g.traverse(o => { o.castShadow = true; });
      this.scene.add(g);
    }
  }

  buildPylons() {
    const geo = new RoundedBoxGeometry(0.32, 1.2, 0.32, 2, 0.04); geo.translate(0, 0.6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5, emissive: 0x401400 });
    for (const z of [0, -10, 100, 110]) for (const x of [-HALF_W - 0.2, HALF_W + 0.2]) {
      const p = new THREE.Mesh(geo, mat); p.position.set(x, 0, z); p.castShadow = true; this.scene.add(p);
    }
  }

  buildBall() {
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20, y = (t - 0.5) * 0.56; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.17 + 0.001, y)); }
    const g = new THREE.LatheGeometry(pts, 20); g.rotateX(Math.PI / 2);
    this.ball = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6e3412, roughness: 0.55 }));
    const laceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.2), laceMat); lace.position.y = 0.17; this.ball.add(lace);
    for (let i = -2; i <= 2; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.018), laceMat); l.position.set(0, 0.175, i * 0.04); this.ball.add(l); }
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    // clips/replays: a glow around the ball that shows through players, so you can always find it
    const glowTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(255,230,120,0.95)'); g.addColorStop(0.45, 'rgba(255,200,60,0.45)'); g.addColorStop(1, 'rgba(255,200,60,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthTest: false, transparent: true, toneMapped: false }));
    this.ballGlow.scale.set(1.6, 1.6, 1); this.ballGlow.renderOrder = 11; this.ballGlow.visible = false; this.scene.add(this.ballGlow);
  }

  buildMarkers() {
    const s = this.scene;
    const ringTex = canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 30, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,210,63,0)'); g.addColorStop(0.55, 'rgba(255,210,63,0.95)'); g.addColorStop(0.7, 'rgba(255,240,180,1)'); g.addColorStop(1, 'rgba(255,210,63,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
    this.ctrlRing = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.ctrlRing.rotation.x = -Math.PI / 2; this.ctrlRing.position.y = 0.04; this.ctrlRing.renderOrder = 3; s.add(this.ctrlRing);
    // your opponent's player (when the other side is a person): red ring and a red arrow, like Madden
    const oppTex = canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 30, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,60,80,0)'); g.addColorStop(0.55, 'rgba(255,60,80,0.9)'); g.addColorStop(0.7, 'rgba(255,170,180,1)'); g.addColorStop(1, 'rgba(255,60,80,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
    this.oppRing = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: oppTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.oppRing.rotation.x = -Math.PI / 2; this.oppRing.position.y = 0.035; this.oppRing.renderOrder = 3; this.oppRing.visible = false; s.add(this.oppRing);
    const oppG = new THREE.ConeGeometry(0.2, 0.38, 3); oppG.rotateX(Math.PI);
    this.oppArrow = new THREE.Mesh(oppG, new THREE.MeshBasicMaterial({ color: 0xff3d50, toneMapped: false })); this.oppArrow.visible = false; s.add(this.oppArrow);
    const arrowG = new THREE.ConeGeometry(0.22, 0.42, 3); arrowG.rotateX(Math.PI);
    this.ctrlArrow = new THREE.Mesh(arrowG, new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false })); s.add(this.ctrlArrow);
    const tgtTex = canvasTex(128, 128, (c) => {
      c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.arc(64, 64, 30, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 8, 0, Math.PI * 2); c.fill();
    });
    this.target = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: tgtTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.target.rotation.x = -Math.PI / 2; this.target.position.y = 0.05; this.target.renderOrder = 3; s.add(this.target);
    // receiver key badges: drawn big and kept a fixed size on screen, so they stay sharp and readable however far away the receiver is
    this.badgeTex = (n, label) => { const t = canvasTex(256, 256, (c) => {
      const col = ['#16a34a', '#2563eb', '#ea580c', '#9333ea', '#ca8a04'][n - 1];
      c.beginPath(); c.arc(128, 128, 112, 0, Math.PI * 2); c.fillStyle = '#000'; c.fill();
      c.beginPath(); c.arc(128, 128, 100, 0, Math.PI * 2); c.fillStyle = col; c.fill();
      c.lineWidth = 12; c.strokeStyle = '#fff'; c.stroke();
      c.font = `900 ${String(label).length > 1 ? 104 : 150}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 14; c.strokeStyle = '#000'; c.strokeText(String(label), 128, 138);
      c.fillStyle = '#fff'; c.fillText(String(label), 128, 138);
    }); t.anisotropy = 4; return t; };
    this.badges = [1, 2, 3, 4, 5].map(n => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badgeTex(n, n), depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
      sp.scale.set(0.062, 0.062, 1); sp.renderOrder = 10; s.add(sp); return sp;
    });
  }

  // ======================= PLAYERS =======================
  kit(ti, away, uk) {
    if (uk) return { ...TEAMS[ti], jersey: uk.jersey, pants: uk.pants, helmet: uk.helmet, trim: uk.trim, num: uk.num || '#ffffff' };
    return away ? awayKit(TEAMS[ti], this.teams ? TEAMS[this.teams[0]] : null) : TEAMS[ti];
  }
  // custom uniform from the Locker Room: patterned jersey texture with an optional chest patch
  kitTex(uk) {
    const key = JSON.stringify(uk); this._kt = this._kt || {};
    if (this._kt[key]) return this._kt[key];
    const t = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = uk.jersey; c.fillRect(0, 0, w, h);
      const P = uk.pattern;
      if (P === 'gradient') { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, uk.trim); g.addColorStop(1, uk.jersey); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      else if (P === 'stripes') { c.fillStyle = uk.trim; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 10, h); }
      else if (P === 'camo') { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 70; i++) { c.fillStyle = [uk.trim, shadeHex(uk.jersey, -0.35), shadeHex(uk.jersey, 0.25)][i % 3]; c.beginPath(); const x = r() * w, y = r() * h; for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = 10 + r() * 18; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); } c.fill(); } }
      else if (P === 'chrome') { const g = c.createLinearGradient(0, 0, w, h); [0, 0.3, 0.5, 0.7, 1].forEach((o, i) => g.addColorStop(o, i % 2 ? '#ffffff' : uk.jersey)); c.fillStyle = g; c.globalAlpha = 0.65; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
      else if (P === 'galaxy') { const g = c.createRadialGradient(w * 0.6, h * 0.4, 10, w / 2, h / 2, w * 0.7); g.addColorStop(0, uk.trim); g.addColorStop(0.5, uk.jersey); g.addColorStop(1, '#05030f'); c.fillStyle = g; c.fillRect(0, 0, w, h); let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; c.fillStyle = '#fff'; for (let i = 0; i < 160; i++) { c.globalAlpha = 0.4 + r() * 0.6; c.fillRect(r() * w, r() * h, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1); } c.globalAlpha = 1; }
      if (uk.patch && uk.patch !== 'none') {
        c.save(); c.translate(w * 0.62, h * 0.32); c.fillStyle = uk.trim; c.strokeStyle = '#000'; c.lineWidth = 2;
        const shapes = { star: () => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 6 : 14; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); },
          crown: () => { c.beginPath(); c.moveTo(-14, 8); c.lineTo(-14, -6); c.lineTo(-7, 2); c.lineTo(0, -10); c.lineTo(7, 2); c.lineTo(14, -6); c.lineTo(14, 8); c.closePath(); },
          bolt: () => { c.beginPath(); c.moveTo(4, -14); c.lineTo(-8, 2); c.lineTo(0, 2); c.lineTo(-4, 14); c.lineTo(8, -2); c.lineTo(0, -2); c.closePath(); },
          flame: () => { c.beginPath(); c.moveTo(0, 14); c.bezierCurveTo(-14, 6, -6, -6, 0, -14); c.bezierCurveTo(2, -4, 14, 0, 0, 14); c.closePath(); } };
        (shapes[uk.patch] || shapes.star)(); c.fill(); c.stroke(); c.restore();
      }
    });
    return (this._kt[key] = t);
  }
  teamMats(ti, away = false, uk = null) {
    this._tm = this._tm || {};
    const ck = ti + (uk ? 'k' + JSON.stringify(uk) : away ? 'a' + (this.teams ? this.teams[0] : '') : '');
    if (this._tm[ck]) return this._tm[ck];
    const t = this.kit(ti, away, uk);
    const m = {
      jersey: uk ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.kitTex(uk), roughness: uk.pattern === 'chrome' ? 0.25 : 0.62, metalness: uk.pattern === 'chrome' ? 0.45 : 0, bumpMap: this.fabric(), bumpScale: 0.6 }) : new THREE.MeshStandardMaterial({ color: t.jersey, roughness: 0.62, bumpMap: this.fabric(), bumpScale: 0.6 }),
      pants: new THREE.MeshStandardMaterial({ color: t.pants, roughness: 0.48, metalness: 0.05 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: t.helmet, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ color: vis(t, 'trim') === vis(t, 'jersey') ? '#ffffff' : t.trim, roughness: 0.6 }),
      sock: new THREE.MeshStandardMaterial({ color: t.jersey === '#121a14' ? '#0b0f0c' : t.jersey, roughness: 0.7 }),
      glove: new THREE.MeshStandardMaterial({ color: vis(t, 'trim'), roughness: 0.5 }),
    };
    this._tm[ck] = m; return m;
  }

  helmetDecal(ti) {
    this._hd = this._hd || {};
    if (this._hd[ti]) return this._hd[ti];
    const tex = canvasTex(128, 128, (c) => drawLogo(c, ti, 124, 2, 2));
    return (this._hd[ti] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  }

  // smooth tapered limb / body part, built by spinning a profile around Y (top at y=0, going down)
  lathe(key, pts, seg = 14) {
    this._geo = this._geo || {};
    if (!this._geo[key]) this._geo[key] = new THREE.LatheGeometry(pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), seg);
    return this._geo[key];
  }
  limbGeo(key, rTop, rMid, rBot, len) {
    const p = [[0.0001, rTop * 0.7], [rTop * 0.72, rTop * 0.5], [rTop, 0], [rMid, -len * 0.45], [rBot, -len], [rBot * 0.7, -len - rBot * 0.5], [0.0001, -len - rBot * 0.75]];
    return this.lathe(key, p);
  }
  fabric() {
    if (this._fab) return this._fab;
    const t = canvasTex(128, 128, (c) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 128; x += 4) { c.fillStyle = '#a8a8a8'; c.fillRect(x, y, 2, 2); }
    }, false);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
    return (this._fab = t);
  }
  numTex(num, col, outline) {
    const t = canvasTex(128, 128, (c) => {
      c.font = '900 104px "Big Shoulders Display", Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = outline; c.strokeText(String(num), 64, 70);
      c.fillStyle = col; c.fillText(String(num), 64, 70);
    });
    return t;
  }
  nameTex(name, col, outline) {
    return canvasTex(256, 48, (c) => {
      const txt = String(name || '').toUpperCase();
      let size = 40; c.font = `900 ${size}px "Big Shoulders Display", Impact, sans-serif`;
      while (c.measureText(txt).width > 236 && size > 18) { size -= 2; c.font = `900 ${size}px "Big Shoulders Display", Impact, sans-serif`; }
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = 6; c.strokeStyle = outline; c.strokeText(txt, 128, 26);
      c.fillStyle = col; c.fillText(txt, 128, 26);
    });
  }
  // a decal that wraps around the oval torso (front number, back number, nameplate)
  wrapDecal(tex, r, h, y, center, arc, zs) {
    const map = tex.clone(); map.needsUpdate = true;
    const g = new THREE.CylinderGeometry(r, r, h, 16, 1, true, center - arc / 2, arc);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.scale.z = zs; m.position.y = y;
    return m;
  }

  makePlayer(teamIdx, role, num, size, fseed = 1, last = '', away = false, uk = null) {
    const t = this.kit(teamIdx, away, uk);
    const M = this.teamMats(teamIdx, away, uk);
    this._curKit = uk;
    const F = faceParams(fseed);
    const skin = new THREE.MeshStandardMaterial({ color: F.skin, roughness: 0.55 });
    const faceMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => drawFaceTexture(c, w, h, fseed)), roughness: 0.6 });
    const white = this._white || (this._white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
    const sleeve = (num % 5 === 0) ? (this._sleeve || (this._sleeve = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5 }))) : skin;
    const mask = this._mask || (this._mask = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.3, metalness: 0.7 }));
    const black = this._black || (this._black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45 }));
    const dark = this._dark || (this._dark = new THREE.MeshBasicMaterial({ color: 0x050505 }));
    const outline = vis(t, 'trim') === t.num ? '#000' : vis(t, 'trim');
    const nTex = this.numTex(num, t.num, outline);
    const big = size > 1.1;
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body); body.position.y = 1.0;
    const torso = new THREE.Group(); body.add(torso);
    const mesh = (g, m) => new THREE.Mesh(g, m);
    // on the Chromebook setting the little details are skipped: far fewer draw calls per player
    const lite = this.quality === 'potato';
    const det = (g, m) => (lite ? new THREE.Object3D() : mesh(g, m));

    // hips + pants
    const hips = mesh(this.lathe('hips2', [[0.0001, 0.24], [0.2, 0.23], [0.215, 0.12], [0.222, 0.0], [0.2, -0.1], [0.0001, -0.15]], 18), M.pants);
    hips.scale.z = 0.74; hips.position.y = 0.0; body.add(hips);
    const belt = det(new THREE.CylinderGeometry(0.208, 0.21, 0.04, 18, 1, true), black); belt.scale.z = 0.75; belt.position.y = 0.2; body.add(belt);
    const legs = [];
    for (const sx of [-0.125, 0.125]) {
      const hip = new THREE.Group(); hip.position.set(sx, -0.02, 0); body.add(hip);
      const thigh = mesh(this.limbGeo('thigh', 0.13, 0.115, 0.085, 0.42), M.pants); hip.add(thigh);
      const stripe = det(new THREE.BoxGeometry(0.018, 0.4, 0.06), M.trim); stripe.position.set(sx > 0 ? 0.118 : -0.118, -0.2, 0); hip.add(stripe);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      const kpad = det(new THREE.SphereGeometry(0.075, 12, 8), M.pants); kpad.position.set(0, 0.0, 0.035); kpad.scale.set(1.05, 0.95, 0.85); knee.add(kpad);
      const calf = mesh(this.lathe('calf', [[0.0001, 0.05], [0.068, 0.03], [0.08, -0.02], [0.088, -0.12], [0.068, -0.26], [0.052, -0.38], [0.0001, -0.42]]), M.sock); knee.add(calf);
      const sockTop = det(new THREE.CylinderGeometry(0.083, 0.087, 0.05, 12), M.trim); sockTop.position.y = -0.1; knee.add(sockTop);
      const cleat = new THREE.Group(); cleat.position.set(0, -0.43, 0.05); knee.add(cleat);
      const upper = det(new THREE.SphereGeometry(0.075, 14, 10), num % 3 === 1 ? white : black); upper.scale.set(1.05, 0.72, 1.95); upper.position.set(0, 0.0, 0.02); cleat.add(upper);
      const sole = det(new RoundedBoxGeometry(0.15, 0.03, 0.3, 2, 0.012), num % 3 === 1 ? black : white); sole.position.set(0, -0.045, 0.02); cleat.add(sole);
      const swoosh = det(new THREE.BoxGeometry(0.158, 0.02, 0.13), M.trim); swoosh.position.set(0, 0.0, 0.0); cleat.add(swoosh);
      legs.push({ hip, knee });
    }

    // torso: tapered jersey with real shoulder pads on top
    const tz = 0.68;
    const jersey = mesh(this.lathe('jersey', [[0.0001, 0.86], [0.2, 0.84], [0.275, 0.72], [0.28, 0.56], [0.255, 0.36], [0.225, 0.2], [0.215, 0.1], [0.0001, 0.08]], 20), M.jersey);
    jersey.scale.z = tz; torso.add(jersey);
    const chest = jersey;
    const pads = mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.jersey); pads.scale.set(1.4, 0.5, 0.8); pads.position.y = 0.73; torso.add(pads);
    const collar = det(new THREE.TorusGeometry(0.105, 0.028, 8, 18), M.trim); collar.rotation.x = Math.PI / 2; collar.position.y = 0.92; torso.add(collar);
    if (!lite) torso.add(this.wrapDecal(nTex, 0.283, 0.36, 0.5, 0, 1.25, tz));
    torso.add(this.wrapDecal(nTex, 0.283, 0.34, 0.43, Math.PI, 1.25, tz));
    if (last && !lite) { const nm = this.nameTex(last, t.num, outline); torso.add(this.wrapDecal(nm, 0.284, 0.07, 0.655, Math.PI, 1.5, tz)); }
    if (!lite) for (const sx of [-1, 1]) {
      const sn = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ map: nTex, transparent: true, depthWrite: false }));
      sn.position.set(sx * 0.35, 0.86, 0); sn.rotation.set(-Math.PI / 2, 0, 0); sn.rotation.order = 'YXZ'; sn.rotation.z = sx * 0.35; torso.add(sn);
    }
    const neck = det(new THREE.CylinderGeometry(0.075, 0.095, 0.16, 12), skin); neck.position.y = 0.97; torso.add(neck);
    if (big || role === 'LB') { const roll = det(new THREE.TorusGeometry(0.13, 0.055, 8, 18), M.jersey); roll.rotation.x = Math.PI / 2; roll.position.y = 0.93; torso.add(roll); }
    if (!big && num % 4 === 0) { const towel = det(new THREE.PlaneGeometry(0.09, 0.22), this._towel || (this._towel = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9, side: THREE.DoubleSide }))); towel.position.set(0.12, -0.02, 0.17); towel.rotation.x = 0.15; body.add(towel); }

    // head + helmet
    const head = new THREE.Group(); head.position.y = 1.15; torso.add(head);
    const shellGeo = this._shellGeo || (this._shellGeo = [
      new THREE.SphereGeometry(0.235, 28, 9, 0, Math.PI * 2, 0, 1.12),
      new THREE.SphereGeometry(0.235, 28, 12, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 1.12, 1.32),
    ]);
    if (lite) { const sh = mesh(this._shellLite || (this._shellLite = new THREE.SphereGeometry(0.235, 14, 8, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, 2.44)), M.helmet); sh.scale.set(0.98, 1.0, 1.12); sh.position.z = -0.02; head.add(sh); }
    else for (const gq of shellGeo) { const sh = mesh(gq, M.helmet); sh.scale.set(0.98, 1.0, 1.12); sh.position.z = -0.02; head.add(sh); }
    const liner = det(new THREE.SphereGeometry(0.222, 16, 10), this._liner || (this._liner = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, side: THREE.BackSide })));
    liner.scale.set(0.98, 1, 1.1); liner.position.z = -0.02; head.add(liner);
    const face = mesh(new THREE.SphereGeometry(0.165, 24, 18), faceMat); face.position.set(0, -0.045, 0.075); face.scale.set(0.95, 1.08, 0.85); head.add(face);
    for (const sx of [-1, 1]) { const dec = det(new THREE.CircleGeometry(0.085, 20), this.helmetDecal(teamIdx)); dec.position.set(sx * 0.231, 0.07, -0.06); dec.rotation.y = sx * Math.PI / 2; head.add(dec); }
    const strip = det(new THREE.TorusGeometry(0.238, 0.022, 6, 28, Math.PI), M.trim); strip.rotation.y = Math.PI / 2; strip.scale.set(1.12, 1, 1); strip.position.z = -0.02; head.add(strip);
    for (const sx of [-1, 1]) { const ear = det(new THREE.CircleGeometry(0.035, 12), dark); ear.position.set(sx * 0.236, -0.03, 0.02); ear.rotation.y = sx * Math.PI / 2; head.add(ear); }
    // facemask cage: three curved bars, two uprights, and side mounts
    for (const [y, r] of (lite ? [[-0.095, 0.205]] : [[-0.02, 0.215], [-0.095, 0.205], [-0.165, 0.17]])) {
      const bar = mesh(new THREE.TorusGeometry(r, 0.013, 6, 20, Math.PI * 0.82), mask);
      bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.09); bar.position.set(0, y, 0.04); head.add(bar);
    }
    for (const sx of [-0.055, 0.055]) { const vb = det(new THREE.CylinderGeometry(0.011, 0.011, 0.16, 6), mask); vb.position.set(sx, -0.09, 0.248); vb.rotation.x = -0.12; head.add(vb); }
    for (const sx of [-1, 1]) { const mt = det(new THREE.SphereGeometry(0.022, 8, 6), mask); mt.position.set(sx * 0.2, -0.03, 0.09); head.add(mt); }
    const chin = det(new THREE.TorusGeometry(0.085, 0.017, 6, 14, Math.PI), white); chin.rotation.set(Math.PI, 0, 0); chin.position.set(0, -0.16, 0.12); chin.scale.set(1, 0.6, 1); head.add(chin);
    if (num % 3 === 0) {
      const visor = det(new THREE.SphereGeometry(0.236, 18, 8, Math.PI / 2 - 0.75, 1.5, 1.25, 0.38), (this._curKit && this._curKit.visor && this._curKit.visor !== 'none' ? (this._visorK = this._visorK || {}, this._visorK[this._curKit.visor] || (this._visorK[this._curKit.visor] = new THREE.MeshPhysicalMaterial({ color: this._curKit.visor, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 }))) : this._visor || (this._visor = new THREE.MeshPhysicalMaterial({ color: 0x223355, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.82 }))));
      visor.position.z = -0.02; visor.scale.set(0.98, 1, 1.12); head.add(visor);
    }

    // arms: jersey sleeve over the pad, then muscle, wrist tape and a proper glove
    const arms = [];
    for (const sx of [-0.4, 0.4]) {
      const sh = new THREE.Group(); sh.position.set(sx, 0.77, 0); torso.add(sh);
      const cap0 = det(new THREE.SphereGeometry(0.15, 16, 12), M.jersey); cap0.scale.set(1.0, 0.9, 1.0); sh.add(cap0);
      const sleeveTop = det(this.limbGeo('sleeve', 0.105, 0.098, 0.09, 0.14), M.jersey); sleeveTop.position.y = -0.04; sh.add(sleeveTop);
      const sstripe = det(new THREE.CylinderGeometry(0.104, 0.104, 0.03, 14, 1, true), M.trim); sstripe.position.y = -0.13; sh.add(sstripe);
      const bicep = mesh(this.limbGeo('bicep', 0.085, 0.084, 0.062, 0.2), sleeve); bicep.position.y = -0.16; sh.add(bicep);
      const elbow = new THREE.Group(); elbow.position.y = -0.37; sh.add(elbow);
      const fore = mesh(this.limbGeo('fore', 0.066, 0.064, 0.048, 0.22), sleeve); elbow.add(fore);
      const band = det(new THREE.CylinderGeometry(0.056, 0.058, 0.07, 12), num % 2 ? white : M.trim); band.position.y = -0.22; elbow.add(band);
      const glove = new THREE.Group(); glove.position.y = -0.3; elbow.add(glove);
      const palm = det(new RoundedBoxGeometry(0.07, 0.09, 0.045, 2, 0.02), M.glove); glove.add(palm);
      const fingers = det(new RoundedBoxGeometry(0.068, 0.06, 0.036, 2, 0.016), M.glove); fingers.position.set(0, -0.065, 0.008); fingers.rotation.x = 0.35; glove.add(fingers);
      const thumb = det(new THREE.CapsuleGeometry(0.016, 0.04, 3, 6), M.glove); thumb.position.set(sx > 0 ? -0.045 : 0.045, -0.02, 0.02); thumb.rotation.z = sx > 0 ? 0.6 : -0.6; glove.add(thumb);
      arms.push({ sh, elbow });
    }
    const wide = size, tall = 0.97 + (size - 1) * 0.25;
    root.scale.set(wide, tall, wide);
    if (big) torso.scale.set(1.06, 1, 1.12);
    root.traverse(o => { if (o.isMesh && o.material !== dark && !o.material.transparent) o.castShadow = true; });
    const blob = this.blob(0.7 * size); this.scene.add(blob);
    this.scene.add(root);
    return {
      root, body, torso, head, legs, arms, blob, hips,
      phase: Math.random() * 6, look: 0, chest, cel: num % 5, j: { lean: 0, roll: 0, drop: 0, fall: 0, twist: 0, hipTwist: 0, lh: [0, 0], lk: [0, 0], as: [0, 0], az: [0, 0], ae: [0, 0], jump: 0, headX: 0 },
      throwT: 0, celT: Math.random() * 2,
    };
  }

  blob(r) {
    if (!this._blobTex) this._blobTex = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: this._blobTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.renderOrder = 1;
    return m;
  }

  getMesh(team, unit, role, num, size, fseed, name) {
    const uk = this.userKit && team === this.userSlot ? this.userKit : null;   // your Locker Room uniform on your own team
    const key = `${this.teams[team]}-${team}-${unit}-${role}-${num}-${fseed || 0}${uk ? '-k' + JSON.stringify(uk) : ''}`;
    let m = this.pmeshes.get(key);
    if (!m) { const last = String(name || '').replace(/^.\.\s*/, ''); m = this.makePlayer(this.teams[team], role, num, size, fseed || (num * 7919 + this.teams[team] * 104729), last, team === 1, uk); this.pmeshes.set(key, m); }   // team slot 1 wears the away uniform
    return m;
  }

  // free everything a player owned (geometry, face/number/name textures) so long sessions don't run out of memory
  clearPlayers() {
    const sharedGeo = new Set([...Object.values(this._geo || {}), ...(this._shellGeo || []), this._shellLite].filter(Boolean));
    const keepMaps = new Set([this._fab, this._blobTex, ...Object.values(this._hd || {}).map(m => m && m.map)].filter(Boolean));
    const keepMats = new Set([this._liner, this._visor, this._towel, ...Object.values(this._hd || {})].filter(Boolean));
    for (const tm of Object.values(this._tm || {})) for (const mt of Object.values(tm)) keepMats.add(mt);
    const done = new Set();
    const free = (o) => {
      if (o.geometry && !sharedGeo.has(o.geometry) && !done.has(o.geometry)) { done.add(o.geometry); o.geometry.dispose(); }
      const mt = o.material;
      if (mt && !Array.isArray(mt) && !keepMats.has(mt) && !done.has(mt)) {
        done.add(mt);
        if (mt.map && !keepMaps.has(mt.map) && !done.has(mt.map)) { done.add(mt.map); mt.map.dispose(); }
        mt.dispose();   // (a shared material that gets disposed is simply rebuilt the next time it's drawn)
      }
    };
    for (const m of this.pmeshes.values()) { this.scene.remove(m.root); this.scene.remove(m.blob); m.root.traverse(free); free(m.blob); }
    this.pmeshes.clear();
  }

  setTeams(teams) {
    if (this.teams && this.teams[0] === teams[0] && this.teams[1] === teams[1]) return;
    this.clearPlayers();
    this.teams = teams.slice();
    this.drawField(teams);
    this.drawRibbon(teams);
    this.colorCrowd(teams);
    this.drawBoard(null);
    colorSidelines(this, teams); colorFlags(this, teams);
  }

  // re-draw text canvases once web fonts have loaded
  refreshText() { this._hd = {}; if (this.teams) { const t = this.teams; this.teams = null; this.setTeams(t); } }

  event(e) {
    if (e === 'tackle') this.shake = Math.max(this.shake, 0.22);
    if (e === 'bighit') { this.shake = Math.max(this.shake, 0.4); this.hypeTarget = Math.max(this.hypeTarget, 0.5); this._hypeHold = 1.4; }
    if (e === 'td' || e === 'score') { this.hypeTarget = 1; this._hypeHold = 4.5; }
    if (e === 'int') { this.hypeTarget = 0.85; this._hypeHold = 3; }
    if (e === 'brokentackle' || e === 'firstdown') { this.hypeTarget = Math.max(this.hypeTarget, 0.55); this._hypeHold = 1.6; }
    if (e === 'catch') { this.hypeTarget = Math.max(this.hypeTarget, 0.4); this._hypeHold = 1.2; }
  }

  // ======================= PER FRAME =======================
  ambient(dt) {
    this.time += dt;
    if (this._hypeHold > 0) { this._hypeHold -= dt; if (this._hypeHold <= 0) this.hypeTarget = 0.15; }
    this.hype = damp(this.hype, this.hypeTarget, 3, dt);
    if (this.crowdU) { this.crowdU.uTime.value = this.time; this.crowdU.uHype.value = this.hype; }
    if (this.ribbonTex) this.ribbonTex.offset.x = (this.time * 0.03) % 1;
    if (this.precip) this.stepWeather(dt);
    waveFlags(this);
    if (this.side) updateSidelines(this, this._lastS, dt);
  }

  // receiver icons show 1 2 3 on keyboard, or the controller's buttons
  setBadgeLabels(labels) {
    const key = labels.join(); if (this._badgeKey === key) return; this._badgeKey = key;
    this.badges.forEach((sp, i) => { const old = sp.material.map; sp.material.map = this.badgeTex(i + 1, labels[i]); sp.material.needsUpdate = true; if (old) old.dispose(); });
  }

  update(S, dt, local) {
    this._lastS = S;
    if (S.wx && (S.wx !== this.wx || S.tod !== this.tod)) this.setWeather(S.wx, S.tod);
    this.ambient(dt);
    if (!this.teams) return;
    const used = new Set();
    const ctrlId = local >= 0 ? S.ctrl[local] : -1;
    const carrier = S.b[3] === 0 ? S.b[5] : -1;
    S.pl.forEach((p, i) => {
      const [team, isOff, role, num, x, z, face, spd, flags, , size] = p;
      const m = this.getMesh(team, isOff ? 'off' : 'def', role, num, size, p[14], p[11]);
      used.add(m);
      m.root.visible = true; m.blob.visible = true; m.side = team;
      m.root.position.set(x, 0, z);
      m.root.rotation.y = face;
      m.blob.position.set(x, 0.015, z);
      this.animate(m, S, role, spd, flags, i === carrier && S.ph !== 'presnap', dt);
      // eyes on the ball: turn the head toward it (within reason)
      if (!(flags & 1) && i !== carrier) {
        let a = Math.atan2(S.b[0] - x, S.b[2] - z) - face; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
        const want = Math.max(-1, Math.min(1, a)) * (Math.abs(a) < 2.4 ? 1 : 0);
        m.look = damp(m.look, want, 6, dt);
      } else m.look = damp(m.look, 0, 6, dt);
      m.head.rotation.y = m.look;
      m.chest.scale.y = 1 + Math.sin(this.time * 2.2 + m.celT) * 0.012;
    });
    for (const m of this.pmeshes.values()) if (!used.has(m)) { m.root.visible = false; m.blob.visible = false; }

    const [bx, by, bz, bstate, tgt, bc] = S.b;
    this.ball.position.set(bx, by, bz);
    { const sc = this.ballBoost ? 1.9 : 1; if (this.ball.scale.x !== sc) this.ball.scale.setScalar(sc); }   // easier to follow in clips
    this.ballGlow.visible = !!this.ballBoost; if (this.ballBoost) { this.ballGlow.position.set(bx, by, bz); const p = 1.5 + Math.sin(this.time * 6) * 0.15; this.ballGlow.scale.set(p, p, 1); }
    if (bstate === 1 || bstate === 2 || bstate === 3) {
      this.ball.rotation.z += dt * 20;
      const dx = (this._pbx !== undefined ? bx - this._pbx : 0), dz = (this._pbz !== undefined ? bz - this._pbz : 0), dy = by - (this._pby ?? by);
      const h = Math.hypot(dx, dz);
      if (h > 0.001) { this.ball.rotation.y = Math.atan2(dx, dz); this.ball.rotation.x = -Math.atan2(dy, h) * 0.8; }
    } else if (S.ph === 'presnap') {
      this.ball.rotation.set(0, S.poss === 0 ? 0 : Math.PI, 0); this.ball.position.y = 0.17;
    } else {
      const c = bc >= 0 && S.pl[bc];
      this.ball.rotation.set(0.5, c ? c[6] : 0, 0);
    }
    this._pbx = bx; this._pbz = bz; this._pby = by;

    this.target.visible = !!tgt;
    if (tgt) { this.target.position.set(tgt[0], 0.05, tgt[1]); const s = 1 + Math.sin(this.time * 10) * 0.1; this.target.scale.set(s, s, s); this.target.rotation.z += dt; }

    this.losLine.position.z = S.ph === 'presnap' || S.ph === 'dead' ? S.los : S.plos;
    this.fdLine.position.z = S.fd;
    const goal = (S.poss === 0 && S.fd >= 100) || (S.poss === 1 && S.fd <= 0);
    this.fdLine.visible = !goal && S.ph !== 'kick' && S.ph !== 'gameover';
    this.losLine.visible = S.ph !== 'kick' && S.ph !== 'gameover';

    const cp = ctrlId >= 0 ? S.pl[ctrlId] : null;
    const showCtrl = !!cp && S.ph !== 'kick' && S.ph !== 'gameover';
    this.ctrlRing.visible = showCtrl; this.ctrlArrow.visible = showCtrl;
    if (cp) {
      this.ctrlRing.position.set(cp[4], 0.04, cp[5]); const pulse = 1 + Math.sin(this.time * 6) * 0.06; this.ctrlRing.scale.set(pulse * cp[10], pulse * cp[10], 1);
      this.ctrlArrow.position.set(cp[4], 3.0 + Math.sin(this.time * 5) * 0.1, cp[5]); this.ctrlArrow.rotation.y += dt * 3;
    }

    { const other = local >= 0 ? 1 - local : -1, oid = other >= 0 && S.humans && S.humans[other] && S.ctrl ? S.ctrl[other] : -1, op = oid >= 0 ? S.pl[oid] : null;
      const showOpp = !!op && S.ph !== 'kick' && S.ph !== 'gameover' && S.ph !== 'kickset';
      this.oppRing.visible = showOpp; this.oppArrow.visible = showOpp;
      if (op) { this.oppRing.position.set(op[4], 0.035, op[5]); this.oppRing.scale.set(op[10], op[10], 1); this.oppArrow.position.set(op[4], 3.0, op[5]); this.oppArrow.rotation.y -= dt * 3; } }
    const showBadges = local >= 0 && S.off === local && ((S.ph === 'presnap' && S.poss === local) || S.canThrow);
    const rroles = ['WR1', 'WR2', 'RB', 'TE', 'WR3'];
    this.badges.forEach((sp, k) => {
      const p = showBadges && S.pl.find(q => q[1] === 1 && q[2] === rroles[k] && q[0] === local);
      sp.visible = !!p;
      if (p) sp.position.set(p[4], 3.25 + Math.sin(this.time * 4 + k) * 0.08, p[5]);
    });

    const showRoutes = local >= 0 && S.ph === 'presnap' && S.poss === local && !!S.opDef;
    const rk = showRoutes ? `${S.id}-${S.op}` : '';
    if (rk !== this.routeKey) { this.routeKey = rk; this.buildRoutes(S, local, showRoutes); }

    const bk = `${S.sc}|${S.q}|${Math.ceil(S.clk)}|${S.msg && S.msg.big ? S.msg.text : ''}`;
    if (bk !== this.boardKey && this.time - (this._boardT || 0) > 0.25) { this.boardKey = bk; this._boardT = this.time; this.drawBoard(S); }

    this.updateOfficials(S, dt);
    this.updateCamera(S, dt, local);
  }

  animate(m, S, role, spd, flags, hasBall, dt) {
    const j = m.j;
    const fallen = flags & 1, diving = flags & 2, juking = flags & 4, engaged = flags & 8, throwing = flags & 16, reaching = flags & 32, celebrating = flags & 64, scorer = flags & 128;
    const spinning = flags & 256, stiffing = flags & 512, hurdling = flags & 1024, leaping = flags & 2048, pressing = flags & 4096;
    const wrapping = flags & 8192, catching = flags & 16384, fallBack = flags & 32768, oneHand = flags & 65536, trucking = flags & 131072;
    const run = Math.min(1, spd / 8.5), sprint = Math.max(0, (spd - 6.5) / 2.5);
    // stride gets longer (not just faster) as speed goes up
    m.phase += dt * (2.4 + spd * 1.15);
    const ph = m.phase;
    const presnap = S.ph === 'presnap', dead = S.ph === 'dead';
    const lineman = role === 'C' || role === 'LG' || role === 'RG' || role === 'LT' || role === 'RT' || role.startsWith('DL');
    let lean = run * 0.3 + sprint * 0.12, roll = 0, drop = 0, fall = 0, twist = 0, hipTwist = 0, jump = 0, headX = 0;
    const lh = [0, 0], lk = [0.12, 0.12], as = [0.12, 0.12], az = [0.14, -0.14], ae = [0.3, 0.3];
    if (run > 0.03) {
      const sw = Math.sin(ph), amp = 0.55 + run * 0.55;
      lh[0] = -sw * amp; lh[1] = sw * amp;
      // knee folds up behind on the recovery swing, stays soft on the plant
      lk[0] = 0.18 + Math.max(0, Math.sin(ph + 1.9)) * (0.9 + run * 0.9);
      lk[1] = 0.18 + Math.max(0, Math.sin(ph + 1.9 + Math.PI)) * (0.9 + run * 0.9);
      as[0] = sw * (0.55 + run * 0.75); as[1] = -sw * (0.55 + run * 0.75);
      ae[0] = 1.15 + run * 0.45 + Math.max(0, sw) * 0.25; ae[1] = 1.15 + run * 0.45 + Math.max(0, -sw) * 0.25;
      az[0] = 0.12 + run * 0.06; az[1] = -0.12 - run * 0.06;
      twist = -sw * 0.16 * run; hipTwist = sw * 0.2 * run;
      roll = Math.cos(ph) * 0.03 * run;
      drop = 0.03 + 0.03 * run;
    } else {
      // idle: breathe and shift weight from foot to foot
      const b = Math.sin(this.time * 1.3 + m.celT * 3);
      lean = 0.06 + Math.sin(this.time * 2 + m.celT) * 0.015; lk[0] = 0.14 + Math.max(0, b) * 0.12; lk[1] = 0.14 + Math.max(0, -b) * 0.12;
      roll = b * 0.025; hipTwist = b * 0.04;
    }
    if (presnap) {
      if (lineman) {
        lean = 1.05; drop = 0.42; lh[0] = -1.15; lh[1] = -0.85; lk[0] = 1.7; lk[1] = 1.4;
        as[0] = -1.35; ae[0] = 0.05; as[1] = -0.4; ae[1] = 0.9; headX = -0.5;
      } else if (role === 'QB') { lean = 0.25; drop = 0.12; lk[0] = lk[1] = 0.45; lh[0] = lh[1] = -0.3; as[0] = as[1] = -0.7; ae[0] = ae[1] = 0.9; }
      else if (role === 'WR1' || role === 'WR2' || role === 'WR3' || role === 'CB1' || role === 'CB2') { lean = 0.45; drop = 0.15; lh[0] = -0.6; lh[1] = 0.1; lk[0] = 0.9; lk[1] = 0.6; as[0] = 0.3; as[1] = -0.4; ae[0] = ae[1] = 1.1; }
      else { lean = 0.5; drop = 0.2; lh[0] = lh[1] = -0.55; lk[0] = lk[1] = 0.95; as[0] = as[1] = -0.45; ae[0] = ae[1] = 0.6; az[0] = 0.25; az[1] = -0.25; }
    } else if (dead && run < 0.15 && !celebrating && !fallen) {
      // between plays: hands on hips, or big guys catching their breath on their knees
      if (lineman && m.cel % 2 === 0) { lean = 0.75; drop = 0.14; lk[0] = lk[1] = 0.55; lh[0] = lh[1] = -0.35; as[0] = as[1] = -0.55; ae[0] = ae[1] = 0.25; az[0] = 0.25; az[1] = -0.25; headX = -0.35; }
      else if (m.cel % 3 !== 2) { as[0] = as[1] = 0.25; ae[0] = ae[1] = 1.95; az[0] = 0.85; az[1] = -0.85; lean = 0.02; }
    }
    if (hasBall && !throwing) { as[1] = -0.3; ae[1] = 1.95; az[1] = 0.28; }
    if (engaged) { const pump = Math.sin(this.time * 9 + m.celT) * 0.12; lean = 0.6; as[0] = -1.3 + pump; as[1] = -1.3 - pump; ae[0] = ae[1] = 0.3; drop = 0.16; lk[0] = Math.max(lk[0], 0.75); lk[1] = Math.max(lk[1], 0.75); }
    if (throwing) {
      m.throwT += dt;
      const t = m.throwT;
      if (t < 0.18) { as[1] = lerp(-0.6, -2.7, t / 0.18); ae[1] = 1.5; twist = -0.6; hipTwist = -0.25; lh[0] = -0.25; }
      else { const k = Math.min(1, (t - 0.18) / 0.15); as[1] = lerp(-2.7, -0.8, k); ae[1] = lerp(1.5, 0.1, k); twist = lerp(-0.6, 0.55, k); hipTwist = lerp(-0.25, 0.25, k); lean = 0.32; lh[0] = lerp(-0.25, -0.6, k); lk[1] = 0.6; }
      as[0] = -0.7; ae[0] = 1.2; az[0] = 0.4;
    } else m.throwT = 0;
    if (reaching) {
      const by = S.b[1];
      if (by > 1.9) { as[0] = as[1] = -2.85; ae[0] = ae[1] = 0.2; az[0] = 0.22; az[1] = -0.22; headX = 0.5; lean = Math.min(lean, 0.05); }   // high: hands over the head
      else if (by > 1.05) { as[0] = as[1] = -1.6; ae[0] = ae[1] = 0.55; az[0] = -0.18; az[1] = 0.18; headX = 0.15; lean = Math.max(lean, 0.18); } // chest: hands out in a diamond
      else { as[0] = as[1] = -0.9; ae[0] = ae[1] = 0.25; az[0] = -0.2; az[1] = 0.2; headX = -0.25; lean = Math.max(lean, 0.45); drop += 0.12; } // low: scoop it
    }
    if (juking) { const side = Math.sin(ph * 0.5) > 0 ? 1 : -1; roll = 0.38 * side; drop += 0.1; lk[0] += 0.3; lk[1] += 0.3; }
    if (trucking) { lean = Math.max(lean, 0.55); drop += 0.08; as[0] = -0.6; ae[0] = 1.5; az[0] = 0.5; headX = -0.15; }   // shoulder down, ball tucked
    if (stiffing) { as[0] = -1.6; ae[0] = 0.04; az[0] = 0.12; lean = 0.25; twist = 0.25; }
    if (pressing) { as[0] = as[1] = -1.45; ae[0] = ae[1] = 0.15; lean = 0.4; }
    if (hurdling) { m.hurT = (m.hurT || 0) + dt; const k = Math.min(1, m.hurT / 0.5); jump = Math.sin(k * Math.PI) * 0.85; lh[0] = -1.5; lk[0] = 0.3; lh[1] = 0.7; lk[1] = 1.5; lean = 0.55; as[0] = 0.6; as[1] = -0.8; } else m.hurT = 0;
    if (leaping) { m.leapT = (m.leapT || 0) + dt; const k = Math.min(1, m.leapT / 0.6); jump = Math.sin(k * Math.PI) * 0.75; as[0] = as[1] = -3.0; ae[0] = ae[1] = 0.15; az[0] = 0.25; az[1] = -0.25; lean = -0.1; lk[0] = 0.3 + (1 - Math.sin(k * Math.PI)) * 0.4; lk[1] = 0.9 * Math.sin(k * Math.PI) + 0.2; headX = 0.4; } else m.leapT = 0;
    if (spinning) { m.spinT = (m.spinT || 0) + dt; drop += 0.08; as[0] = as[1] = -0.2; az[0] = 0.9; az[1] = -0.9; } else m.spinT = 0;
    let fallR = 0;
    if (catching && !fallen) {
      // secure it: hands come down from the ball and tuck it into the chest
      m.catchT = (m.catchT || 0) + dt; const k = Math.min(1, m.catchT / 0.35), e = k * k * (3 - 2 * k);
      as[0] = lerp(-2.6, -0.45, e); as[1] = lerp(-2.6, -0.35, e); ae[0] = lerp(0.3, 2.1, e); ae[1] = lerp(0.3, 2.0, e); az[0] = lerp(0.15, 0.4, e); az[1] = lerp(-0.15, -0.3, e);
      drop += 0.1 * (1 - e); lean = Math.max(lean, 0.22); headX = 0.45 * (1 - e) + 0.1;
      if (oneHand) {
        // one arm fully extended snagging it, the other flung out for balance, then it's pulled in
        const h = Math.min(1, m.catchT / 0.5), eh = h * h * (3 - 2 * h);
        as[1] = lerp(-3.0, -0.35, eh); ae[1] = lerp(0.05, 2.0, eh); az[1] = lerp(-0.55, -0.3, eh);
        as[0] = lerp(0.5, -0.4, eh); ae[0] = lerp(0.4, 1.6, eh); az[0] = lerp(0.9, 0.4, eh);
        lean = Math.max(lean, 0.3); drop += 0.06 * (1 - eh);
      }
    } else m.catchT = 0;
    if (diving) {
      // launch, lay out flat with arms reaching, then skid
      m.diveT = (m.diveT || 0) + dt; const k = Math.min(1, m.diveT / 0.32);
      fall = 0.4 + 0.6 * k; jump = Math.sin(Math.min(1, m.diveT / 0.4) * Math.PI) * 0.3; fallR = 7;
      as[0] = as[1] = -3.05; ae[0] = ae[1] = 0.12; az[0] = -0.1; az[1] = 0.1;
      lh[0] = 0.3 + 0.3 * k; lh[1] = 0.15 + 0.3 * k; lk[0] = 0.12; lk[1] = 0.45 * (1 - k) + 0.15; headX = 0.7;
    } else m.diveT = 0;
    if (fallen) {
      m.downT = (m.downT || 0) + dt; const k = Math.min(1, m.downT / 0.55), e = k * k;
      fall = Math.max(fall, 0.25 + 0.75 * e); fallR = 6 + 6 * k;
      // knees buckle first, arms fly out, then he settles on the turf
      lk[0] = lerp(1.2, 0.5, k); lk[1] = lerp(0.9, 0.2, k); lh[0] = lerp(-0.4, 0.25, k); lh[1] = lerp(-0.1, -0.1, k);
      as[0] = lerp(-1.2, -2.4, k); as[1] = hasBall ? -0.3 : lerp(-0.6, -2.3, k); ae[0] = 0.4; ae[1] = hasBall ? 1.9 : 0.4; az[0] = lerp(0.9, 0.2, k); az[1] = hasBall ? 0.28 : lerp(-0.9, -0.2, k);
      drop = 0; headX = fallBack ? -0.3 : 0.3; roll = Math.sin(m.celT * 3) * 0.08 * (1 - k);
    } else m.downT = 0;
    if (wrapping) {
      // tackler: wrap both arms around the ball carrier and drive through him to the ground
      m.wrapT = (m.wrapT || 0) + dt; const k = Math.min(1, m.wrapT / 0.5);
      fall = 0.45 + 0.55 * k; fallR = 8;
      as[0] = as[1] = -1.4; ae[0] = ae[1] = 1.75; az[0] = -0.7; az[1] = 0.7;
      lh[0] = 0.55; lh[1] = -0.35 + 0.5 * k; lk[0] = 0.5; lk[1] = 1.0 - 0.6 * k; headX = 0.2; twist = 0.3;
    } else m.wrapT = 0;
    if (celebrating && !fallen) {
      m.celT += dt;
      const c = m.celT, pick = S.cel ? S.cel[m.side] : -1, kind = scorer ? (pick >= 0 ? pick : m.cel % 5) : (m.cel % 2 ? 0 : 1);
      if (kind === 0) { // jump and pump the fists
        const b = Math.abs(Math.sin(c * (scorer ? 6 : 5))); jump = b * (scorer ? 0.55 : 0.3);
        as[0] = as[1] = -2.8 + Math.sin(c * 9) * 0.25; ae[0] = ae[1] = 0.3; lean = 0; twist = Math.sin(c * 3) * 0.3; lk[0] = lk[1] = 0.3 + (1 - b) * 0.6; lh[0] = lh[1] = -(1 - b) * 0.3;
      } else if (kind === 1) { // little dance
        const s1 = Math.sin(c * 7); roll = s1 * 0.18; hipTwist = s1 * 0.35; twist = -s1 * 0.25; jump = Math.abs(Math.sin(c * 7)) * 0.08;
        as[0] = -1.2 + s1 * 0.8; as[1] = -1.2 - s1 * 0.8; ae[0] = ae[1] = 1.4; lk[0] = 0.35 + Math.max(0, s1) * 0.5; lk[1] = 0.35 + Math.max(0, -s1) * 0.5; lean = 0.05;
      } else if (kind === 2) { // flex
        as[0] = as[1] = -1.55; az[0] = 1.25; az[1] = -1.25; ae[0] = ae[1] = 2.2 + Math.sin(c * 6) * 0.15; lean = -0.12; drop = 0.08; lk[0] = lk[1] = 0.45;
      } else if (kind === 3) { // point to the sky
        as[1] = -3.0; ae[1] = 0.05; az[1] = -0.2; as[0] = 0.2; ae[0] = 0.6; lean = -0.2; headX = 0.6; twist = Math.sin(c * 1.5) * 0.2;
      } else if (kind === 4) { // spin hop
        jump = Math.abs(Math.sin(c * 4)) * 0.4; m.spinT = (c % 1.6) < 0.55 ? (c % 1.6) : 0; as[0] = as[1] = -2.5; ae[0] = ae[1] = 0.5; lk[0] = lk[1] = 0.5;
      } else if (kind === 5) { // take a bow
        const b = Math.min(1, (c % 2.4) / 0.6) * (1 - Math.max(0, ((c % 2.4) - 1.6) / 0.8));
        lean = 1.05 * b; as[0] = -0.6; az[0] = 0.45; ae[0] = 2.1; as[1] = 0.35 + b * 0.4; az[1] = -1.2; ae[1] = 0.2; lh[0] = -0.2 * b; lk[0] = lk[1] = 0.15; headX = -0.3 * b;
      } else if (kind === 7) { // dab
        const b = Math.min(1, (c % 1.8) / 0.25);
        as[0] = -2.3 * b; az[0] = 0.9 * b; ae[0] = 0.1; as[1] = -1.6 * b; az[1] = 0.6 * b; ae[1] = 2.3 * b; headX = 0.55 * b; twist = 0.35 * b; lean = 0.15 * b; lk[0] = lk[1] = 0.25;
      } else if (kind === 8) { // shuffle: quick feet and swinging arms
        const s1 = Math.sin(c * 11), s2 = Math.sin(c * 5.5);
        lk[0] = 0.3 + Math.max(0, s1) * 0.7; lk[1] = 0.3 + Math.max(0, -s1) * 0.7; lh[0] = -Math.max(0, s1) * 0.4; lh[1] = -Math.max(0, -s1) * 0.4;
        as[0] = -0.9 + s2 * 0.9; as[1] = -0.9 - s2 * 0.9; ae[0] = ae[1] = 1.6; twist = s2 * 0.3; roll = s1 * 0.06; jump = Math.abs(s1) * 0.06; lean = 0.1;
      } else { // moonwalk-style heel slide
        const s1 = Math.sin(c * 6); lk[0] = 0.25 + Math.max(0, s1) * 0.9; lk[1] = 0.25 + Math.max(0, -s1) * 0.9; lh[0] = 0.15 - Math.max(0, s1) * 0.2; lh[1] = 0.15 - Math.max(0, -s1) * 0.2;
        lean = -0.12; as[0] = -0.3 + s1 * 0.3; as[1] = -0.3 - s1 * 0.3; ae[0] = ae[1] = 1.3; roll = s1 * 0.05; twist = s1 * 0.12;
      }
    }
    const R = fallR || (fallen || diving ? 9 : 16);
    j.lean = damp(j.lean, lean, 10, dt); j.roll = damp(j.roll, roll, 10, dt); j.drop = damp(j.drop, drop, 10, dt);
    j.fall = damp(j.fall, fall, fall ? (fallR || 8) : 4, dt); j.fdir = damp(j.fdir ?? 1, fallBack ? -1 : 1, 12, dt); j.twist = damp(j.twist, twist, 14, dt); j.jump = damp(j.jump, jump, 20, dt);
    j.hipTwist = damp(j.hipTwist, hipTwist, 14, dt); j.headX = damp(j.headX, headX, 8, dt);
    for (let k = 0; k < 2; k++) {
      j.lh[k] = damp(j.lh[k], lh[k], R, dt); j.lk[k] = damp(j.lk[k], lk[k], R, dt);
      j.as[k] = damp(j.as[k], as[k], throwing ? 30 : R, dt); j.ae[k] = damp(j.ae[k], ae[k], R, dt); j.az[k] = damp(j.az[k], az[k], R, dt);
    }
    const bob = run > 0.05 ? Math.abs(Math.cos(ph)) * (0.05 + 0.04 * run) : 0;
    m.body.position.y = 1.0 - j.drop - j.fall * 0.62 + bob + j.jump;
    m.body.position.z = -j.fall * 0.15 * j.fdir;
    const spinA = m.spinT ? Math.min(1, m.spinT / 0.55) * Math.PI * 2 : 0;
    m.body.rotation.set(j.fall * 1.42 * j.fdir, spinA + j.hipTwist, j.roll);
    m.torso.rotation.set(j.lean * (1 - j.fall * 0.7), j.twist - j.hipTwist, 0);
    for (let k = 0; k < 2; k++) {
      m.legs[k].hip.rotation.x = j.lh[k] - j.lean * 0.55 * (1 - j.fall);
      m.legs[k].knee.rotation.x = j.lk[k];
      m.arms[k].sh.rotation.set(j.as[k], 0, j.az[k]);
      m.arms[k].elbow.rotation.x = -j.ae[k];
    }
    m.head.rotation.x = -j.lean * 0.6 * (1 - j.fall) - j.headX * 0.5 + (j.headX < 0 ? 0 : 0);
  }


  // ======================= OFFICIALS + FLAG =======================
  buildOfficials() {
    const stripes = canvasTex(64, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#111' : '#f4f4f4'; c.fillRect(i * 8, 0, 8, 64); } });
    stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(3, 1);
    const shirt = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    this.refs = [];
    const looks = [[3, 0xffffff], [7, 0x111111], [5, 0x111111]];
    for (let i = 0; i < 3; i++) {
      const F = faceParams(9000 + i * 77);
      const skin = new THREE.MeshStandardMaterial({ color: F.skin, roughness: 0.55 });
      const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.position.y = 1.0;
      const torso = new THREE.Group(); body.add(torso);
      const hips = new THREE.Mesh(this.lathe('hips', [[0.0001, 0.2], [0.17, 0.19], [0.235, 0.12], [0.25, 0.0], [0.23, -0.12], [0.0001, -0.16]], 16), pants); hips.scale.set(0.9, 1, 0.66); hips.position.y = 0.05; body.add(hips);
      const legs = [];
      for (const sx of [-0.11, 0.11]) {
        const hip = new THREE.Group(); hip.position.set(sx, -0.02, 0); body.add(hip);
        hip.add(new THREE.Mesh(this.limbGeo('rthigh', 0.11, 0.1, 0.075, 0.42), pants));
        const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
        knee.add(new THREE.Mesh(this.lathe('calf', [[0.0001, 0.05], [0.068, 0.03], [0.08, -0.02], [0.088, -0.12], [0.068, -0.26], [0.052, -0.38], [0.0001, -0.42]]), pants));
        const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), black); shoe.scale.set(1, 0.7, 1.9); shoe.position.set(0, -0.44, 0.05); knee.add(shoe);
        legs.push({ hip, knee });
      }
      const jersey = new THREE.Mesh(this.lathe('rjersey', [[0.0001, 0.86], [0.18, 0.84], [0.24, 0.72], [0.245, 0.5], [0.23, 0.3], [0.215, 0.12], [0.0001, 0.1]], 18), shirt);
      jersey.scale.z = 0.7; torso.add(jersey);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.14, 10), skin); neck.position.y = 0.93; torso.add(neck);
      const head = new THREE.Group(); head.position.y = 1.12; torso.add(head);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 22, 16), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => drawFaceTexture(c, w, h, 9000 + i * 77)), roughness: 0.6 })); hd.scale.set(0.95, 1.1, 1); head.add(hd);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: looks[i][1], roughness: 0.6 })); cap.position.y = 0.03; head.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), cap.material); brim.position.set(0, 0.035, 0.1); head.add(brim);
      const arms = [];
      for (const sx of [-0.3, 0.3]) {
        const sh = new THREE.Group(); sh.position.set(sx, 0.76, 0); torso.add(sh);
        sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), shirt));
        const up = new THREE.Mesh(this.limbGeo('rsleeve', 0.075, 0.07, 0.062, 0.18), shirt); sh.add(up);
        const elbow = new THREE.Group(); elbow.position.y = -0.34; sh.add(elbow);
        elbow.add(new THREE.Mesh(this.limbGeo('fore', 0.066, 0.064, 0.048, 0.22), skin));
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin); hand.position.y = -0.28; elbow.add(hand);
        arms.push({ sh, elbow });
      }
      // number on the back
      const num = canvasTex(64, 64, (c) => { c.fillStyle = '#111'; c.font = '900 52px "Big Shoulders Display", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(looks[i][0] * 7 % 99), 32, 36); });
      const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: num, transparent: true, depthWrite: false })); nb.position.set(0, 0.6, -0.175); nb.rotation.y = Math.PI; torso.add(nb);
      root.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
      const blob = this.blob(0.6); this.scene.add(blob); this.scene.add(root);
      root.visible = false; blob.visible = false;
      this.refs.push({ root, body, torso, head, legs, arms, blob, hips, phase: Math.random() * 6, look: 0, cel: 2, celT: Math.random() * 3, throwT: 0,
        j: { lean: 0, roll: 0, drop: 0, fall: 0, twist: 0, hipTwist: 0, lh: [0, 0], lk: [0, 0], as: [0, 0], az: [0, 0], ae: [0, 0], jump: 0, headX: 0 }, x: 0, z: 50, face: 0 });
    }
    // the yellow flag: weighted cloth lying on the turf
    const fm = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.8, emissive: 0x3a2e00, side: THREE.DoubleSide });
    this.flagMesh = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.42, 4, 3), fm); cloth.rotation.x = -Math.PI / 2; cloth.position.y = 0.03;
    const pos = cloth.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.03 + Math.cos(pos.getY(i) * 7) * 0.02); cloth.geometry.computeVertexNormals();
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fm); knot.position.set(0.18, 0.05, 0.1);
    this.flagMesh.add(cloth, knot); this.flagMesh.visible = false; this.scene.add(this.flagMesh);
  }
  updateOfficials(S, dt) {
    if (!this.refs) this.buildOfficials();
    const on = S.ph !== 'gameover' && S.ph !== 'half';
    const d = S.poss === 0 ? 1 : -1, los = S.ph === 'live' || S.ph === 'kick' ? S.plos : S.los;
    const bx = S.b[0], bz = S.b[2];
    const targets = [
      [S.ph === 'live' ? bx * 0.4 - 2 : -2, (S.ph === 'live' ? Math.min(los - 11 * d * 1, bz - 9 * d) * (d > 0 ? 1 : 1) : los - 12 * d)],
      [S.ph === 'live' ? bx * 0.5 : 0.5, S.ph === 'live' ? (bz + (los + 7 * d)) / 2 : los + 7 * d],
      [HALF_W + 1.4, S.ph === 'live' ? bz : los],
    ];
    if (S.ph === 'live' && d < 0) targets[0][1] = Math.max(los + 11, bz + 9);
    let flagger = -1, best = 1e9;
    if (S.fl) this.refs.forEach((r, i) => { const dd = Math.hypot(r.x - S.fl[0], r.z - S.fl[1]); if (dd < best) { best = dd; flagger = i; } });
    this.refs.forEach((r, i) => {
      r.root.visible = on; r.blob.visible = on; if (!on) return;
      const [tx, tz] = targets[i];
      const dx = tx - r.x, dz = tz - r.z, l = Math.hypot(dx, dz);
      const sp = Math.min(l * 2.2, 7.5), step = Math.min(l, sp * dt);
      if (l > 0.01) { r.x += dx / l * step; r.z += dz / l * step; }
      const faceBall = Math.atan2(bx - r.x, bz - r.z), faceMove = Math.atan2(dx, dz);
      const want = l > 1 ? faceMove : faceBall;
      let da = want - r.face; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; r.face += da * Math.min(1, dt * 6);
      r.root.position.set(r.x, 0, r.z); r.root.rotation.y = r.face; r.blob.position.set(r.x, 0.015, r.z);
      this.animate(r, { ph: 'live' }, 'REF', l > 0.3 ? sp : 0, 0, false, dt);
      if (i === flagger && S.fl) { r.arms[1].sh.rotation.set(-2.9, 0, -0.2); r.arms[1].elbow.rotation.x = -0.1; }
    });
    this.flagMesh.visible = !!S.fl;
    if (S.fl) { this.flagMesh.position.set(S.fl[0], 0, S.fl[1]); this.flagMesh.rotation.y = 0.6; }
  }

  buildRoutes(S, local, show) {
    const mats = new Set();
    while (this.routeGroup.children.length) { const c = this.routeGroup.children.pop(); c.geometry.dispose(); if (c.material) mats.add(c.material); }
    for (const m of mats) m.dispose();
    if (!show) return;
    const play = S.opDef;
    const d = S.poss === 0 ? 1 : -1;
    const cols = { WR1: 0x22c55e, WR2: 0x3b82f6, RB: 0xf97316, TE: 0xa855f7, WR3: 0xeab308, QB: 0xe5e7eb };
    const all = { ...(play.routes || {}) }; if (play.qbPath) all.QB = play.qbPath;
    for (const [role, pts] of Object.entries(all)) {
      const p = S.pl.find(q => q[1] === 1 && q[2] === role && q[0] === S.poss);
      if (!p) continue;
      const path = [[p[4], p[5]], ...pts.map(w => [Math.max(-HALF_W + 1, Math.min(HALF_W - 1, S.bx - w[0] * d)), Math.max(-8.5, Math.min(108.5, S.los + Math.min(w[1], 22) * d))])];   // route lines stay on the field
      const mat = new THREE.MeshBasicMaterial({ color: cols[role], transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
      for (let i = 0; i < path.length - 1; i++) {
        const [x1, z1] = path[i], [x2, z2] = path[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.3, len + 0.15), mat);
        seg.rotation.x = -Math.PI / 2; seg.rotation.z = Math.atan2(x2 - x1, z2 - z1);
        seg.position.set((x1 + x2) / 2, 0.035 + i * 0.001, (z1 + z2) / 2); seg.renderOrder = 2;
        this.routeGroup.add(seg);
      }
      const [ex, ez] = path[path.length - 1], [px, pz] = path[path.length - 2];
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.6, 3), mat);
      tri.rotation.x = -Math.PI / 2; tri.rotation.z = Math.atan2(-(ez - pz), ex - px); tri.position.set(ex, 0.04, ez); tri.renderOrder = 2;
      this.routeGroup.add(tri);
    }
  }

  updateCamera(S, dt, local) {
    const view = local >= 0 ? local : 0;
    const s = view === 0 ? 1 : -1;
    const [bx, , bz, bstate, tgt] = S.b;
    let fx = bx * 0.75, fz = bz;
    if (S.ph === 'presnap') { fx = S.bx * 0.6; fz = S.los + (S.poss === view ? 1 : 3) * s; }
    if (S.ph === 'kickset') { fx = S.bx; fz = S.los - 6 * (S.poss === 0 ? 1 : -1); }
    if (bstate === 1 && tgt) { fx = (bx + tgt[0]) / 2 * 0.8; fz = (bz + tgt[1]) / 2; }
    if (bstate === 2) { fx = bx * 0.5; fz = bz; }
    // on defense the camera keeps YOUR defender in the shot (between him and the ball) instead of locking onto the QB
    // on defense the camera is on YOUR defender (not the QB), so you always know where your guy is
    if (this.camMode !== 'player' && local >= 0 && S.poss !== local && S.ctrl && S.ctrl[local] >= 0 && S.pl[S.ctrl[local]] && (S.ph === 'live' || S.ph === 'presnap')) {
      const me = S.pl[S.ctrl[local]];
      fx = me[4]; fz = me[5] - 2 * s;
    }
    // player cam: follow the guy you control instead of the ball
    if (this.camMode === 'player' && local >= 0 && S.ctrl && S.ctrl[local] >= 0 && S.pl[S.ctrl[local]] && (S.ph === 'live' || S.ph === 'presnap')) {
      const me = S.pl[S.ctrl[local]];
      if (bstate === 1 && tgt && S.poss === local) { fx = (me[4] * 0.4 + tgt[0] * 0.6); fz = me[5] * 0.4 + tgt[1] * 0.6 - 3 * s; }   // ball in the air: swing toward the catch
      else { fx = me[4]; fz = me[5]; }
    }
    // locked on the guy you control; only when control jumps to someone else (throw, switch) does it take a quick glide over
    const cid = local >= 0 && S.ctrl ? S.ctrl[local] : -1;
    if (cid !== this._lastCtrl) { if (this._lastCtrl !== undefined) this._switchT = 0.45; this._lastCtrl = cid; }
    this._switchT = Math.max(0, (this._switchT || 0) - dt);
    const rate = bstate === 2 ? 2.2 : this.camMode === 'player' ? (this._switchT > 0 ? 5 : 12) : (this._switchT > 0 ? 3 : 4.5);
    const k = 1 - Math.exp(-dt * rate);
    { const cb = S.ph === 'dead' && S.celBy >= 0 ? S.pl[S.celBy] : null; if (cb) { fx = cb[4]; fz = cb[5]; } }   // somebody's dancing: go watch
    this.focus.x += (fx - this.focus.x) * k; this.focus.z += (fz - this.focus.z) * k;
    let px, py, pz, lx, ly, lz;
    if (this.camMode === 'broadcast') {
      const uz = this.userZoom;
      px = this.focus.x * 0.2 - 31 * s * uz; py = 25 * uz; pz = this.focus.z - 4 * s;
      lx = this.focus.x * 0.6 + 3 * s; ly = 0; lz = this.focus.z + 2 * s;
    } else {
      const portrait = this.cam.aspect < 1;
      const celebrate = S.ph === 'dead' && (S.celBy >= 0 || (S.msg && S.msg.big));
      const zoom = (celebrate ? 0.72 : 1) * this.userZoom * (local >= 0 && S.poss !== local && !kickingNow(S) ? 1.15 : 1);
      const kicking = S.ph === 'kickset' || S.ph === 'kick';
      const close = this.camMode === 'player' && !kicking && !celebrate;
      if (close) {
        // third-person, right over your player's shoulders, looking down the field
        px = this.focus.x * 0.96; py = (portrait ? 7 : 4.8) * zoom; pz = this.focus.z - (portrait ? 11 : 8.5) * s * zoom;
        lx = this.focus.x; ly = 1.2; lz = this.focus.z + 5.5 * s;   // your player sits in the middle of the shot, a little field ahead of him
      } else {
        px = this.focus.x * 0.93; py = (portrait ? 12 : (kicking ? 6.5 : 7.4)) * zoom; pz = this.focus.z - (portrait ? 15.5 : (kicking ? 11 : 12.5)) * s * zoom;
        lx = this.focus.x; ly = celebrate ? 1.5 : 1.1; lz = this.focus.z + (kicking ? 30 : 10 + (this.userZoom - 1) * 6) * s;
      }
    }
    const kp = 1 - Math.exp(-dt * (this.camMode === 'player' ? 10 : 5));
    this.camPos.x += (px - this.camPos.x) * kp; this.camPos.y += (py - this.camPos.y) * kp; this.camPos.z += (pz - this.camPos.z) * kp;
    if (!this._camInit) { this.camPos.set(px, py, pz); this._camInit = true; }
    this.cam.position.copy(this.camPos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const a = this.shake * 0.6; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    this.cam.lookAt(lx, ly, lz);
    this.followShadow(this.focus.x, this.focus.z + 4 * s);
  }

  followShadow(x, z) {
    this.key.position.set(x - 25, 70, z + 20);
    this.key.target.position.set(x, 0, z);
  }

  snapCamera() { this._camInit = false; }

  basis() {
    const f = new THREE.Vector3(); this.cam.getWorldDirection(f);
    f.y = 0; f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }

  pick(cx, cy, S, team) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.cam);
    let best = -1, bd = 1e9;
    S.pl.forEach((p, i) => {
      if (team >= 0 && p[0] !== team) return;
      const d = ray.ray.distanceToPoint(new THREE.Vector3(p[4], 1.3, p[5]));
      if (d < 1.6 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  render() {
    if (this.quality === 'high') this.composer.render(); else this.r.render(this.scene, this.cam);
  }
}

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
