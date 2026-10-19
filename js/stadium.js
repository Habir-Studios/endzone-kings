// ENDZONE KINGS — stadium dressing: sidelines (benches, players, coaches, coolers), chain gang, camera crews,
// skycam, railings, roof trusses, speakers, flags and facade boards.
import * as THREE from 'three';
import { TEAMS, HALF_W } from './sim.js?v=1792379652';
import { drawLogo } from './logos.js?v=1792379652';
import { drawFaceTextureLite, faceParams } from './faces.js?v=1792379652';

const vis = (t, k) => (t[k] === '#121a14' ? '#18c964' : t[k]);
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t._canvas = c; return t;
}
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
// a face texture for one head (sphere UVs: the face sits at the front, u = 0.25)
function faceMat(R, seed, fem = false) {
  const n = R.quality === 'potato' ? 64 : 128;
  const t = tex(n, n, (c, w, h) => drawFaceTextureLite(c, w, h, seed, fem));
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 });
}
// instanced heads with real faces: K face variants, each its own instanced mesh, person i wears variant i % K
class FaceSet {
  constructor(R, geo, n, K, seed0, fem = false) {
    this.K = K; this.meshes = []; this.F = [];
    for (let v = 0; v < K; v++) {
      const sd = (seed0 + v * 7919) >>> 0, m = new THREE.InstancedMesh(geo, faceMat(R, sd, fem), Math.ceil(n / K));
      m.frustumCulled = false; m.castShadow = true; R.scene.add(m); this.meshes.push(m);
      const F = faceParams(sd); this.F.push(fem ? F : F);
    }
    this.instanceColor = null;
  }
  face(i) { return this.F[i % this.K]; }
  setMatrixAt(i, m) { this.meshes[i % this.K].setMatrixAt(Math.floor(i / this.K), m); }
  setColorAt() {}
  get instanceMatrix() { const ms = this.meshes; return { set needsUpdate(v) { for (const m of ms) m.instanceMatrix.needsUpdate = v; } }; }
}

// one standing / sitting person built from a handful of shared geometries, merged into instanced parts
function personParts(R) {
  if (R._pp) return R._pp;
  const torso = R.lathe('sl_torso', [[0.0001, 0.62], [0.17, 0.6], [0.22, 0.5], [0.21, 0.3], [0.18, 0.08], [0.0001, 0.05]], 12);
  const pads = new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); pads.scale(1.35, 0.5, 0.85);
  const head = new THREE.SphereGeometry(0.13, 12, 10);
  const helmet = new THREE.SphereGeometry(0.17, 14, 10); helmet.scale(1, 1, 1.1);
  const leg = R.limbGeo('sl_leg', 0.085, 0.075, 0.055, 0.78);
  const arm = R.limbGeo('sl_arm', 0.06, 0.055, 0.045, 0.56);
  const cap = new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return (R._pp = { torso, pads, head, helmet, leg, arm, cap });
}

