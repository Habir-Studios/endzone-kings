// ENDZONE KINGS — stadium dressing: sidelines (benches, players, coaches, coolers), chain gang, camera crews,
// skycam, railings, roof trusses, speakers, flags and facade boards.
import * as THREE from 'three';
import { TEAMS, HALF_W } from './sim.js?v=1792263919';
import { drawLogo } from './logos.js?v=1792263919';

const vis = (t, k) => (t[k] === '#121a14' ? '#18c964' : t[k]);
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t._canvas = c; return t;
}
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

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

  // sideline players: 24 per team, standing along the coaches' box or sitting on the bench
  const N = 48, parts = {};
  const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), N); m.castShadow = true; m.frustumCulled = false; s.add(m); return m; };
  for (const [k, geo] of [['torso', P.torso], ['pads', P.pads], ['head', P.head], ['helmet', P.helmet], ['legL', P.leg], ['legR', P.leg], ['armL', P.arm], ['armR', P.arm]]) parts[k] = mk(geo);
  side.people = parts; side.poses = [];
  const skins = ['#4a2c18', '#6b4226', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    const k = i < N / 2 ? 0 : 1, sx = k === 0 ? -1 : 1, j = i % (N / 2);
    const sitting = j >= 17;
    const x = sitting ? sx * (HALF_W + 9.1) : sx * (HALF_W + 4.0 + Math.random() * 2.6);
    const z = sitting ? 34 + (j - 17) * 4.4 + Math.random() : 31 + j * 2.25 + (Math.random() - 0.5) * 1.2;
    const helmOn = !sitting && Math.random() < 0.55;
    side.poses.push({ k, x, z, sitting, helmOn, face: (sx < 0 ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * 0.6, ph: Math.random() * 6, skin: skins[(Math.random() * skins.length) | 0], size: 0.95 + Math.random() * 0.25 });
  }
  placeSidelinePeople(R, 0, 0);

  // coaches with headsets and play sheets
  side.coaches = [];
  for (let k = 0; k < 2; k++) for (let c = 0; c < 2; c++) {
    const sx = k === 0 ? -1 : 1, g = new THREE.Group();
    const polo = M(0x334488), khaki = M(0xc8b48a), skin = M(['#8d5524', '#e0ac69', '#c68642', '#f1c27d'][(k * 2 + c) % 4]);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.85, 10), khaki); legs.position.y = 0.43; g.add(legs);
    const body = new THREE.Mesh(R.lathe('coach_torso', [[0.0001, 0.62], [0.16, 0.6], [0.22, 0.45], [0.23, 0.2], [0.2, 0.0], [0.0001, 0]], 12), polo); body.position.y = 0.85; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.62; g.add(head);
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
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M(['#c68642', '#8d5524', '#f1c27d'][i])); head.position.y = 1.6; p.add(head);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; }); cg.add(p); side.crew.push(p);
  }
  side.lastDown = -1;

  // photographers along the end lines and a couple of big TV cameras on the far sideline
  const camBody = M(0x1a1c22, { metalness: 0.4, roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const p = new THREE.Group();
    const end = i < 5 ? -1 : 1, x = (i % 5 - 2) * 6.5 + (Math.random() - 0.5) * 2, z = end < 0 ? -13.2 : 113.2;
    const body = new THREE.Mesh(R.lathe('photo_torso', [[0.0001, 0.55], [0.15, 0.53], [0.2, 0.38], [0.19, 0.12], [0.0001, 0.05]], 10), M(Math.random() < 0.5 ? 0x22262f : 0x3a4250)); body.position.y = 0.42; p.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M(['#8d5524', '#e0ac69', '#c68642', '#f1c27d', '#6b4226'][i % 5])); head.position.y = 1.08; p.add(head);
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

function placeSidelinePeople(R, t, hype) {
  const side = R.side, P = side.people, o = new THREE.Object3D();
  side.poses.forEach((p, i) => {
    const bob = p.sitting ? 0 : Math.sin(t * 1.4 + p.ph) * 0.02;
    const jump = !p.sitting && hype > 0.5 ? Math.max(0, Math.sin(t * 6 + p.ph * 3)) * 0.35 * (hype - 0.4) : 0;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(p.x, bob + jump, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.face, 0)), new THREE.Vector3(p.size, p.size, p.size));
    const put = (mesh, x, y, z, rx = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.scale.set(1, 1, 1); o.updateMatrix(); mesh.setMatrixAt(i, base.clone().multiply(o.matrix)); };
    const hy = p.sitting ? 0.55 : 0.92;                 // hip height
    put(P.torso, 0, hy, 0);
    put(P.pads, 0, hy + 0.57, 0);
    put(P.head, 0, hy + 0.82, 0.02);
    if (p.helmOn) put(P.helmet, 0, hy + 0.84, 0.0);
    else put(P.helmet, 0.34, hy + 0.05, 0.12);        // helmet carried at his side
    const cheer = jump > 0.05 ? -2.7 : 0;
    if (p.sitting) { put(P.legL, -0.1, hy, 0, -1.45); put(P.legR, 0.1, hy, 0, -1.45); }
    else { put(P.legL, -0.1, hy, 0); put(P.legR, 0.1, hy, 0); }
    put(P.armL, -0.3, hy + 0.55, 0, cheer || (p.sitting ? -0.5 : 0), 0.15);
    put(P.armR, 0.3, hy + 0.55, 0, cheer || (p.helmOn ? 0 : -0.15), -0.15);
  });
  for (const m of Object.values(P)) m.instanceMatrix.needsUpdate = true;
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
    const mats = side['banner' + k].material; mats[4].map = ban; mats[5].map = ban; mats[4].needsUpdate = mats[5].needsUpdate = true;
    for (const c of side.coaches) if (c.k === k) { c.polo.color.set(vis(t, 'jersey')); }
  });
  const P = side.people;
  side.poses.forEach((p, i) => {
    const t = TEAMS[teams[p.k]];
    P.torso.setColorAt(i, new THREE.Color(t.jersey)); P.pads.setColorAt(i, new THREE.Color(t.jersey));
    P.legL.setColorAt(i, new THREE.Color(t.pants)); P.legR.setColorAt(i, new THREE.Color(t.pants));
    P.helmet.setColorAt(i, new THREE.Color(t.helmet)); P.head.setColorAt(i, p.skin);
    P.armL.setColorAt(i, p.skin); P.armR.setColorAt(i, p.skin);
  });
  for (const m of Object.values(P)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

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
  const want = new THREE.Vector3(f.x * 0.5, 20 + Math.sin(R.time * 0.4) * 0.6, f.z - 16 * d);
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
    c.fillStyle = '#4a5070'; c.fillRect(120, 0, 16, h);                       // aisle stairs
    for (let y = 0; y < h; y += 8) { c.fillStyle = '#5c6386'; c.fillRect(120, y, 16, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBowlExtras(R, ring) {
  const s = R.scene;
  // glass + rail along the front of each deck
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
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
