// ENDZONE KINGS — Three.js renderer (night-game stadium, articulated players, bloom)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TEAMS, OFF_PLAYS, HALF_W } from './sim.js?v=1792197009';

const W = HALF_W * 2;
const SKIN = ['#6b4226', '#8d5524', '#a8693f', '#c68642', '#e0ac69', '#f1c27d', '#4a2c18'];
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
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = quality === 'high';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070b1f, 0.0042);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.3, 900);
    this.cam.position.set(0, 12, -20);
    this.camMode = 'behind';
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

  setQuality(q) {
    this.quality = q;
    this.r.shadowMap.enabled = q === 'high';
    this.key.castShadow = q === 'high';
    this.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.r.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio || 1, 1.75) : 1);
    if (this.fans) this.fans.forEach(f => f.count = q === 'high' ? f.userData.full : Math.floor(f.userData.full * 0.5));
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(w, h); }
    this.cam.aspect = w / h;
    this.cam.fov = w / h < 1 ? 66 : 48;
    this.cam.updateProjectionMatrix();
  }

  // ======================= WORLD =======================
  buildWorld() {
    const s = this.scene;
    s.background = canvasTex(4, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02030a'); g.addColorStop(0.5, '#070c24'); g.addColorStop(0.8, '#142055'); g.addColorStop(1, '#22306e');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    this.buildStars();

    s.add(new THREE.HemisphereLight(0x9fb6ff, 0x1d3a18, 0.6));
    const key = this.key = new THREE.DirectionalLight(0xfff3dd, 2.15);
    key.position.set(-25, 70, 35);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 10; sc.far = 160;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    s.add(key); s.add(key.target);
    const fill = new THREE.DirectionalLight(0xb9c8ff, 0.9); fill.position.set(40, 50, 120); s.add(fill);
    const rim = new THREE.DirectionalLight(0xffe2b0, 0.6); rim.position.set(30, 40, -60); s.add(rim);

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
    this.buildBenches();

    const lineGeo = new THREE.PlaneGeometry(W, 0.3);
    this.losLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.fdLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    for (const l of [this.losLine, this.fdLine]) { l.rotation.x = -Math.PI / 2; l.position.y = 0.025; l.renderOrder = 2; s.add(l); }

    this.buildBall();
    this.buildMarkers();
    this.routeGroup = new THREE.Group(); s.add(this.routeGroup);
    this.routeKey = '';
  }

  buildStars() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.9 + 0.15, R = 500;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * R; pos[i * 3 + 1] = Math.sin(ph) * R * 0.7 + 60; pos[i * 3 + 2] = 50 + Math.sin(th) * Math.cos(ph) * R;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false })));
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
        c.font = `${PX * 7}px "Bebas Neue", Impact, "Arial Black", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = PX * 0.5; c.strokeStyle = vis(t, 'trim') === vis(t, 'jersey') ? '#000' : t.trim; c.lineJoin = 'round';
        c.strokeText(t.name.toUpperCase(), 0, PX * 0.3);
        c.fillStyle = '#ffffff'; c.fillText(t.name.toUpperCase(), 0, PX * 0.3);
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
      c.font = `${PX * 3}px "Bebas Neue", Impact, "Arial Black", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
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
      c.fillStyle = '#ffc83d'; c.font = `${PX * 1.7}px "Bebas Neue", Impact, sans-serif`; c.fillText('ENDZONE KINGS', 0, PX * 2.4);
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
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x252c55, roughness: 0.85, side: THREE.DoubleSide });
    const deck = (s0, y0, s1, y1, rows) => {
      const pos = [], idx = [];
      for (let r = 0; r <= rows; r++) {
        const f = r / rows, sc = lerp(s0, s1, f), y = lerp(y0, y1, f);
        for (let i = 0; i <= N; i++) { const [x, z] = this.bowlPoint(i / N * Math.PI * 2, sc); pos.push(x, y, z); }
      }
      for (let r = 0; r < rows; r++) for (let i = 0; i < N; i++) {
        const a = r * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      s.add(new THREE.Mesh(g, seatMat));
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
    this.buildCrowd([lower, upper]);
  }

  buildCrowd(decks) {
    const bodyGeo = new THREE.BoxGeometry(0.62, 0.8, 0.42); bodyGeo.translate(0, 0.45, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.21, 1); headGeo.translate(0, 1.07, 0);
    const spots = [];
    const N = 220;
    for (const d of decks) {
      for (let r = 0; r < d.rows; r++) {
        const f = (r + 0.5) / d.rows, sc = lerp(d.s0, d.s1, f), y = lerp(d.y0, d.y1, f);
        let prev = this.bowlPoint(0, sc), acc = 0;
        for (let i = 1; i <= N * 8; i++) {
          const t = i / (N * 8) * Math.PI * 2, p = this.bowlPoint(t, sc);
          acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
          if (acc >= 1.15) { acc = 0; if (Math.random() < 0.9) spots.push([p[0], y, p[1]]); }
        }
      }
    }
    const count = spots.length;
    this.crowdU = { uTime: { value: 0 }, uHype: { value: 0.2 } };
    const mkMat = () => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdU.uTime; sh.uniforms.uHype = this.crowdU.uHype;
        sh.vertexShader = 'uniform float uTime;\nuniform float uHype;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           float jump = max(0.0, sin(uTime * (5.0 + fract(aPhase * 7.3) * 3.0) + aPhase * 6.2831));
           float idle = sin(uTime * 1.3 + aPhase * 6.2831) * 0.03;
           transformed.y += idle + jump * jump * 0.55 * uHype;
           if (position.y > 0.9) transformed.x += sin(uTime * 3.0 + aPhase * 9.0) * 0.05 * uHype;`);
      };
      return m;
    };
    const bodies = new THREE.InstancedMesh(bodyGeo, mkMat(), count);
    const heads = new THREE.InstancedMesh(headGeo, mkMat(), count);
    const phase = new Float32Array(count);
    const o = new THREE.Object3D();
    const skin = SKIN.map(c => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const [x, y, z] = spots[i];
      o.position.set(x, y, z); o.lookAt(0, y, 50);
      o.rotation.y += (Math.random() - 0.5) * 0.4;
      const sc = 0.92 + Math.random() * 0.2; o.scale.set(sc, sc, sc);
      o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix);
      heads.setColorAt(i, skin[(Math.random() * skin.length) | 0]);
      bodies.setColorAt(i, skin[0]);
      phase[i] = Math.random();
    }
    bodies.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    heads.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    bodies.frustumCulled = false; heads.frustumCulled = false;
    this.scene.add(bodies); this.scene.add(heads);
    this.crowdBodies = bodies; this.crowdSpots = spots;
    bodies.userData.full = count; heads.userData.full = count;
    this.fans = [bodies, heads];
    if (this.quality !== 'high') this.fans.forEach(f => f.count = Math.floor(count * 0.5));
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
    }
    this.crowdBodies.instanceColor.needsUpdate = true;
  }

  drawRibbon(teams) {
    const c = this.ribbonTex._canvas, x = c.getContext('2d');
    const T = teams.map(i => TEAMS[i]);
    const segs = [['ENDZONE KINGS', '#ffc83d', '#0b1030'], [T[0].name.toUpperCase(), '#fff', vis(T[0], 'jersey')], ['HABIR STUDIOS', '#fff', '#ff5a3d'], [T[1].name.toUpperCase(), '#fff', vis(T[1], 'jersey')]];
    const w = c.width / segs.length;
    segs.forEach(([txt, fg, bg], i) => {
      const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, shadeHex(bg, 0.2)); g.addColorStop(1, shadeHex(bg, -0.3));
      x.fillStyle = g; x.fillRect(i * w, 0, w, 64);
      x.fillStyle = fg; x.font = '44px "Bebas Neue", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, i * w + w / 2, 35);
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
      x.fillStyle = g; x.font = '210px "Bebas Neue", Impact, sans-serif';
      x.fillText(msg.replace('!', '').replace('’', "'"), w / 2, h / 2 + 10);
    } else {
      for (let k = 0; k < 2; k++) {
        const cx = k === 0 ? w * 0.25 : w * 0.75;
        x.fillStyle = vis(T[k], 'jersey'); x.fillRect(k === 0 ? 30 : w / 2 + 15, 30, w / 2 - 45, 120);
        x.fillStyle = '#fff'; x.font = '100px "Bebas Neue", Impact, sans-serif';
        x.fillText(T[k].abbr, cx, 96);
        x.font = '220px "Bebas Neue", Impact, sans-serif'; x.fillText(S ? String(S.sc[k]) : '0', cx, 300);
      }
      x.fillStyle = '#ffc83d'; x.font = '80px "Bebas Neue", Impact, sans-serif';
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

  buildBenches() {
    this.benchMats = [new THREE.MeshStandardMaterial({ color: 0x333333 }), new THREE.MeshStandardMaterial({ color: 0x333333 })];
    for (const k of [0, 1]) {
      const x = k === 0 ? -HALF_W - 5.5 : HALF_W + 5.5;
      const bench = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.9, 30, 2, 0.15), this.benchMats[k]); bench.position.set(x, 0.45, 50); bench.castShadow = true; this.scene.add(bench);
      const g = new THREE.CapsuleGeometry(0.32, 1.0, 3, 6); g.translate(0, 0.85, 0);
      const inst = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 26);
      const o = new THREE.Object3D();
      for (let i = 0; i < 26; i++) {
        o.position.set(x + (k === 0 ? 1.8 : -1.8) + (Math.random() - 0.5) * 1.4, 0, 33 + i * 1.3 + Math.random() * 0.5); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
      }
      inst.castShadow = true; this.scene.add(inst);
      this['sideline' + k] = inst;
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
    const arrowG = new THREE.ConeGeometry(0.22, 0.42, 3); arrowG.rotateX(Math.PI);
    this.ctrlArrow = new THREE.Mesh(arrowG, new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false })); s.add(this.ctrlArrow);
    const tgtTex = canvasTex(128, 128, (c) => {
      c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.arc(64, 64, 30, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 8, 0, Math.PI * 2); c.fill();
    });
    this.target = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: tgtTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.target.rotation.x = -Math.PI / 2; this.target.position.y = 0.05; this.target.renderOrder = 3; s.add(this.target);
    this.badges = [1, 2, 3].map(n => {
      const col = ['#22c55e', '#3b82f6', '#f97316'][n - 1];
      const tex = canvasTex(128, 128, (c) => {
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 10;
        c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.fillStyle = col; c.fill();
        c.shadowBlur = 0; c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 64, 68);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
      sp.scale.set(1.05, 1.05, 1); sp.renderOrder = 10; s.add(sp); return sp;
    });
  }

  // ======================= PLAYERS =======================
  numTex(num, col, outline) {
    return canvasTex(128, 128, (c) => {
      c.font = '104px "Bebas Neue", Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = outline; c.strokeText(String(num), 64, 70);
      c.fillStyle = col; c.fillText(String(num), 64, 70);
    });
  }

  teamMats(ti) {
    this._tm = this._tm || {};
    if (this._tm[ti]) return this._tm[ti];
    const t = TEAMS[ti];
    const m = {
      jersey: new THREE.MeshStandardMaterial({ color: t.jersey, roughness: 0.62 }),
      pants: new THREE.MeshStandardMaterial({ color: t.pants, roughness: 0.55 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: t.helmet, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }),
      trim: new THREE.MeshStandardMaterial({ color: vis(t, 'trim') === vis(t, 'jersey') ? '#ffffff' : t.trim, roughness: 0.6 }),
      sock: new THREE.MeshStandardMaterial({ color: t.jersey === '#121a14' ? '#0b0f0c' : t.jersey, roughness: 0.7 }),
      glove: new THREE.MeshStandardMaterial({ color: vis(t, 'trim'), roughness: 0.5 }),
    };
    this._tm[ti] = m; return m;
  }

  makePlayer(teamIdx, role, num, size) {
    const t = TEAMS[teamIdx];
    const M = this.teamMats(teamIdx);
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[(num * 7 + teamIdx) % SKIN.length], roughness: 0.6 });
    const mask = this._mask || (this._mask = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.3, metalness: 0.7 }));
    const black = this._black || (this._black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    const dark = this._dark || (this._dark = new THREE.MeshBasicMaterial({ color: 0x050505 }));
    const numMat = new THREE.MeshBasicMaterial({ map: this.numTex(num, t.num, vis(t, 'trim') === t.num ? '#000' : vis(t, 'trim')), transparent: true, depthWrite: false });
    const cap = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body); body.position.y = 1.0;
    const torso = new THREE.Group(); body.add(torso);
    const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.3, 0.32, 2, 0.1), M.pants); pelvis.position.y = 0.02; body.add(pelvis);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.05, 0.33), black); belt.position.y = 0.17; body.add(belt);
    const legs = [];
    for (const sx of [-0.13, 0.13]) {
      const hip = new THREE.Group(); hip.position.set(sx, -0.02, 0); body.add(hip);
      const thigh = cap(0.12, 0.3, M.pants); thigh.position.y = -0.24; hip.add(thigh);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.05), M.trim); stripe.position.set(sx > 0 ? 0.125 : -0.125, -0.24, 0); hip.add(stripe);
      const knee = new THREE.Group(); knee.position.y = -0.47; hip.add(knee);
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), M.pants));
      const shin = cap(0.085, 0.3, M.sock); shin.position.y = -0.22; knee.add(shin);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.32, 2, 0.04), black); foot.position.set(0, -0.46, 0.06); knee.add(foot);
      legs.push({ hip, knee });
    }
    const chest = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.58, 0.34, 3, 0.12), M.jersey); chest.position.y = 0.48; torso.add(chest);
    const waist = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.26, 0.3, 2, 0.1), M.jersey); waist.position.y = 0.22; torso.add(waist);
    const pads = new THREE.Mesh(new RoundedBoxGeometry(0.88, 0.22, 0.46, 3, 0.1), M.jersey); pads.position.y = 0.8; torso.add(pads);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), M.trim); collar.rotation.x = Math.PI / 2; collar.position.y = 0.9; torso.add(collar);
    const nf = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), numMat); nf.position.set(0, 0.5, 0.176); torso.add(nf);
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), numMat); nb.position.set(0, 0.52, -0.176); nb.rotation.y = Math.PI; torso.add(nb);
    for (const sx of [-0.36, 0.36]) { const ns = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), numMat); ns.position.set(sx, 0.915, 0); ns.rotation.x = -Math.PI / 2; torso.add(ns); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 10), skin); neck.position.y = 0.96; torso.add(neck);
    const head = new THREE.Group(); head.position.y = 1.14; torso.add(head);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.235, 22, 16), M.helmet); shell.scale.set(0.98, 1.0, 1.12); shell.position.z = -0.02; head.add(shell);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin); face.position.set(0, -0.04, 0.1); face.scale.set(1, 1.05, 0.8); head.add(face);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(0.238, 0.022, 6, 24, Math.PI), M.trim); strip.rotation.y = Math.PI / 2; strip.scale.set(1.12, 1, 1); strip.position.z = -0.02; head.add(strip);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), dark); ear.position.set(sx * 0.236, -0.03, 0.02); ear.rotation.y = sx * Math.PI / 2; head.add(ear); }
    for (const [y, r] of [[-0.03, 0.2], [-0.1, 0.19], [-0.16, 0.16]]) {
      const bar = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 5, 16, Math.PI * 0.9), mask);
      bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); bar.position.set(0, y, 0.06); head.add(bar);
    }
    const vbar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 5), mask); vbar.position.set(0, -0.09, 0.255); head.add(vbar);
    if (num % 3 === 0) {
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.236, 16, 8, Math.PI / 2 - 0.75, 1.5, 1.25, 0.4), new THREE.MeshPhysicalMaterial({ color: 0x223355, roughness: 0.05, metalness: 0.9 }));
      visor.position.z = -0.02; visor.scale.set(0.98, 1, 1.12); head.add(visor);
    }
    const arms = [];
    for (const sx of [-0.4, 0.4]) {
      const sh = new THREE.Group(); sh.position.set(sx, 0.78, 0); torso.add(sh);
      const cap0 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.jersey); cap0.scale.set(1, 0.8, 1); sh.add(cap0);
      const upper = cap(0.085, 0.2, M.jersey); upper.position.y = -0.17; sh.add(upper);
      const bicep = cap(0.07, 0.1, skin); bicep.position.y = -0.27; sh.add(bicep);
      const elbow = new THREE.Group(); elbow.position.y = -0.36; sh.add(elbow);
      const fore = cap(0.065, 0.2, skin); fore.position.y = -0.15; elbow.add(fore);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.06, 10), M.trim); band.position.y = -0.24; elbow.add(band);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.glove); glove.scale.set(0.9, 1.2, 0.7); glove.position.y = -0.33; elbow.add(glove);
      arms.push({ sh, elbow });
    }
    const wide = size, tall = 0.97 + (size - 1) * 0.25;
    root.scale.set(wide, tall, wide);
    root.traverse(o => { if (o.isMesh && o.material !== numMat && o.material !== dark) o.castShadow = true; });
    const blob = this.blob(0.7 * size); this.scene.add(blob);
    this.scene.add(root);
    return {
      root, body, torso, head, legs, arms, blob,
      phase: Math.random() * 6, j: { lean: 0, roll: 0, drop: 0, fall: 0, twist: 0, lh: [0, 0], lk: [0, 0], as: [0, 0], az: [0, 0], ae: [0, 0], jump: 0 },
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

  getMesh(team, unit, role, num, size) {
    const key = `${this.teams[team]}-${team}-${unit}-${role}`;
    let m = this.pmeshes.get(key);
    if (!m) { m = this.makePlayer(this.teams[team], role, num, size); this.pmeshes.set(key, m); }
    return m;
  }

  clearPlayers() { for (const m of this.pmeshes.values()) { this.scene.remove(m.root); this.scene.remove(m.blob); } this.pmeshes.clear(); }

  setTeams(teams) {
    if (this.teams && this.teams[0] === teams[0] && this.teams[1] === teams[1]) return;
    this.clearPlayers();
    this.teams = teams.slice();
    this.drawField(teams);
    this.drawRibbon(teams);
    this.colorCrowd(teams);
    this.drawBoard(null);
    teams.forEach((ti, k) => { this.benchMats[k].color.set(vis(TEAMS[ti], 'jersey')); this['sideline' + k].material.color.set(TEAMS[ti].jersey); });
  }

  // re-draw text canvases once web fonts have loaded
  refreshText() { if (this.teams) { const t = this.teams; this.teams = null; this.setTeams(t); } }

  event(e) {
    if (e === 'tackle') this.shake = Math.max(this.shake, 0.22);
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
  }

  update(S, dt, local) {
    this.ambient(dt);
    if (!this.teams) return;
    const used = new Set();
    const ctrlId = local >= 0 ? S.ctrl[local] : -1;
    const carrier = S.b[3] === 0 ? S.b[5] : -1;
    S.pl.forEach((p, i) => {
      const [team, isOff, role, num, x, z, face, spd, flags, , size] = p;
      const m = this.getMesh(team, isOff ? 'off' : 'def', role, num, size);
      used.add(m);
      m.root.visible = true; m.blob.visible = true;
      m.root.position.set(x, 0, z);
      m.root.rotation.y = face;
      m.blob.position.set(x, 0.015, z);
      this.animate(m, S, role, spd, flags, i === carrier && S.ph !== 'presnap', dt);
    });
    for (const m of this.pmeshes.values()) if (!used.has(m)) { m.root.visible = false; m.blob.visible = false; }

    const [bx, by, bz, bstate, tgt, bc] = S.b;
    this.ball.position.set(bx, by, bz);
    if (bstate === 1 || bstate === 2) {
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

    const showBadges = local >= 0 && S.off === local && ((S.ph === 'presnap' && S.poss === local) || S.canThrow);
    const rroles = ['WR1', 'WR2', 'RB'];
    this.badges.forEach((sp, k) => {
      const p = showBadges && S.pl.find(q => q[1] === 1 && q[2] === rroles[k] && q[0] === local);
      sp.visible = !!p;
      if (p) sp.position.set(p[4], 3.25 + Math.sin(this.time * 4 + k) * 0.08, p[5]);
    });

    const showRoutes = local >= 0 && S.ph === 'presnap' && S.poss === local && S.op && OFF_PLAYS.some(p => p.id === S.op);
    const rk = showRoutes ? `${S.id}-${S.op}` : '';
    if (rk !== this.routeKey) { this.routeKey = rk; this.buildRoutes(S, local, showRoutes); }

    const bk = `${S.sc}|${S.q}|${Math.ceil(S.clk)}|${S.msg && S.msg.big ? S.msg.text : ''}`;
    if (bk !== this.boardKey && this.time - (this._boardT || 0) > 0.25) { this.boardKey = bk; this._boardT = this.time; this.drawBoard(S); }

    this.updateCamera(S, dt, local);
  }

  animate(m, S, role, spd, flags, hasBall, dt) {
    const j = m.j;
    const fallen = flags & 1, diving = flags & 2, juking = flags & 4, engaged = flags & 8, throwing = flags & 16, reaching = flags & 32, celebrating = flags & 64, scorer = flags & 128;
    const run = Math.min(1, spd / 8.5);
    m.phase += dt * (2.2 + spd * 1.25);
    const ph = m.phase;
    const presnap = S.ph === 'presnap';
    const lineman = role === 'C' || role === 'LG' || role === 'RG' || role.startsWith('DL');
    let lean = run * 0.32, roll = 0, drop = 0, fall = 0, twist = 0, jump = 0;
    const lh = [0, 0], lk = [0.12, 0.12], as = [0.15, 0.15], az = [0.12, -0.12], ae = [0.35, 0.35];
    if (run > 0.03) {
      const sw = Math.sin(ph);
      lh[0] = -sw * 0.9 * run; lh[1] = sw * 0.9 * run;
      lk[0] = (0.2 + Math.max(0, Math.sin(ph + 1.4)) * 1.35) * run + 0.1;
      lk[1] = (0.2 + Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * 1.35) * run + 0.1;
      as[0] = sw * 1.0 * run; as[1] = -sw * 1.0 * run;
      ae[0] = ae[1] = 1.2 + run * 0.4;
      twist = sw * 0.15 * run;
      drop = 0.04 * run;
    } else {
      lean = 0.05 + Math.sin(this.time * 2 + m.celT) * 0.02; lk[0] = lk[1] = 0.15;
    }
    if (presnap) {
      if (lineman) {
        lean = 1.05; drop = 0.42; lh[0] = -1.15; lh[1] = -0.85; lk[0] = 1.7; lk[1] = 1.4;
        as[0] = -1.35; ae[0] = 0.05; as[1] = -0.4; ae[1] = 0.9;
      } else if (role === 'QB') { lean = 0.25; drop = 0.12; lk[0] = lk[1] = 0.45; lh[0] = lh[1] = -0.3; as[0] = as[1] = -0.7; ae[0] = ae[1] = 0.9; }
      else if (role === 'WR1' || role === 'WR2' || role === 'CB1' || role === 'CB2') { lean = 0.45; drop = 0.15; lh[0] = -0.6; lh[1] = 0.1; lk[0] = 0.9; lk[1] = 0.6; as[0] = 0.3; as[1] = -0.4; ae[0] = ae[1] = 1.1; }
      else { lean = 0.5; drop = 0.2; lh[0] = lh[1] = -0.55; lk[0] = lk[1] = 0.95; as[0] = as[1] = -0.45; ae[0] = ae[1] = 0.6; az[0] = 0.25; az[1] = -0.25; }
    }
    if (hasBall && !throwing) { as[1] = -0.35; ae[1] = 1.9; az[1] = 0.25; }
    if (engaged) { lean = 0.55; as[0] = as[1] = -1.35; ae[0] = ae[1] = 0.25; drop = 0.15; lk[0] = Math.max(lk[0], 0.7); lk[1] = Math.max(lk[1], 0.7); }
    if (throwing) {
      m.throwT += dt;
      const t = m.throwT;
      if (t < 0.18) { as[1] = lerp(-0.6, -2.6, t / 0.18); ae[1] = 1.4; twist = -0.5; }
      else { const k = Math.min(1, (t - 0.18) / 0.15); as[1] = lerp(-2.6, -0.9, k); ae[1] = lerp(1.4, 0.1, k); twist = lerp(-0.5, 0.45, k); lean = 0.3; }
      as[0] = -0.6; ae[0] = 1.2;
    } else m.throwT = 0;
    if (reaching) { as[0] = as[1] = -2.75; ae[0] = ae[1] = 0.2; az[0] = 0.15; az[1] = -0.15; lean = Math.min(lean, 0.1); }
    if (juking) roll = Math.sin(ph * 0.5) > 0 ? 0.35 : -0.35;
    if (diving) { fall = 0.82; as[0] = as[1] = -2.9; ae[0] = ae[1] = 0.1; lh[0] = lh[1] = 0.4; lk[0] = lk[1] = 0.2; }
    if (fallen) { fall = 1; as[0] = as[1] = -2.4; ae[0] = ae[1] = 0.3; lh[0] = 0.2; lh[1] = -0.1; lk[0] = 0.4; lk[1] = 0.2; drop = 0; }
    if (celebrating && !fallen) {
      m.celT += dt;
      const bounce = Math.abs(Math.sin(m.celT * (scorer ? 6 : 5)));
      jump = bounce * (scorer ? 0.55 : 0.3);
      as[0] = as[1] = -2.8 + Math.sin(m.celT * 9) * 0.25; ae[0] = ae[1] = 0.25; lean = 0; twist = Math.sin(m.celT * 3) * 0.3;
      lk[0] = lk[1] = 0.3 + (1 - bounce) * 0.6; lh[0] = lh[1] = -(1 - bounce) * 0.3;
    }
    const R = fallen || diving ? 9 : 16;
    j.lean = damp(j.lean, lean, 10, dt); j.roll = damp(j.roll, roll, 10, dt); j.drop = damp(j.drop, drop, 10, dt);
    j.fall = damp(j.fall, fall, fall ? 8 : 4, dt); j.twist = damp(j.twist, twist, 14, dt); j.jump = damp(j.jump, jump, 20, dt);
    for (let k = 0; k < 2; k++) {
      j.lh[k] = damp(j.lh[k], lh[k], R, dt); j.lk[k] = damp(j.lk[k], lk[k], R, dt);
      j.as[k] = damp(j.as[k], as[k], throwing ? 30 : R, dt); j.ae[k] = damp(j.ae[k], ae[k], R, dt); j.az[k] = damp(j.az[k], az[k], R, dt);
    }
    const bob = run > 0.05 ? Math.abs(Math.cos(ph)) * 0.07 * run : 0;
    m.body.position.y = 1.0 - j.drop - j.fall * 0.62 + bob + j.jump;
    m.body.position.z = -j.fall * 0.15;
    m.body.rotation.set(j.fall * 1.42, 0, j.roll);
    m.torso.rotation.set(j.lean * (1 - j.fall * 0.7), j.twist, 0);
    for (let k = 0; k < 2; k++) {
      m.legs[k].hip.rotation.x = j.lh[k] - j.lean * 0.55 * (1 - j.fall);
      m.legs[k].knee.rotation.x = j.lk[k];
      m.arms[k].sh.rotation.set(j.as[k], 0, j.az[k]);
      m.arms[k].elbow.rotation.x = -j.ae[k];
    }
    m.head.rotation.x = -j.lean * 0.6 * (1 - j.fall);
  }

  buildRoutes(S, local, show) {
    while (this.routeGroup.children.length) { const c = this.routeGroup.children.pop(); c.geometry.dispose(); }
    if (!show) return;
    const play = OFF_PLAYS.find(p => p.id === S.op);
    const d = S.poss === 0 ? 1 : -1;
    const cols = { WR1: 0x22c55e, WR2: 0x3b82f6, RB: 0xf97316 };
    for (const [role, pts] of Object.entries(play.routes)) {
      const p = S.pl.find(q => q[1] === 1 && q[2] === role);
      if (!p) continue;
      const path = [[p[4], p[5]], ...pts.map(w => [Math.max(-HALF_W + 1, Math.min(HALF_W - 1, S.bx - w[0] * d)), S.los + Math.min(w[1], 22) * d])];
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
    if (bstate === 1 && tgt) { fx = (bx + tgt[0]) / 2 * 0.8; fz = (bz + tgt[1]) / 2; }
    if (bstate === 2) { fx = bx * 0.5; fz = bz; }
    const k = 1 - Math.exp(-dt * (bstate === 2 ? 2.2 : 3.2));
    this.focus.x += (fx - this.focus.x) * k; this.focus.z += (fz - this.focus.z) * k;
    let px, py, pz, lx, ly, lz;
    if (this.camMode === 'broadcast') {
      px = this.focus.x * 0.2 - 31 * s; py = 25; pz = this.focus.z - 4 * s;
      lx = this.focus.x * 0.6 + 3 * s; ly = 0; lz = this.focus.z + 2 * s;
    } else {
      const portrait = this.cam.aspect < 1;
      const celebrate = S.msg && S.msg.big && S.ph === 'dead';
      const zoom = celebrate ? 0.72 : 1;
      px = this.focus.x * 0.93; py = (portrait ? 16 : 12.5) * zoom; pz = this.focus.z - (portrait ? 18 : 17) * s * zoom;
      lx = this.focus.x; ly = celebrate ? 1.5 : 0; lz = this.focus.z + 5 * s;
    }
    const kp = 1 - Math.exp(-dt * 5);
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