export function buildSidelines(R) {
  const s = R.scene, P = personParts(R), side = R.side = { groups: [], inst: [], mats: [] };
  const dummy = new THREE.Object3D();
  const white = M(0xf2f2f2), dark = M(0x15171c), metal = M(0x9aa3b5, { metalness: 0.6, roughness: 0.35 });
  // white six-foot border around the field and the yellow coaches' box line
  const border = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 124), border); b.rotation.x = -Math.PI / 2; b.position.set(sx * (HALF_W + 0.95), 0.008, 50); b.receiveShadow = true; s.add(b);
    const y = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 50), new THREE.MeshBasicMaterial({ color: 0xffd400 })); y.rotation.x = -Math.PI / 2; y.position.set(sx * (HALF_W + 3.2), 0.012, 50); s.add(y);
  }
  for (const ez of [-11.95, 111.95]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 3.8, 1.9), border); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.008, ez); s.add(b); }

  for (let k = 0; k < 2; k++) {
    const sx = k === 0 ? -1 : 1, g = new THREE.Group(); s.add(g); side.groups.push(g);
    const teamMat = M(0x334488, { roughness: 0.55 }), trimMat = M(0xffffff, { roughness: 0.6 });
    side.mats.push({ team: teamMat, trim: trimMat });
    // team area turf, slightly darker
    const area = new THREE.Mesh(new THREE.PlaneGeometry(9, 52), new THREE.MeshStandardMaterial({ color: 0x1d5a26, roughness: 1 }));
    area.rotation.x = -Math.PI / 2; area.position.set(sx * (HALF_W + 7.6), 0.004, 50); area.receiveShadow = true; g.add(area);
    // benches: plank seat, backrest, legs, in team color
    for (const z0 of [33, 45, 57]) {
      const bench = new THREE.Group(); bench.position.set(sx * (HALF_W + 9.4), 0, z0 + 5);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 10), teamMat); seat.position.y = 0.48; bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 10), teamMat); back.position.set(sx * 0.27, 0.78, 0); bench.add(back);
      for (let i = -4; i <= 4; i += 2) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.06), metal); l.position.set(0, 0.24, i); bench.add(l); }
      bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(bench);
    }
    // team wall banner behind the bench with the logo repeated
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 52), [dark, dark, dark, dark, M(0xffffff), M(0xffffff)]);
    banner.position.set(sx * (HALF_W + 12.2), 0.65, 50); g.add(banner); side['banner' + k] = banner;
    // drink coolers + tables with cup stacks
    for (const z of [29, 71]) {
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 2.4), white); table.position.set(sx * (HALF_W + 11), 0.85, z); g.add(table);
      for (const lz of [-1, 1]) { const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), metal); tl.position.set(sx * (HALF_W + 11), 0.42, z + lz); g.add(tl); }
      for (let i = 0; i < 2; i++) {
        const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 18), teamMat); cooler.position.set(sx * (HALF_W + 11), 1.19, z - 0.6 + i * 1.2); cooler.castShadow = true; g.add(cooler);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18), white); lid.position.set(cooler.position.x, 1.54, cooler.position.z); g.add(lid);
      }
      for (let i = 0; i < 6; i++) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.25, 8), white); cup.position.set(sx * (HALF_W + 10.75), 1.0, z - 0.3 + i * 0.12); g.add(cup); }
    }
    // sideline heaters / big fans
    for (const z of [38, 50, 62]) {
      const fan = new THREE.Group(); fan.position.set(sx * (HALF_W + 11.3), 0, z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 20), dark); body.rotation.z = Math.PI / 2; body.position.y = 1.0; fan.add(body);
      const grill = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20), metal); grill.rotation.y = Math.PI / 2; grill.position.set(-sx * 0.18, 1.0, 0); fan.add(grill);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 0.85, 8), metal); stand.position.y = 0.42; fan.add(stand);
      fan.rotation.y = 0; g.add(fan);
    }
    // a white canopy tent for the trainers
    const tent = new THREE.Group(); tent.position.set(sx * (HALF_W + 10.5), 0, 80);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 4, 1), M(0xf5f5f5, { roughness: 0.9 })); top.rotation.y = Math.PI / 4; top.position.y = 2.75; tent.add(top);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.25, 3.1), teamMat); valance.position.y = 2.2; tent.add(valance);
    for (const [ax, az] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), metal); pole.position.set(ax, 1.1, az); tent.add(pole); }
    const cot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 2), M(0x2a3346)); cot.position.y = 0.25; tent.add(cot);
    tent.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.add(tent);
  }

  // sideline players: a full 40 per team, standing along the coaches' box or sitting on the bench
  const N = 80, parts = {};
  const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), N); m.castShadow = true; m.frustumCulled = false; s.add(m); return m; };
  for (const [k, geo] of [['torso', P.torso], ['pads', P.pads], ['helmet', P.helmet], ['legL', P.leg], ['legR', P.leg], ['armL', P.arm], ['armR', P.arm], ['hair', P.cap]]) parts[k] = mk(geo);
  parts.head = new FaceSet(R, P.head, N, R.quality === 'potato' ? 4 : 10, 90210);
  side.people = parts; side.poses = [];
  const skins = ['#4a2c18', '#6b4226', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    const k = i < N / 2 ? 0 : 1, sx = k === 0 ? -1 : 1, j = i % (N / 2);
    const sitting = j >= 28;
    const x = sitting ? sx * (HALF_W + 9.1) : sx * (HALF_W + 4.0 + Math.random() * 2.6);
    const z = sitting ? 34.5 + (j - 28) * 2.85 + Math.random() * 0.4 : 25 + j * 1.85 + (Math.random() - 0.5) * 0.8;
    const helmOn = !sitting && Math.random() < 0.55;
    const F = parts.head.face(i);
    side.poses.push({ k, x, z, sitting, helmOn, face: (sx < 0 ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * 0.6, ph: Math.random() * 6, skin: new THREE.Color(F.skin), hair: new THREE.Color(F.hair), bald: F.hairStyle === 4, size: 0.95 + Math.random() * 0.25 });
  }
  placeSidelinePeople(R, 0, 0);

  // coaches with headsets and play sheets
  side.coaches = [];
  for (let k = 0; k < 2; k++) for (let c = 0; c < 2; c++) {
    const sx = k === 0 ? -1 : 1, g = new THREE.Group();
    const polo = M(0x334488), khaki = M(0xc8b48a), skin = M(['#8d5524', '#e0ac69', '#c68642', '#f1c27d'][(k * 2 + c) % 4]);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.85, 10), khaki); legs.position.y = 0.43; g.add(legs);
    const body = new THREE.Mesh(R.lathe('coach_torso', [[0.0001, 0.62], [0.16, 0.6], [0.22, 0.45], [0.23, 0.2], [0.2, 0.0], [0.0001, 0]], 12), polo); body.position.y = 0.85; g.add(body);
    const cF = faceParams(5150 + k * 31 + c * 7); skin.color.set(cF.skin);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), faceMat(R, 5150 + k * 31 + c * 7)); head.position.y = 1.62; g.add(head);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), polo); hat.position.y = 1.65; g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), polo); brim.position.set(0, 1.66, 0.1); g.add(brim);
    const phones = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 14, Math.PI), dark); phones.position.y = 1.64; phones.rotation.y = Math.PI / 2; g.add(phones);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 4), dark); mic.position.set(0.1, 1.56, 0.08); mic.rotation.z = 1.1; g.add(mic);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.32), M(0xffffff, { side: THREE.DoubleSide })); sheet.position.set(0.12, 1.28, 0.22); sheet.rotation.x = -0.4; g.add(sheet);
    for (const ax of [-0.25, 0.25]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.55, 8), ax > 0 ? skin : polo); arm.position.set(ax, 1.2, ax > 0 ? 0.12 : 0); arm.rotation.x = ax > 0 ? -0.9 : 0; g.add(arm); }
    g.position.set(sx * (HALF_W + 3.6 + c * 1.2), 0, 47 + c * 6); g.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    s.add(g); side.coaches.push({ g, k, polo, hat });
  }

  // chain gang: two rod poles with the chain between them, the down box, three crew in vests
  const cg = side.chain = new THREE.Group(); s.add(cg);
  const orange = M(0xff6a00, { roughness: 0.5, emissive: 0x2a1000 });
  const pole = () => { const g2 = new THREE.Group(); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), dark); rod.position.y = 1.25; g2.add(rod); const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12), orange); pad.position.y = 2.6; g2.add(pad); return g2; };
  side.rodA = pole(); side.rodB = pole(); cg.add(side.rodA, side.rodB);
  side.chainLine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), metal); side.chainLine.rotation.x = Math.PI / 2; cg.add(side.chainLine);
  side.downTex = tex(128, 128, () => {});
  side.downBox = new THREE.Group();
  const dbRod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), dark); dbRod.position.y = 1.3; side.downBox.add(dbRod);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), [orange, orange, orange, orange, new THREE.MeshBasicMaterial({ map: side.downTex }), new THREE.MeshBasicMaterial({ map: side.downTex })]);
  plate.position.y = 2.75; plate.rotation.y = Math.PI / 2; side.downBox.add(plate); cg.add(side.downBox);
  side.crew = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.85, 8), dark); legs.position.y = 0.43; p.add(legs);
    const vest = new THREE.Mesh(R.lathe('crew_torso', [[0.0001, 0.6], [0.15, 0.58], [0.2, 0.42], [0.2, 0.15], [0.18, 0], [0.0001, 0]], 10), M(0xffb000, { emissive: 0x332200 })); vest.position.y = 0.85; p.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), faceMat(R, 777 + i * 13)); head.position.y = 1.6; p.add(head);
    const hc = new THREE.Mesh(R._pp.cap, M(faceParams(777 + i * 13).hair)); hc.scale.setScalar(0.92); hc.position.set(0, 1.632, -0.024); p.add(hc);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; }); cg.add(p); side.crew.push(p);
  }
  side.lastDown = -1;

  // photographers along the end lines and a couple of big TV cameras on the far sideline
  const camBody = M(0x1a1c22, { metalness: 0.4, roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const p = new THREE.Group();
    const end = i < 5 ? -1 : 1, x = (i % 5 - 2) * 6.5 + (Math.random() - 0.5) * 2, z = end < 0 ? -13.2 : 113.2;
    const body = new THREE.Mesh(R.lathe('photo_torso', [[0.0001, 0.55], [0.15, 0.53], [0.2, 0.38], [0.19, 0.12], [0.0001, 0.05]], 10), M(Math.random() < 0.5 ? 0x22262f : 0x3a4250)); body.position.y = 0.42; p.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), faceMat(R, 4242 + i * 17)); head.position.y = 1.08; p.add(head);
    const hat = new THREE.Mesh(R._pp.cap, M(i % 2 ? 0x1b1f2a : 0xd8dce6)); hat.scale.setScalar(0.94); hat.position.set(0, 1.115, -0.02); p.add(hat);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.55), M(0x22262f)); knee.position.set(0, 0.15, 0.15); p.add(knee);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.12), camBody); cam.position.set(0, 1.05, 0.2); p.add(cam);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.42, 10), camBody); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.03, 0.45); p.add(lens);
    p.position.set(x, 0, z); p.rotation.y = end < 0 ? 0 : Math.PI;
    p.traverse(o => { if (o.isMesh) o.castShadow = true; }); s.add(p);
  }
  for (const z of [36, 64]) {
    const c = new THREE.Group(); c.position.set(HALF_W + 4.2, 0, z);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.5, 10), metal); ped.position.y = 0.75; c.add(ped);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.9), camBody); box.position.y = 1.72; c.add(box);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.7, 14), camBody); lens.rotation.z = Math.PI / 2; lens.position.set(-0.55, 1.72, 0); c.add(lens);
    const op = new THREE.Mesh(R.lathe('photo_torso', [[0.0001, 0.55], [0.15, 0.53], [0.2, 0.38], [0.19, 0.12], [0.0001, 0.05]], 10), M(0x2c3240)); op.position.set(0.55, 0.85, 0); c.add(op);
    const oh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M('#c68642')); oh.position.set(0.55, 1.5, 0); c.add(oh);
    const ol = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.85, 8), M(0x22262f)); ol.position.set(0.55, 0.43, 0); c.add(ol);
    c.traverse(o => { if (o.isMesh) o.castShadow = true; }); s.add(c);
  }
  // skycam on cables
  const sky = side.sky = new THREE.Group();
  const sbody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), camBody); sky.add(sbody);
  const slens = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M(0x050505, { metalness: 0.8, roughness: 0.1 })); slens.position.y = -0.35; sky.add(slens);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false })); led.position.set(0.46, 0.15, 0); sky.add(led);
  s.add(sky);
  side.cables = [];
  const cableMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 });
  for (const [cx, cz] of [[-60, -40], [60, -40], [-60, 140], [60, 140]]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(cx, 62, cz)]);
    const line = new THREE.Line(geo, cableMat); line.frustumCulled = false; s.add(line); side.cables.push({ line, cx, cz });
  }
  side.skyPos = new THREE.Vector3(0, 22, 30);
}

