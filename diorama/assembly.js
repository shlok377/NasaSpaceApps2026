import { defineWorld } from '@diorama/worlds';

// Block-by-block assembly: a gantry crane lifts each module off its pallet and seats it
// on the stack (base -> 2 tanks -> 2 wings -> cockpit -> nose). Same panels, rivets,
// cyan window, orange bars and red wings/nose as the /assets sprites.
const duration = 15, TAU = Math.PI * 2;
const WHITE = '#eceef5', PANEL = '#f7f4ea', RED = '#d63a3a', ORANGE = '#f0a02e',
  CYAN = '#22c0e0', BLUE = '#2f6fd0', NAVY = '#33478f', GREY = '#a3a3b0';
const R = { x: .2, y: .06, z: -.9 };           // rocket foot on its pad
const MAST = { x: -3.2, z: -2.4 }, JIB_Y = 5.2, HOOK_MAX = 5.0;
const T0 = .6, SL = 1.7, END = T0 + 7 * SL, OUT = 14.4;
const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;
const polar = (x, z) => ({ a: Math.atan2(z - MAST.z, x - MAST.x), r: Math.hypot(x - MAST.x, z - MAST.z) });

// kind, height, slot (offset on rocket), pallet spot, height of stack when it arrives
const PARTS = [
  { kind: 'base',    hp: 1.05, slot: [0, 0, 0],     spot: [-2.2, 1.8],  top: 0 },
  { kind: 'fuel',    hp: .75,  slot: [0, 1.05, 0],  spot: [-3.6, -.6],  top: 1.05 },
  { kind: 'fuel',    hp: .75,  slot: [0, 1.8, 0],   spot: [-3.6, .3],   top: 1.8 },
  { kind: 'wingL',   hp: .85,  slot: [-.375, 1.05, 0], spot: [-3.6, 1.1], top: 2.55 },
  { kind: 'wingR',   hp: .85,  slot: [.375, 1.05, 0],  spot: [-2.6, .3],  top: 2.55 },
  { kind: 'cockpit', hp: .75,  slot: [0, 2.55, 0],  spot: [-2.5, -.6],  top: 2.55 },
  { kind: 'nose',    hp: .88,  slot: [0, 3.3, 0],   spot: [-3.6, 2.0],  top: 3.3 },
];
for (const p of PARTS) {
  p.pick = polar(...p.spot); p.sl = polar(R.x + p.slot[0], R.z + p.slot[2]);
  p.hyLow = .06 + p.hp + .3; p.hyAbove = p.hyLow + 1.2;
  p.carry = Math.min(HOOK_MAX, Math.max(p.hyAbove, R.y + p.top + .15 + .3 + p.hp));
  p.hySlot = R.y + p.slot[1] + p.hp + .3; p.hyUp = p.hySlot + .5;
}
const REST = { a: PARTS[0].pick.a, r: PARTS[0].pick.r, y: PARTS[0].hyAbove };
const endPose = i => ({ a: PARTS[i].sl.a, r: PARTS[i].sl.r, y: PARTS[i].hyUp });
const mix = (p, q, u) => ({ a: lerp(p.a, q.a, u), r: lerp(p.r, q.r, u), y: lerp(p.y, q.y, u) });

function hookPose(t) {
  if (t < T0) return REST;
  if (t >= END) return mix(endPose(6), REST, sm((t - END) / .9));
  const i = Math.min(6, Math.floor((t - T0) / SL)), s = t - T0 - i * SL, P = PARTS[i];
  const prev = i ? endPose(i - 1) : REST;
  const above = { a: P.pick.a, r: P.pick.r, y: P.hyAbove };
  if (s < .35) return mix(prev, above, sm(s / .35));
  if (s < .55) return { ...above, y: lerp(P.hyAbove, P.hyLow, sm((s - .35) / .2)) };
  if (s < .75) return { ...above, y: lerp(P.hyLow, P.carry, sm((s - .55) / .2)) };
  if (s < 1.2) return mix({ ...above, y: P.carry }, { a: P.sl.a, r: P.sl.r, y: P.carry }, sm((s - .75) / .45));
  if (s < 1.45) return { a: P.sl.a, r: P.sl.r, y: lerp(P.carry, P.hySlot, sm((s - 1.2) / .25)) };
  return { a: P.sl.a, r: P.sl.r, y: lerp(P.hySlot, P.hyUp, sm((s - 1.45) / .25)) };
}
const hookXZ = h => [MAST.x + h.r * Math.cos(h.a), MAST.z + h.r * Math.sin(h.a)];

