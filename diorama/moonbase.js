import { defineWorld } from '@diorama/worlds';

// Planting the flag: tamp, tamp, step back. Same chunky white-panel, red-and-cyan
// look as the sprites in /assets (cockpit, fuel, thrust, tip, wings, flag, moon).
const duration = 6, TAU = Math.PI * 2;
const WHITE = '#eceef5', PANEL = '#f7f4ea', RED = '#d63a3a', ORANGE = '#f0a02e',
  CYAN = '#22c0e0', BLUE = '#2f6fd0', NAVY = '#33478f', GREY = '#a3a3b0';
const FLAG = [1.55, 0, .35];           // flag foot (x, y, z)
const IMPACTS = [1.5, 4.5];

// 0..1 pole lift for one tamp: slow raise, fast drive, small settle.
function lift(t) {
  const c = ((t % 3) + 3) % 3;
  if (c < 1.2) { const k = c / 1.2; return k * k * (3 - 2 * k); }
  if (c < 1.5) { const k = (c - 1.2) / .3; return 1 - k * k; }
  return 0;
}
// Seconds since the last impact (for dust).
const since = t => Math.min(...IMPACTS.map(i => ((t - i) % 3 + 3) % 3));

export default defineWorld({
  name: 'moonbase', title: 'First flag on the Moon', duration, still: 1.62,
  description: 'A white-panelled rocket stands on the grey Moon. An astronaut lifts a cyan flag and tamps it into the dust twice, kicking up small puffs, while a beacon blinks on the rocket tip and a rover dish turns.',
  bounds: [[-3.9, -.45, -2.7], [3.9, 4.55, 2.7]], contactTimes: IMPACTS.concat([0.6, 3.6]),
  build(W) {
    const { box, ball, cylinder, line, ring, group, THREE } = W;
    W.terrain(8.4, 6, '#9b9ba8', 77);
    // Craters: darker pits with a lighter rim, boulders and pebbles.
    for (const [x, z, r] of [[-.3, 1.55, .75], [2.6, -.2, .5], [-2.7, -1.5, .6]]) {
      W.surface(r * 2, r * 2, '#80808f', x, .03, z, 5 + Math.round(r * 10), .1);
      ring(r, '#c4c4cf', x, .05, z, undefined, .05);
    }
    for (let i = 0; i < 26; i++) {
      const x = (W.random() - .5) * 7.4, z = (W.random() - .5) * 5;
      if (Math.hypot(x + 1.4, z + .6) < 1.3 || Math.hypot(x - FLAG[0], z - FLAG[2]) < .8) continue;
      const b = ball(.05 + W.random() * .09, i % 3 ? '#8c8c99' : '#b5b5c0', x, .03, z); b.scale.y *= .6;
    }

    // ---- Rocket ------------------------------------------------------------
    const rocket = group(-1.4, 0, -.6);
    const mat = c => W.own(new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
    const solid = (geo, c, x, y, z) => { W.own(geo); const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; rocket.add(m); return m; };
    const faces = (y, h, fn) => { for (const r of [0, Math.PI / 2]) { const g = group(0, y, 0, rocket); g.rotation.y = r; fn(g, h); } };
    const studs = (g, h) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) ball(.034, RED, sx * .3, sy * (h / 2 - .08), .385, g); };
    const body = (y, h) => { box(.75, h, .75, WHITE, 0, y + h / 2, 0, rocket); };

    // Thruster: red-topped housing, blue bell.
    body(.45, .6);
    faces(.75, .6, (g, h) => { studs(g, h); box(.5, .2, .03, NAVY, 0, 0, .38, g); box(.36, .07, .035, RED, 0, .0, .39, g); });
    solid(new THREE.CylinderGeometry(.2, .38, .45, 8, 1, true), BLUE, 0, .225, 0);
    solid(new THREE.CylinderGeometry(.2, .2, .04, 8), RED, 0, .45, 0);
    // Two fuel tanks with orange bars.
    for (const y of [1.05, 1.8]) {
      body(y, .75);
      faces(y + .375, .75, (g, h) => {
        studs(g, h); box(.5, .5, .03, PANEL, 0, 0, .38, g);
        for (const x of [-.13, 0, .13]) box(.06, .38, .04, ORANGE, x, 0, .385, g);
      });
    }
    // Cockpit with a cyan window.
    body(2.55, .75);
    faces(2.925, .75, (g, h) => { studs(g, h); box(.5, .5, .03, '#1f5fa8', 0, 0, .38, g); box(.4, .4, .035, '#58c8ee', 0, 0, .385, g); box(.12, .3, .04, '#c8f1fb', -.1, .02, .39, g); });
    // Red nose with a beacon.
    solid(new THREE.CylinderGeometry(.38, .39, .08, 8), GREY, 0, 3.34, 0);
    solid(new THREE.ConeGeometry(.4, .8, 8), RED, 0, 3.78, 0);
    const beacon = ball(.07, '#ffe27a', 0, 4.25, 0, rocket);
    // Wings: white triangles with red rivets, like the sprites.
    const wing = new THREE.Shape(); wing.moveTo(0, .85); wing.lineTo(0, 0); wing.lineTo(.62, 0); wing.closePath();
    for (const s of [-1, 1]) {
      const m = solid(new THREE.ExtrudeGeometry(wing, { depth: .1, bevelEnabled: false }), RED, s * .375, 1.05, -.05);
      m.scale.x = s;   // mirror
      if (s < 0) m.material.side = THREE.DoubleSide;
      ball(.035, WHITE, s * .4, 1.12, .07, rocket); ball(.035, NAVY, s * .22, 1.12, .07, rocket);
    }
    // Landing legs on the diagonals.
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      line([[sx * .3, .75, sz * .3], [sx * .8, .05, sz * .8]], '#6b6f85', .045, rocket);
      cylinder(.13, .05, '#8a8ea3', sx * .8, .03, sz * .8, rocket, 8);
    }

    // ---- Rover (parked, dish turns) -----------------------------------------
    const rover = group(1.4, 0, -1.55); rover.rotation.y = -.5;
    box(.9, .2, .5, WHITE, 0, .38, 0, rover); box(.5, .12, .36, CYAN, -.05, .54, 0, rover);
    box(.9, .045, .52, RED, 0, .28, 0, rover);
    for (const x of [-.34, .34]) for (const z of [-.33, .33]) { const w = cylinder(.15, .1, '#4a4d63', x, .15, z, rover, 10); w.rotation.x = Math.PI / 2; }
    cylinder(.025, .35, GREY, .25, .72, 0, rover);
    const dish = group(.25, .92, 0, rover); const bowl = cylinder(.15, .04, WHITE, 0, 0, .06, dish, 12); bowl.rotation.x = Math.PI / 2.4;

    // ---- Flag + astronaut --------------------------------------------------
    const pole = group(FLAG[0], 0, FLAG[2]);
    cylinder(.025, 1.8, '#d5d8e2', 0, .78, 0, pole, 8); ball(.05, '#d5d8e2', 0, 1.7, 0, pole);
    const flag = group(0, 1.5, 0, pole);
    box(.62, .38, .03, CYAN, .33, 0, 0, flag); box(.62, .06, .035, '#128aa6', .33, -.16, 0, flag);
    const gripL = group(0, 1.08, 0, pole), gripR = group(0, 1.3, 0, pole);

    const ast = W.person(1.2, .36, WHITE, '#d4d7e3', .92, '#c99a78'); ast.root.rotation.y = Math.PI / 2;
    ball(.215, '#f3f4fa', 0, .05, 0, ast.head);
    box(.2, .13, .06, CYAN, 0, .05, .185, ast.head);   // visor
    box(.34, .42, .16, '#cfd3e0', 0, .3, -.2, ast.chest); box(.34, .06, .165, RED, 0, .46, -.2, ast.chest);
    box(.24, .04, .02, RED, 0, .38, .12, ast.chest);   // chest panel

    // Dust puffs ringed around the pole foot.
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + .3, p = ball(1, i % 2 ? '#c9c9d3' : '#b4b4c0', FLAG[0], .06, FLAG[2]);
      puffs.push({ p, a, r: .14 + W.random() * .1 });
    }
    return { rocket, beacon, rover, dish, pole, flag, gripL, gripR, ast, puffs, v: new THREE.Vector3(), palms: [] };
  },
  tick({ t, parts: p, W }) {
    const a = t / duration * TAU, L = lift(t);
    p.pole.position.y = -.1 + .3 * L;
    p.pole.rotation.z = .025 * Math.sin(a * 2) * L;
    p.flag.rotation.y = .12 * Math.sin(a * 3) + .05; p.flag.rotation.z = .04 * Math.sin(a * 4);
    p.beacon.scale.setScalar(.035 + .045 * Math.max(0, Math.sin(a * 2)) ** 2);
    p.dish.rotation.y = a * 1;                          // one full turn per loop
    // Astronaut: crouches into the drive, leans over the pole.
    W.plant(p.ast, { crouch: .03 + .04 * (1 - L), lean: .09 + .06 * (1 - L), twist: .02 * Math.sin(a) });
    p.ast.head.rotation.set(.25, 0, 0);
    p.pole.updateMatrixWorld(true);
    [p.gripL, p.gripR].forEach((g, i) => { g.getWorldPosition(p.v); p.palms[i] = W.reach(p.ast, i ? 1 : -1, p.v.toArray()); });
    // Dust: burst outward and fade (by shrinking) after each impact.
    const s = since(t), k = s < 1 ? Math.sin(Math.min(1, s / .9) * Math.PI) : 0;
    for (const u of p.puffs) {
      const r = u.r + s * .35 * (s < 1);
      u.p.position.set(FLAG[0] + Math.cos(u.a) * r, .07 + .22 * Math.min(1, s * 2) * (s < 1), FLAG[2] + Math.sin(u.a) * r);
      u.p.scale.setScalar(.001 + .09 * k);
    }
  },
  contacts({ parts: p }) {
    return [p.gripL, p.gripR].map((g, i) => { g.getWorldPosition(p.v); return { label: i ? 'right palm on flagpole' : 'left palm on flagpole', a: p.palms[i], b: p.v.toArray() }; });
  }
});