// reused scratch objects: this runs every frame for 80 people x 9 parts, so no allocations in here
const _sb = new THREE.Matrix4(), _so = new THREE.Object3D(), _sq = new THREE.Quaternion(), _se = new THREE.Euler(), _sv = new THREE.Vector3(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
let _sI = 0;
const _sput = (mesh, x, y, z, rx = 0, rz = 0) => { _so.position.set(x, y, z); _so.rotation.set(rx, 0, rz); _so.updateMatrix(); mesh.setMatrixAt(_sI, _sm.multiplyMatrices(_sb, _so.matrix)); };
function placeSidelinePeople(R, t, hype) {
  const side = R.side, P = side.people, first = !side._seated;
  if (!first && R.quality === 'potato') { side._acc = (side._acc || 0) + 1; if (side._acc % 3) return; }   // Chromebook: a third as often
  const put = _sput; _so.scale.set(1, 1, 1);
  const poses = side.poses;
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    if (p.sitting && !first) continue;                 // bench players never move: placed once
    _sI = i;
    const bob = p.sitting ? 0 : Math.sin(t * 1.4 + p.ph) * 0.02;
    const jump = !p.sitting && hype > 0.5 ? Math.max(0, Math.sin(t * 6 + p.ph * 3)) * 0.35 * (hype - 0.4) : 0;
    _sb.compose(_sv.set(p.x, bob + jump, p.z), _sq.setFromEuler(_se.set(0, p.face, 0)), _ss.set(p.size, p.size, p.size));
    const hy = p.sitting ? 0.55 : 0.92;                 // hip height
    put(P.torso, 0, hy, 0);
    put(P.pads, 0, hy + 0.57, 0);
    put(P.head, 0, hy + 0.82, 0.02);
    if (p.helmOn || p.bald) P.hair.setMatrixAt(i, _zero); else put(P.hair, 0, hy + 0.855, -0.028);
    if (p.helmOn) put(P.helmet, 0, hy + 0.84, 0.0);
    else put(P.helmet, 0.34, hy + 0.05, 0.12);        // helmet carried at his side
    const cheer = jump > 0.05 ? -2.7 : 0;
    if (p.sitting) { put(P.legL, -0.1, hy, 0, -1.45); put(P.legR, 0.1, hy, 0, -1.45); }
    else { put(P.legL, -0.1, hy, 0); put(P.legR, 0.1, hy, 0); }
    put(P.armL, -0.3, hy + 0.55, 0, cheer || (p.sitting ? -0.5 : 0), 0.15);
    put(P.armR, 0.3, hy + 0.55, 0, cheer || (p.helmOn ? 0 : -0.15), -0.15);
  }
  side._seated = true;
  for (const k in P) P[k].instanceMatrix.needsUpdate = true;
}