export default defineWorld({
  name: 'assembly', title: 'Built block by block', duration, still: 10.0,
  description: 'On the grey Moon a gantry crane lifts seven white-panelled modules off their pallets and seats them on a launch pad one at a time: thruster base, two fuel tanks, two red wings, cockpit and nose cone. A technician watches the hook and waves when it is done; the rocket then folds away and the pallets refill.',
  bounds: [[-4.9, -.45, -3.5], [4.9, 5.4, 3.5]],
  contactTimes: PARTS.flatMap((_, i) => [T0 + i * SL + 1.0, T0 + i * SL + 1.5]),
  build(W) {
    const { box, ball, cylinder, line, ring, group, THREE } = W;
    W.terrain(10, 7.2, '#9b9ba8', 91);
    for (const [x, z, r] of [[.9, 2.4, .7], [3.9, .4, .5], [-.8, -2.7, .55]]) {
      W.surface(r * 2, r * 2, '#80808f', x, .03, z, 5 + Math.round(r * 10), .1); ring(r, '#c4c4cf', x, .05, z, undefined, .05);
    }
    for (let i = 0; i < 28; i++) {
      const x = (W.random() - .5) * 9.2, z = (W.random() - .5) * 6.2;
      if (Math.hypot(x - R.x, z - R.z) < 1.5 || Math.hypot(x - MAST.x, z - MAST.z) < .8 || PARTS.some(p => Math.hypot(x - p.spot[0], z - p.spot[1]) < .9)) continue;
      const b = ball(.05 + W.random() * .09, i % 3 ? '#8c8c99' : '#b5b5c0', x, .03, z); b.scale.y *= .6;
    }
    // Launch pad + pallets.
    cylinder(1.45, .06, '#7d7d8c', R.x, .03, R.z, undefined, 24); ring(1.2, CYAN, R.x, .065, R.z, undefined, .03);
    for (const p of PARTS) box(.85, .06, .85, '#6e7188', p.spot[0], .03, p.spot[1]);

    const mat = c => W.own(new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
    const solid = (g, geo, c, x, y, z) => { W.own(geo); const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const faces = (g, y, fn) => { for (const r of [0, Math.PI / 2]) { const f = group(0, y, 0, g); f.rotation.y = r; fn(f); } };
    const studs = (f, h) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) ball(.034, RED, sx * .3, sy * (h / 2 - .08), .385, f); };
    const wingShape = new THREE.Shape(); wingShape.moveTo(0, .85); wingShape.lineTo(0, 0); wingShape.lineTo(.62, 0); wingShape.closePath();

    // Each module is built with its origin at bottom-centre.
    function makePart(P) {
      const g = group();
      if (P.kind === 'base') {
        box(.75, .6, .75, WHITE, 0, .75, 0, g);
        faces(g, .75, f => { studs(f, .6); box(.5, .2, .03, NAVY, 0, 0, .38, f); box(.36, .07, .035, RED, 0, 0, .39, f); });
        solid(g, new THREE.CylinderGeometry(.2, .38, .45, 8, 1, true), BLUE, 0, .225, 0);
        solid(g, new THREE.CylinderGeometry(.2, .2, .04, 8), RED, 0, .45, 0);
        for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          line([[sx * .3, .75, sz * .3], [sx * .8, .05, sz * .8]], '#6b6f85', .045, g);
          cylinder(.13, .05, '#8a8ea3', sx * .8, .03, sz * .8, g, 8);
        }
      } else if (P.kind === 'fuel') {
        box(.75, .75, .75, WHITE, 0, .375, 0, g);
        faces(g, .375, f => { studs(f, .75); box(.5, .5, .03, PANEL, 0, 0, .38, f); for (const x of [-.13, 0, .13]) box(.06, .38, .04, ORANGE, x, 0, .385, f); });
      } else if (P.kind === 'cockpit') {
        box(.75, .75, .75, WHITE, 0, .375, 0, g);
        faces(g, .375, f => { studs(f, .75); box(.5, .5, .03, '#1f5fa8', 0, 0, .38, f); box(.4, .4, .035, '#58c8ee', 0, 0, .385, f); box(.12, .3, .04, '#c8f1fb', -.1, .02, .39, f); });
      } else if (P.kind === 'nose') {
        solid(g, new THREE.CylinderGeometry(.38, .39, .08, 8), GREY, 0, .04, 0);
        solid(g, new THREE.ConeGeometry(.4, .8, 8), RED, 0, .48, 0);
      } else {
        const s = P.kind === 'wingL' ? -1 : 1;
        const m = solid(g, new THREE.ExtrudeGeometry(wingShape, { depth: .1, bevelEnabled: false }), RED, 0, 0, -.05);
        m.scale.x = s; if (s < 0) m.material.side = THREE.DoubleSide;
        ball(.035, WHITE, s * .4, .07, .07, g); ball(.035, NAVY, s * .22, .07, .07, g);
      }
      return g;
    }
    const blocks = PARTS.map(makePart);
    const beacon = ball(1, '#ffe27a', R.x, R.y + 4.25, R.z);

    // ---- Gantry crane ----------------------------------------------------
    const mast = group(MAST.x, 0, MAST.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.06, JIB_Y, .06, WHITE, sx * .2, JIB_Y / 2, sz * .2, mast);
    for (let y = .4; y < JIB_Y; y += .6) {
      box(.46, .04, .04, '#c9ccd8', 0, y, .2, mast); box(.46, .04, .04, '#c9ccd8', 0, y, -.2, mast);
      box(.04, .04, .46, '#c9ccd8', .2, y, 0, mast); box(.04, .04, .46, '#c9ccd8', -.2, y, 0, mast);
    }
    box(.5, .5, .5, RED, 0, .25, 0, mast); box(.52, .12, .52, ORANGE, 0, .56, 0, mast);
    const jib = group(MAST.x, JIB_Y, MAST.z);
    box(6.4, .14, .16, RED, 2.0, 0, 0, jib); box(.5, .4, .4, '#8a8ea3', -1.1, -.2, 0, jib);
    box(.45, .38, .42, WHITE, 0, -.25, 0, jib); box(.3, .2, .44, '#58c8ee', 0, -.2, 0, jib);
    box(.1, .5, .1, RED, 0, .3, 0, jib); ball(.06, '#ffe27a', 0, .6, 0, jib);
    const trolley = box(.26, .12, .22, ORANGE, 0, -.12, 0, jib);
    const cable = box(.025, 1, .025, '#4a4d63', 0, -.5, 0, jib);
    const chain = box(.025, .3, .025, '#4a4d63', 0, -2, 0, jib);
    const hook = box(.14, .1, .14, ORANGE, 0, -2, 0, jib);

    // ---- Technician --------------------------------------------------------
    const WK = { x: 2.5, z: -.2 };
    const ast = W.person(WK.x, WK.z, WHITE, '#d4d7e3', .92, '#c99a78');
    ast.root.rotation.y = Math.atan2(R.x - WK.x, R.z - WK.z);
    ball(.215, '#f3f4fa', 0, .05, 0, ast.head); box(.2, .13, .06, CYAN, 0, .05, .185, ast.head);
    box(.34, .42, .16, '#cfd3e0', 0, .3, -.2, ast.chest); box(.34, .06, .165, RED, 0, .46, -.2, ast.chest);

    // Parked rover and spark pool.
    const rover = group(3.4, 0, -2.3); rover.rotation.y = -.6;
    box(.9, .2, .5, WHITE, 0, .38, 0, rover); box(.5, .12, .36, CYAN, -.05, .54, 0, rover); box(.9, .045, .52, RED, 0, .28, 0, rover);
    for (const x of [-.34, .34]) for (const z of [-.33, .33]) { const w = cylinder(.15, .1, '#4a4d63', x, .15, z, rover, 10); w.rotation.x = Math.PI / 2; }
    const dish = group(.25, .92, 0, rover); cylinder(.025, .35, GREY, 0, -.2, 0, dish); const bowl = cylinder(.15, .04, WHITE, 0, 0, .06, dish, 12); bowl.rotation.x = Math.PI / 2.4;
    const sparks = [];
    for (let i = 0; i < 8; i++) sparks.push({ p: ball(1, i % 2 ? '#ffe27a' : '#e8e8f0', R.x, .1, R.z), a: i / 8 * TAU });
    return { blocks, beacon, jib, trolley, cable, chain, hook, ast, dish, sparks, v: new THREE.Vector3(), hw: [0, 0, 0], WK };
  },
  tick({ t, parts: p, W }) {
    const kOut = 1 - sm((t - OUT) / .55);
    const h = hookPose(t), [hx, hz] = hookXZ(h);
    p.jib.rotation.y = -h.a;
    p.trolley.position.x = h.r;
    const len = JIB_Y - h.y;
    p.cable.scale.y = len; p.cable.position.set(h.r, -len / 2 - .06, 0);
    p.hook.position.set(h.r, h.y - JIB_Y, 0); p.chain.position.set(h.r, h.y - JIB_Y - .15, 0);
    PARTS.forEach((P, i) => {
      const g = p.blocks[i], s = t - T0 - i * SL, kIn = sm((t - (.1 + i * .07)) / .35);
      let x, y, z, sq = 1;
      if (s < .55) { x = P.spot[0]; y = .06; z = P.spot[1]; }
      else if (s < 1.45) { x = hx; z = hz; y = h.y - .3 - P.hp; }
      else {
        const m = kOut * kOut;   // shrink first, drift back to the pallet at the very end (loop seam)
        x = lerp(P.spot[0], R.x + P.slot[0], m); y = lerp(.06, R.y + P.slot[1], m); z = lerp(P.spot[1], R.z + P.slot[2], m);
        const u = (s - 1.45) / .25; if (u >= 0 && u < 1) sq = 1 - .07 * Math.sin(Math.PI * u);
      }
      const k = Math.max(.001, kIn * kOut);
      g.position.set(x, y, z); g.scale.set(k, k * sq, k);
      // Seated spark burst.
      const tp = s - 1.45;
      if (tp >= 0 && tp < .5) {
        const rad = (P.kind.startsWith('wing') ? .3 : .5) + tp * .7, e = Math.sin(Math.PI * tp / .5);
        p.sparks.forEach(sp => { sp.p.position.set(x + Math.cos(sp.a) * rad, R.y + P.slot[1] + .08 + tp * .3, z + Math.sin(sp.a) * rad); sp.p.scale.setScalar(.001 + .05 * e); });
      }
    });
    if (!PARTS.some((P, i) => { const tp = t - T0 - i * SL - 1.45; return tp >= 0 && tp < .5; })) p.sparks.forEach(sp => sp.p.scale.setScalar(.001));
    const done = sm((t - END) / .3) * kOut, a = t / duration * TAU;
    p.beacon.scale.setScalar(.001 + done * (.035 + .045 * Math.max(0, Math.sin(a * 6)) ** 2));
    p.dish.rotation.y = a;
    // Technician tracks the hook, then waves once the nose is on.
    const rootYaw = Math.atan2(R.x - p.WK.x, R.z - p.WK.z);
    const yaw = Math.atan2(hx - p.WK.x, hz - p.WK.z) - rootYaw;
    p.ast.head.rotation.set(-.25 + .2 * Math.max(0, 1 - h.y / 5), Math.max(-1, Math.min(1, Math.atan2(Math.sin(yaw), Math.cos(yaw)))) * .9, 0);
    W.plant(p.ast, { crouch: .02, lean: .04, twist: 0 });
    const w = sm((t - 12.7) / .3) * (1 - sm((t - 14.2) / .3));
    p.ast.rightArm.rotation.x = -2.5 * w; p.ast.rightArm.rotation.z = w * (.35 + .35 * Math.sin(t * 9));
    p.ast.rightForearm.rotation.x = -.4 * w;
    p.jib.updateMatrixWorld(true); p.hook.getWorldPosition(p.v); p.hw = p.v.toArray();
  },
  contacts({ t, parts: p }) {
    const out = [], i = Math.min(6, Math.floor((t - T0) / SL)), P = PARTS[i];
    {
      const g = p.blocks[i];
      if (t - T0 - i * SL < 1.3) out.push({ label: `hook holds block ${i}`, a: [p.hw[0], p.hw[1] - .3, p.hw[2]], b: [g.position.x, g.position.y + P.hp * g.scale.y, g.position.z] });
      else out.push({ label: `block ${i} seated on stack`, a: g.position.toArray(), b: [R.x + P.slot[0], R.y + P.slot[1], R.z + P.slot[2]] });
    }
    return out;
  }
});