export function colorSidelines(R, teams) {
  const side = R.side; if (!side) return;
  teams.forEach((ti, k) => {
    const t = TEAMS[ti];
    side.mats[k].team.color.set(vis(t, 'jersey')); side.mats[k].trim.color.set(vis(t, 'trim'));
    // banner with logo and city name
    const ban = tex(1024, 64, (c, w, h) => {
      c.fillStyle = t.jersey; c.fillRect(0, 0, w, h);
      c.fillStyle = vis(t, 'trim'); c.fillRect(0, h - 6, w, 6); c.fillRect(0, 0, w, 4);
      c.font = '900 40px "Big Shoulders Display", Impact, sans-serif'; c.textBaseline = 'middle';
      for (let x = 10; x < w; x += 256) { drawLogo(c, ti, 54, x, 5); c.fillStyle = '#ffffff'; c.fillText(t.city.toUpperCase(), x + 64, h / 2 + 2); }
    });
    const mats = side['banner' + k].material; if (mats[4].map && mats[4].map !== ban) mats[4].map.dispose(); mats[4].map = ban; mats[5].map = ban; mats[4].needsUpdate = mats[5].needsUpdate = true;
    for (const c of side.coaches) if (c.k === k) { c.polo.color.set(vis(t, 'jersey')); }
  });
  const P = side.people;
  side.poses.forEach((p, i) => {
    const t = TEAMS[teams[p.k]];
    P.torso.setColorAt(i, new THREE.Color(t.jersey)); P.pads.setColorAt(i, new THREE.Color(t.jersey));
    P.legL.setColorAt(i, new THREE.Color(t.pants)); P.legR.setColorAt(i, new THREE.Color(t.pants));
    P.helmet.setColorAt(i, new THREE.Color(t.helmet)); P.hair.setColorAt(i, p.hair);
    P.armL.setColorAt(i, p.skin); P.armR.setColorAt(i, p.skin);
  });
  for (const m of Object.values(P)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

const _skyWant = new THREE.Vector3();
export function updateSidelines(R, S, dt) {
  const side = R.side; if (!side) return;
  placeSidelinePeople(R, R.time, R.hype);
  // chain gang tracks the line to gain on the far sideline
  const live = S && S.ph !== 'gameover' && S.ph !== 'half';
  side.chain.visible = !!live;
  if (live) {
    const x = HALF_W + 2.2, d = S.poss === 0 ? 1 : -1;
    const goal = (S.poss === 0 && S.fd >= 100) || (S.poss === 1 && S.fd <= 0);
    const los = S.ph === 'presnap' || S.ph === 'dead' ? S.los : S.plos;
    const zA = goal ? los : S.fd - 10 * d, zB = goal ? los : S.fd;
    side.rodA.position.set(x, 0, zA); side.rodB.position.set(x, 0, zB); side.rodB.visible = !goal;
    const mid = (zA + zB) / 2, len = Math.abs(zB - zA);
    side.chainLine.position.set(x, 0.6, mid); side.chainLine.scale.set(1, len, 1); side.chainLine.visible = len > 0.5;
    side.downBox.position.set(x + 0.4, 0, los);
    side.crew[0].position.set(x + 0.9, 0, zA); side.crew[1].position.set(x + 0.9, 0, zB); side.crew[2].position.set(x + 1.3, 0, los);
    for (const c of side.crew) c.rotation.y = -Math.PI / 2;
    if (side.lastDown !== S.dn) {
      side.lastDown = S.dn;
      const c = side.downTex._canvas.getContext('2d'); c.fillStyle = '#ff6a00'; c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#111'; c.font = '900 100px "Big Shoulders Display", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(Math.min(4, S.dn || 1)), 64, 70);
      side.downTex.needsUpdate = true;
    }
  }
  // skycam floats behind the play
  const f = R.focus, d = S && S.poss === 1 ? -1 : 1;
  const want = _skyWant.set(f.x * 0.5, 20 + Math.sin(R.time * 0.4) * 0.6, f.z - 16 * d);
  side.skyPos.lerp(want, Math.min(1, dt * 0.8));
  side.sky.position.copy(side.skyPos); side.sky.rotation.y = d > 0 ? 0 : Math.PI;
  for (const c of side.cables) { const a = c.line.geometry.attributes.position; a.setXYZ(0, side.skyPos.x, side.skyPos.y + 0.3, side.skyPos.z); a.needsUpdate = true; }
}

// ---------------- bowl dressing ----------------
export function seatTexture() {
  const t = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#1a2148'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      c.fillStyle = '#121838'; c.fillRect(0, y + 11, w, 5);                  // row step shadow
      for (let x = 0; x < w; x += 10) { c.fillStyle = (x / 10 + y / 16) % 7 === 0 ? '#2f3a78' : '#283265'; c.fillRect(x + 1, y + 2, 8, 8); } // seat backs
    }
    // painted-in fans on every seat, so even far-off or thinned-out sections read as a packed house
    const shirts = ['#c8102e', '#003594', '#ffb612', '#ffffff', '#111111', '#4f2683', '#00843d', '#fb4f14', '#69be28', '#a5acaf', '#203731', '#e31837'];
    const skin = ['#4a2c18', '#6b4226', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'];
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 10) {
      if (x >= 116 && x < 138) continue;
      if (Math.random() < 0.06) continue;
      c.fillStyle = shirts[(Math.random() * shirts.length) | 0]; c.fillRect(x + 2, y + 5, 6, 7);
      c.fillStyle = skin[(Math.random() * skin.length) | 0]; c.beginPath(); c.arc(x + 5, y + 3.5, 2.4, 0, Math.PI * 2); c.fill();
      if (Math.random() < 0.25) { c.fillStyle = shirts[(Math.random() * shirts.length) | 0]; c.fillRect(x + 2.5, y + 0.6, 5, 1.8); }   // caps
    }
    c.fillStyle = '#4a5070'; c.fillRect(120, 0, 16, h);                       // aisle stairs
    for (let y = 0; y < h; y += 8) { c.fillStyle = '#5c6386'; c.fillRect(120, y, 16, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBowlExtras(R, ring) {
  const s = R.scene;
  // glass + rail along the front of each deck
  const glass = R.quality === 'potato'   // Chromebook: unlit glass (a big transparent ring of physical shading is costly fill)
    ? new THREE.MeshBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  ring(1.0, 2.2, 3.2, glass, 24);
  ring(1.52, 27, 28, glass, 24);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9d1e0, metalness: 0.7, roughness: 0.3 });
  for (const [sc, y] of [[1.0, 3.2], [1.52, 28]]) {
    const pts = []; for (let i = 0; i <= 220; i++) { const [x, z] = R.bowlPoint(i / 220 * Math.PI * 2, sc); pts.push(new THREE.Vector3(x, y, z)); }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    s.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 440, 0.06, 5, true), railMat));
  }
  // facade boards on the upper ring
  const facade = tex(2048, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#141a3a'); g.addColorStop(1, '#0a0e22'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f6c445'; c.fillRect(0, h - 8, w, 4); c.fillRect(0, 6, w, 2);
    c.font = '900 64px "Big Shoulders Display", Impact, sans-serif'; c.textBaseline = 'middle';
    const words = ['ENDZONE KINGS', 'HABIR STUDIOS', 'KINGS BOWL', 'ENDZONE KINGS', 'GAME DAY'];
    let x = 30; let i = 0;
    while (x < w) { c.fillStyle = i % 2 ? '#ffffff' : '#f6c445'; const t = words[i % words.length]; c.fillText(t, x, h / 2 + 4); x += c.measureText(t).width + 90; i++; }
  });
  facade.wrapS = THREE.RepeatWrapping;
  const fr = ring(1.951, 51, 57, new THREE.MeshBasicMaterial({ map: facade, side: THREE.DoubleSide, color: 0xbfbfbf }), 5);
  fr.scale.set(0.996, 1, 0.996); fr.position.z = 50 * 0.004;
  // concourse light strip between decks
  ring(1.43, 19.2, 19.6, new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false, side: THREE.DoubleSide }), 1);
  // roof trusses and a catwalk ring
  const truss = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0x2a3150, metalness: 0.5, roughness: 0.5 }), 64);
  const o = new THREE.Object3D();
  for (let i = 0; i < 64; i++) {
    const t = i / 64 * Math.PI * 2, [x1, z1] = R.bowlPoint(t, 1.95), [x2, z2] = R.bowlPoint(t, 1.45);
    const len = Math.hypot(x2 - x1, z2 - z1);
    o.position.set((x1 + x2) / 2, 63.6, (z1 + z2) / 2); o.lookAt(x2, 63.6, z2); o.scale.set(1, 1, len); o.updateMatrix(); truss.setMatrixAt(i, o.matrix);
  }
  s.add(truss);
  const cpts = []; for (let i = 0; i <= 120; i++) { const [x, z] = R.bowlPoint(i / 120 * Math.PI * 2, 1.45); cpts.push(new THREE.Vector3(x, 63.4, z)); }
  s.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts, true), 240, 0.35, 5, true), new THREE.MeshStandardMaterial({ color: 0x2a3150, metalness: 0.5, roughness: 0.5 })));
  // hanging speaker clusters
  const spk = new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.6 });
  for (const [x, z] of [[-22, 10], [22, 10], [-22, 90], [22, 90], [0, 50]]) {
    const g = new THREE.Group(); g.position.set(x, 50, z);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.0), spk); b.position.y = -i * 0.75; b.rotation.y = i * 0.15; g.add(b); }
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 13, 4), spk); wire.position.y = 6.8; g.add(wire);
    s.add(g);
  }
  // flags on the rim
  R.flags = [];
  const flagGeo = new THREE.PlaneGeometry(3, 1.8, 6, 1); flagGeo.translate(1.5, 0, 0);
  for (let i = 0; i < 16; i++) {
    const t = i / 16 * Math.PI * 2, [x, z] = R.bowlPoint(t, 1.9);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), new THREE.MeshStandardMaterial({ color: 0xd0d6e2, metalness: 0.6 })); pole.position.set(x, 65.5, z); s.add(pole);
    const fm = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
    const f = new THREE.Mesh(flagGeo.clone(), fm); f.position.set(x, 67, z); s.add(f);
    R.flags.push({ f, base: f.geometry.attributes.position.array.slice(), ph: i * 0.7, k: i % 2 });
  }
}
export function colorFlags(R, teams) {
  if (!R.flags) return;
  for (const fl of R.flags) {
    const t = TEAMS[teams[fl.k]];
    if (fl.f.material.map) fl.f.material.map.dispose();
    fl.f.material.map = tex(128, 80, (c, w, h) => { c.fillStyle = t.jersey; c.fillRect(0, 0, w, h); c.fillStyle = vis(t, 'trim'); c.fillRect(0, h * 0.42, w, h * 0.16); drawLogo(c, teams[fl.k], 56, 36, 12); });
    fl.f.material.needsUpdate = true;
  }
}
export function waveFlags(R) {
  if (!R.flags) return;
  for (const fl of R.flags) {
    const a = fl.f.geometry.attributes.position, b = fl.base;
    for (let i = 0; i < a.count; i++) { const x = b[i * 3]; a.setZ(i, Math.sin(R.time * 4 + fl.ph + x * 1.6) * 0.18 * (x / 3)); }
    a.needsUpdate = true;
  }
}

// ---------------- extra stadium detail: hanging banners, tunnels, exit lights, cheer squads ----------------
export function buildStadiumDetail(R) {
  const s = R.scene, lite = R.quality === 'potato', o = new THREE.Object3D();
  const poleMat = M(0x2a2f3c, { metalness: 0.6, roughness: 0.4 });
  // championship and division banners hanging from the roof at both ends
  const banner = (top, mid, low, col) => tex(128, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f6c445'; c.fillRect(0, 0, w, 10); c.fillRect(8, 18, w - 16, 3); c.fillRect(8, h - 24, w - 16, 3);
    c.beginPath(); c.moveTo(0, h - 14); c.lineTo(w / 2, h); c.lineTo(w, h - 14); c.lineTo(w, h); c.lineTo(0, h); c.fillStyle = '#05070f'; c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 30px "Big Shoulders Display", Impact, sans-serif'; c.fillText(top, w / 2, 60);
    c.font = '900 64px "Big Shoulders Display", Impact, sans-serif'; c.fillStyle = '#f6c445'; c.fillText(mid, w / 2, 150);
    c.font = '800 24px "Big Shoulders Display", Impact, sans-serif'; c.fillStyle = '#d7def7'; low.split('|').forEach((l, i) => c.fillText(l, w / 2, 222 + i * 28));
  });
  const kinds = [['KINGS BOWL', '★', 'CHAMPIONS|2019', ['#14205a', '#070b22']], ['KINGS BOWL', '★', 'CHAMPIONS|2023', ['#14205a', '#070b22']], ['DIVISION', '7×', 'CHAMPIONS', ['#3a0c18', '#12040a']],
    ['CONFERENCE', '4×', 'CHAMPIONS', ['#0b3a2a', '#03120c']], ['RETIRED', '12', 'THE|CAPTAIN', ['#2a1f05', '#0d0902']], ['RETIRED', '88', 'MR.|SUNDAY', ['#2a1f05', '#0d0902']]];
  const bgeo = new THREE.PlaneGeometry(5, 12.5);
  let bi = 0;
  for (const base of [Math.PI / 2, Math.PI * 1.5]) for (let j = -2; j <= 2; j++) {
    const t = base + j * 0.16, [x, z] = R.bowlPoint(t, 1.5), k = kinds[bi++ % kinds.length];
    const m = new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ map: banner(...k), side: THREE.DoubleSide, roughness: 0.85 }));
    m.position.set(x, 55, z); m.lookAt(0, 55, 50); s.add(m);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 0.12), poleMat); rod.position.set(x, 61.3, z); rod.lookAt(0, 61.3, 50); s.add(rod);
  }
  // tunnels (vomitories) cut into the lower bowl, each with a lit frame and a green exit sign
  const vN = 16, dark = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 3.4, 3.2), new THREE.MeshBasicMaterial({ color: 0x020308 }), vN);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(4.8, 0.25, 3.3), new THREE.MeshBasicMaterial({ color: 0xbfc8e6, toneMapped: false }), vN);
  const exitM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.1), new THREE.MeshBasicMaterial({ color: 0x29ff7a, toneMapped: false }), vN * 2);
  for (let i = 0; i < vN; i++) {
    const t = (i + 0.5) / vN * Math.PI * 2, [x, z] = R.bowlPoint(t, 1.2);
    o.position.set(x, 10, z); o.lookAt(0, 10, 50); o.scale.set(1, 1, 1); o.updateMatrix(); dark.setMatrixAt(i, o.matrix);
    o.position.y = 11.8; o.updateMatrix(); frame.setMatrixAt(i, o.matrix);
    o.position.y = 12.4; o.updateMatrix(); exitM.setMatrixAt(i, o.matrix);
    const [x2, z2] = R.bowlPoint(t + 0.09, 1.43); o.position.set(x2, 20.1, z2); o.lookAt(0, 20.1, 50); o.updateMatrix(); exitM.setMatrixAt(vN + i, o.matrix);
  }
  s.add(dark, frame, exitM);
  // cheer squads at the four corners: shell top and pleated skirt in team colors, real faces, ponytails with bows,
  // white sneakers, poms in the trim color. They shake harder when the place gets loud.
  buildCheer(R);
}
function buildCheer(R) {
  const s = R.scene, lite = R.quality === 'potato', N = 24, parts = {};
  const g = {
    top: R.lathe('ch_top', [[0.0001, 0.5], [0.06, 0.5], [0.075, 0.47], [0.155, 0.43], [0.17, 0.36], [0.16, 0.27], [0.13, 0.12], [0.12, 0.0], [0.0001, 0]], 14),
    band: new THREE.CylinderGeometry(0.168, 0.172, 0.035, 14, 1, true),
    skirt: new THREE.CylinderGeometry(0.125, 0.29, 0.3, lite ? 10 : 20, 1, true),
    hem: new THREE.TorusGeometry(0.29, 0.016, 5, lite ? 12 : 24),
    neck: new THREE.CylinderGeometry(0.042, 0.048, 0.1, 8),
    leg: R.limbGeo('ch_leg', 0.072, 0.058, 0.04, 0.82),
    arm: R.limbGeo('ch_arm', 0.044, 0.038, 0.032, 0.54),
    shoe: new THREE.BoxGeometry(0.095, 0.075, 0.21),
    head: new THREE.SphereGeometry(0.112, lite ? 12 : 20, lite ? 10 : 16),
    hair: new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    tail: new THREE.CapsuleGeometry(0.045, 0.24, 3, 8),
    bow: new THREE.BoxGeometry(0.12, 0.05, 0.03),
    pom: (() => { const q = new THREE.IcosahedronGeometry(0.13, lite ? 1 : 3), v = q.attributes.position; for (let i = 0; i < v.count; i++) { const f = 0.8 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.45; v.setXYZ(i, v.getX(i) * f, v.getY(i) * f, v.getZ(i) * f); } q.computeVertexNormals(); return q; })(),   // shaggy tinsel ball
  };
  g.top.scale(1, 1, 0.72); g.band.scale(1, 1, 0.72); g.skirt.translate(0, -0.1, 0); g.hem.rotateX(Math.PI / 2); g.hem.translate(0, -0.25, 0);
  g.tail.translate(0, -0.14, 0); g.shoe.translate(0, -0.85, 0.04);
  const mk = (geo, opt = {}) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: opt.ds ? THREE.DoubleSide : THREE.FrontSide, ...(opt.m || {}) }), N); m.frustumCulled = false; m.castShadow = !lite; s.add(m); return m; };
  for (const k of ['top', 'band', 'neck', 'legL', 'legR', 'armL', 'armR', 'shoeL', 'shoeR', 'hair', 'tail', 'bow']) parts[k] = mk(g[k.replace(/[LR]$/, '')]);
  parts.skirt = mk(g.skirt, { ds: true }); parts.hem = mk(g.hem);
  parts.pomL = mk(g.pom, { m: { roughness: 0.3, metalness: 0.45 } }); parts.pomR = new THREE.InstancedMesh(g.pom, parts.pomL.material, N); parts.pomR.frustumCulled = false; s.add(parts.pomR);
  parts.head = new FaceSet(R, g.head, N, lite ? 4 : 8, 31337, true);
  const hairs = ['#1a0f08', '#3b2414', '#6b4a2a', '#c99a55', '#0d0d0d', '#8a3b1c'].map(c => new THREE.Color(c));
  const poses = [];
  for (let i = 0; i < N; i++) {
    const k = i < N / 2 ? 0 : 1, sx = k === 0 ? -1 : 1, j = i % (N / 2), end = j < 6 ? 0 : 1, n = j % 6, F = parts.head.face(i);
    poses.push({ k, x: sx * (HALF_W + 3.4 + (n % 2) * 1.15), z: end ? 95.5 + n * 1.3 : 4.5 - n * 1.3, face: sx < 0 ? Math.PI / 2 : -Math.PI / 2, ph: n * 0.55 + k, skin: new THREE.Color(F.skin), hair: hairs[(i * 5) % hairs.length], white: new THREE.Color(0xf4f6fb) });
  }
  R.cheer = { parts, poses, lite };
  for (const [i, p] of poses.entries()) {
    for (const k of ['neck', 'legL', 'legR', 'armL', 'armR']) parts[k].setColorAt(i, p.skin);
    parts.hair.setColorAt(i, p.hair); parts.tail.setColorAt(i, p.hair); parts.shoeL.setColorAt(i, p.white); parts.shoeR.setColorAt(i, p.white);
  }
  placeCheer(R, 0, 0);
}
export function colorCheer(R, teams) {
  const C = R.cheer; if (!C) return;
  C.poses.forEach((p, i) => {
    const t = TEAMS[teams[p.k]], j = new THREE.Color(vis(t, 'jersey')), tr = new THREE.Color(vis(t, 'trim') === vis(t, 'jersey') ? '#ffffff' : vis(t, 'trim'));
    C.parts.top.setColorAt(i, j); C.parts.skirt.setColorAt(i, j); C.parts.band.setColorAt(i, tr); C.parts.hem.setColorAt(i, tr); C.parts.bow.setColorAt(i, tr);
    C.parts.pomL.setColorAt(i, tr); C.parts.pomR.setColorAt(i, i % 3 ? tr : j);
  });
  for (const m of Object.values(C.parts)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
const _cm = new THREE.Matrix4(), _co = new THREE.Object3D(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4(), _hand = new THREE.Matrix4().makeTranslation(0, -0.56, 0);
function placeCheer(R, t, hype) {
  const C = R.cheer, P = C.parts;
  C.poses.forEach((p, i) => {
    const beat = Math.sin(t + p.ph), hop = hype > 0.45 ? Math.max(0, beat) * 0.25 * hype : Math.max(0, beat) * 0.03;
    _cm.compose(_cv.set(p.x, hop, p.z), _cq.setFromEuler(_ce.set(0, p.face, 0)), _cs);
    const put = (mesh, x, y, z, rx = 0, rz = 0) => { _co.position.set(x, y, z); _co.rotation.set(rx, 0, rz); _co.updateMatrix(); mesh.setMatrixAt(i, _m4.multiplyMatrices(_cm, _co.matrix)); };
    const hy = 0.86, sway = Math.sin(t * 0.5 + p.ph) * 0.06;
    put(P.legL, -0.08, hy, 0, hop > 0.05 ? 0.25 : 0); put(P.legR, 0.08, hy, 0, hop > 0.05 ? -0.15 : 0);
    put(P.shoeL, -0.08, hy, 0, hop > 0.05 ? 0.25 : 0); put(P.shoeR, 0.08, hy, 0, hop > 0.05 ? -0.15 : 0);
    put(P.skirt, 0, hy + 0.08, 0, 0, sway * 0.5); put(P.hem, 0, hy + 0.08, 0, 0, sway * 0.5);
    put(P.top, 0, hy + 0.07, 0); put(P.band, 0, hy + 0.37, 0);
    put(P.neck, 0, hy + 0.61, 0);
    put(P.head, 0, hy + 0.74, 0.01, 0, sway); put(P.hair, 0, hy + 0.75, -0.01, -0.6, sway);
    put(P.bow, 0, hy + 0.84, -0.09, -0.6, sway); put(P.tail, 0, hy + 0.83, -0.1, 0.35 + Math.max(0, beat) * 0.35, sway * 2);
    const a = -1.4 - (beat * 0.5 + 0.5) * 1.6, b = i % 2 ? a : -1.4 - (0.5 - beat * 0.5) * 1.6;   // arms swing from straight out up over the head
    put(P.armL, -0.2, hy + 0.48, 0, a, -0.3); put(P.armR, 0.2, hy + 0.48, 0, b, 0.3);
    P.armL.getMatrixAt(i, _m4); P.pomL.setMatrixAt(i, _m4.multiply(_hand));
    P.armR.getMatrixAt(i, _m4); P.pomR.setMatrixAt(i, _m4.multiply(_hand));
  });
  for (const m of Object.values(P)) m.instanceMatrix.needsUpdate = true;
}
export function updateCheer(R) {
  const C = R.cheer; if (!C) return;
  // the routine's clock runs smoothly: a louder crowd speeds it up a little, but it never jumps or goes frantic
  const now = R.time, dt = Math.min(0.1, Math.max(0, now - (C._t ?? now))); C._t = now;
  C.phase = (C.phase || 0) + dt * (3.2 + Math.min(1, R.hype || 0) * 1.6);
  if (C.lite) { C._acc = (C._acc || 0) + 1; if (C._acc % 3) return; }   // Chromebook: still dances, a third as often
  placeCheer(R, C.phase, R.hype || 0);
}
