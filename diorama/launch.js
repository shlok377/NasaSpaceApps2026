/* Lunar hop: a white-panelled rocket (same modules as /assets) waits beside a launch
   tower, the swing arm retracts, the engine lights, dust rolls out and the rocket climbs
   out of frame leaving a smoke column. It comes back tail-first on a retro-burn and
   lands on the pad, the arm swings back in: the last frame equals the first. */
(function () {
  var DUR = 10, LIFT = 3.0, GONE = 6.2, D0 = 6.6, D1 = 8.8, H = 11.2, BASE = .04, S = .6;
  var TX = -1.15, TZ = -.55, ARM = -.44;
  var sm = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  /* rocket height as a pure function of absolute time */
  function ry(t) {
    if (t < LIFT) return BASE;
    if (t < GONE) { var s = t - LIFT; return BASE + .8 * s * s; }
    if (t < D0) return BASE + H;
    if (t < D1) { var u = (t - D0) / (D1 - D0); return BASE + H * (1 - u) * (1 - u); }
    return BASE;
  }
  function rx(t) { if (t >= GONE) return 0; var s = Math.max(0, t - LIFT); return .05 * s * s; }
  var CRATERS = [[-1.9, 1.7, .75], [-.3, -2.6, .55], [3.1, -1.1, .5]];

  Pixel.scene({
    name: 'launch',
    title: 'Liftoff from the Moon pad',
    means: 'A white rocket lifts off a lunar pad past its tower, trailing smoke; it returns on a retro-burn and lands again. Loops seamlessly.',
    hint: 'Hover the rocket, tower or astronaut; tap the astronaut to wave.',
    width: 320, height: 240, duration: 10, still: 3.9, fps: 24,
    camera: { az: 45, el: 30, height: 2.9 },
    sun: { az: -50, el: 46, ambient: .34 },
    ground: {
      rx: 4.3, rz: 3.6, wobble: .35, fade: .45,
      zone: function (x, z, P) {
        var d = Math.hypot(x, z);
        if (d < 1.12) return d > .98 ? 'padring' : 'pad';
        for (var i = 0; i < CRATERS.length; i++) {
          var c = CRATERS[i], r = c[2] * (1 + (P.noise(x * 3, z * 3) - .5) * .25), e = Math.hypot(x - c[0], z - c[1]);
          if (e < r - .1) return 'crater';
          if (e < r + .1) return 'rim';
        }
        return 'moon';
      }
    },
    materials: {
      moon: { ramp: ['#55556a', '#74748a', '#92929f', '#b0b0bc', '#cfcfd8'], tex: 'sand', ground: true },
      crater: { ramp: ['#3d3d52', '#55556a', '#6d6d82', '#85859a', '#9b9bad'], tex: 'sand', ground: true },
      rim: { ramp: ['#8d8da0', '#a9a9b8', '#c4c4cf', '#dcdce4', '#eeeef3'], tex: 'sand', ground: true },
      pad: { ramp: ['#33364d', '#454963', '#5a5f7c', '#707593', '#8a8fb0'], tex: 'paving', size: .36, ground: true },
      padring: { ramp: ['#1f6f8f', '#2a96b8', '#22c0e0', '#6ad8ee', '#b4eef8'], tex: 'plain', ground: true, glow: .5 },
      hull: { ramp: ['#5d6280', '#8c91ad', '#b9bdd1', '#dfe1ec', '#f6f6fb'], tex: 'plain', dither: .5 },
      panel: { ramp: ['#8a8570', '#b3ad94', '#d6d0b6', '#efe9d0', '#faf6e6'], tex: 'plain', dither: .4 },
      red: { ramp: ['#6b1f2b', '#9c2c36', '#cf3d3d', '#e8665a', '#f59a86'], tex: 'plain', dither: .5 },
      orange: { ramp: ['#8a4a14', '#c47a1c', '#f0a02e', '#f7c25a', '#fbdc8e'], tex: 'plain', dither: .4 },
      glass: { ramp: ['#1f4f8f', '#2f7fc8', '#58c8ee', '#9be3f7', '#d4f4fb'], tex: 'plain', glow: .55, dither: .4 },
      bell: { ramp: ['#1f2f6b', '#2f4aa8', '#3f6fd0', '#6b94e0', '#9bb8ee'], tex: 'plain', dither: .5 },
      steel: { ramp: ['#3a3d52', '#555a73', '#737893', '#9499b0', '#b9bdd0'], tex: 'plain', dither: .5 },
      flame: { ramp: ['#d4501c', '#f08a24', '#f8b83a', '#fbd96a', '#fff2b0'], flat: true, glow: .95 },
      puff: { ramp: ['#9a9bb0', '#b9bacb', '#d4d5e0', '#e8e9f1', '#f6f6fa'], tex: 'plain', glow: .35, dither: .6 },
      flagc: { ramp: ['#117e98', '#18a2c0', '#22c0e0', '#6ad8ee', '#b4eef8'], tex: 'cloth', dither: .5 }
    },
    build: function (P) {
      var parts = {}, i;
      /* ---- rocket, built in 0.75-unit modules (as the sprites) and scaled down ---- */
      var rk = P.group(0, BASE, 0); rk.scale.set(S, S, S); rk.name = 'rocket · lunar lander'; parts.rk = rk;
      function faces(y, fn) { [0, Math.PI / 2].forEach(function (r) { var f = P.group(0, y, 0, rk); f.rotation.y = r; fn(f); }); }
      function studs(f, h) { [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { P.box(.07, .07, .04, 'red', sx * .3, sy * (h / 2 - .08), .385, f); }); }); }
      P.box(.75, .6, .75, 'hull', 0, .75, 0, rk);                       // thruster housing
      faces(.75, function (f) { studs(f, .6); P.box(.5, .2, .04, 'bell', 0, 0, .385, f); P.box(.36, .07, .045, 'red', 0, 0, .39, f); });
      P.cyl(.2, .38, .45, 'bell', 0, .225, 0, rk, 8);                   // bell
      [1.05, 1.8].forEach(function (y) {                                // two fuel tanks, orange bars
        P.box(.75, .75, .75, 'hull', 0, y + .375, 0, rk);
        faces(y + .375, function (f) { studs(f, .75); P.box(.5, .5, .04, 'panel', 0, 0, .385, f); [-.14, 0, .14].forEach(function (x) { P.box(.08, .38, .045, 'orange', x, 0, .39, f); }); });
      });
      P.box(.75, .75, .75, 'hull', 0, 2.925, 0, rk);                    // cockpit, cyan window
      faces(2.925, function (f) { studs(f, .75); P.box(.5, .5, .04, '#1f5fa8', 0, 0, .385, f); P.box(.4, .4, .05, 'glass', 0, 0, .39, f); });
      P.cyl(.38, .39, .08, 'steel', 0, 3.34, 0, rk, 8);                 // nose
      P.cone(.4, .8, 'red', 0, 3.78, 0, rk, 8);
      [-1, 1].forEach(function (s) {                                    // wings
        var w = P.wedge(.62, .85, .1, 'red', s * .68, 1.05, 0, rk); w.rotation.z = s * Math.PI / 2; w.rotation.y = 0;
        P.box(.07, .07, .05, 'hull', s * .5, 1.2, .08, rk);
      });
      [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (c) {       // landing legs
        P.line([[c[0] * .3, .75, c[1] * .3], [c[0] * .8, .05, c[1] * .8]], '#6b6f85', rk);
        P.cyl(.13, .13, .05, 'steel', c[0] * .8, .03, c[1] * .8, rk, 8);
      });
      parts.flame = P.group(0, 0, 0, rk);
      P.cone(.2, 1.7, 'flame', 0, -.85, 0, parts.flame, 8).rotation.z = Math.PI;
      P.cone(.1, 1.1, '#fff2b0', 0, -.55, 0, parts.flame, 6).rotation.z = Math.PI;

      /* ---- launch tower + swing arm ---- */
      var tw = P.group(TX, 0, TZ); tw.name = 'launch tower · swing arm'; parts.tw = tw;
      [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { P.box(.06, 2.7, .06, 'hull', a * .13, 1.35, b * .13, tw); }); });
      for (i = 0; i < 6; i++) { var y = .3 + i * .45; P.box(.32, .035, .035, 'steel', 0, y, .13, tw); P.box(.32, .035, .035, 'steel', 0, y, -.13, tw); P.box(.035, .035, .32, 'steel', .13, y, 0, tw); P.box(.035, .035, .32, 'steel', -.13, y, 0, tw); }
      P.box(.34, .3, .34, 'red', 0, .15, 0, tw);
      parts.beacon = P.ball(.06, '#ff6a5a', 0, 2.82, 0, tw, 6);
      parts.arm = P.group(TX, 1.55, TZ);
      P.box(1.05, .07, .1, 'hull', .55, 0, 0, parts.arm); P.box(.1, .16, .16, 'red', 1.08, 0, 0, parts.arm);

      /* ---- fuel depot ---- */
      P.ball(.3, 'hull', -2.4, .34, -1.4, null, 10); P.cyl(.2, .26, .1, 'steel', -2.4, .05, -1.4, null, 8);
      P.ball(.24, 'hull', -1.8, .28, -2.0, null, 10); P.cyl(.16, .2, .1, 'steel', -1.8, .05, -2.0, null, 8);
      P.box(1.5, .07, .07, 'steel', -1.78, .1, -.98, null).rotation.y = 2.54;
      parts.steam = [0, 1, 2].map(function (k) { return P.ball(1, 'puff', -2.4, .7, -1.4, null, 6); });

      /* ---- astronaut watching the launch ---- */
      var ast = P.person(1.5, -1.8, null, { shirt: '#eceef5', pants: '#c9ccd8', skin: '#c99a78', hair: '#eceef5', shoes: '#8a8ea3', yaw: -.69 });
      ast.root.name = 'astronaut · tap to wave'; parts.ast = ast;
      P.ball(.17, 'hull', 0, .02, 0, ast.head, 8); P.box(.2, .1, .06, 'glass', 0, .03, .15, ast.head);
      P.box(.22, .28, .1, 'steel', 0, -.2, -.1, ast.body);

      /* ---- rover, flag, rocks ---- */
      var rv = P.group(2.7, 0, 1.0); rv.rotation.y = -.5;
      P.box(.7, .15, .4, 'hull', 0, .27, 0, rv); P.box(.4, .1, .3, 'glass', -.04, .39, 0, rv); P.box(.7, .04, .42, 'red', 0, .2, 0, rv);
      [-.26, .26].forEach(function (x) { [-.25, .25].forEach(function (z) { P.cyl(.11, .11, .08, 'steel', x, .11, z, rv, 8).rotation.x = Math.PI / 2; }); });
      P.cyl(.02, .02, .3, 'steel', .2, .5, 0, rv, 5); parts.dish = P.group(.2, .68, 0, rv); P.cyl(.12, .12, .03, 'hull', 0, 0, .04, parts.dish, 10).rotation.x = Math.PI / 2.4;
      var pole = P.group(.8, 0, 1.7); P.cyl(.02, .02, 1.1, 'hull', 0, .55, 0, pole, 5);
      parts.flag = []; var prev = P.group(0, 1.0, 0, pole);
      for (i = 0; i < 3; i++) { var sg = P.group(i ? .13 : .02, 0, 0, prev); P.box(.13, .28, .02, 'flagc', .065, -.14, 0, sg); parts.flag.push(sg); prev = sg; }
      [[-3.0, 0], [-3.4, 1.4], [2.6, -2.6], [3.4, .1], [.2, 2.4], [-.8, 2.9], [-3.0, -2.2]].forEach(function (p, k) { P.ball(.14 + (k % 3) * .05, k % 2 ? 'rim' : 'moon', p[0], .05, p[1], null, 6).scale.y = .55; });

      /* ---- effects: smoke column, ground dust ---- */
      parts.smoke = []; for (i = 0; i < 34; i++) parts.smoke.push(P.ball(1, 'puff', 0, 0, 0, null, 6));
      parts.dust = []; for (i = 0; i < 24; i++) parts.dust.push(P.ball(1, 'puff', 0, .07, 0, null, 6));
      parts.hot = [tw, rk, ast.root];
      return parts;
    },
    tick: function (c) {
      var t = c.t, p = c.parts, P = c.P, TAU = P.TAU, i;
      /* arm, rocket */
      var th = ARM - 1.2 * (sm((t - 2) / .7) - sm((t - 9.2) / .7));
      p.arm.rotation.y = th;
      var y = ry(t), s = Math.max(0, Math.min(GONE, t) - LIFT);
      var shake = (t > 2.5 && t < LIFT) ? .012 * Math.sin(t * 70) : 0;
      p.rk.position.set(rx(t) + shake, y, 0);
      p.rk.rotation.z = -.14 * sm(s / 3) * (t < GONE ? 1 : 0);
      p.rk.visible = y < 9;
      var up = sm((t - 2.5) / .5) * (t < GONE ? 1 : 0) * (1 + Math.min(1.6, s * .7));
      var dn = sm((t - 6.9) / .3) * (1 - sm((t - 8.7) / .25)) * (1.9 - .9 * sm((t - D0) / (D1 - D0)));   // retro-burn
      var fl = (up + dn) * (1 + .18 * Math.sin(t * 38)) / (1 + .18 * 0);
      p.flame.scale.set(1, .001 + fl, 1);
      p.flame.visible = fl > .02;
      /* smoke column from where the rocket was */
      var L = 2.4;
      p.smoke.forEach(function (b, j) {
        var ts = LIFT + j * .1, age = t - ts;
        if (age < 0 || age > L) { b.visible = false; return; }
        var u = age / L, near = Math.max(0, 1 - ry(ts) / 1.5), side = ((j * 37) % 7 - 3) * .05;
        b.visible = true;
        b.position.set(rx(ts) + age * (.1 + side) + near * age * (j % 2 ? .6 : -.6) * .5, Math.max(.1, ry(ts) - .15 + age * .05), near * (((j * 13) % 5) - 2) * .12);
        var r = (.1 + .3 * Math.pow(u, .6)) * (1 - sm((u - .65) / .35)); b.scale.set(r, r, r);
      });
      p.dust.forEach(function (b, k) {
        var ph = k < 12 ? LIFT : 8.45, age = ((t - ph) % DUR + DUR) % DUR, a = (k % 12) / 12 * TAU + .3 + (k < 12 ? 0 : .26) + ((k * 53) % 7 - 3) * .07, jr = .8 + ((k * 31) % 9) / 22;
        if (age < 0 || age > 2.2) { b.visible = false; return; }
        var rad = ((k < 12 ? .45 : .4) + 1.6 * (1 - Math.pow(1 - age / 2.2, 2))) * jr;
        b.visible = true; b.position.set(Math.cos(a) * rad, .08 + .05 * age, Math.sin(a) * rad);
        var r = (.1 + ((k * 17) % 5) * .025) * (1 - age / 2.2) * (age < .3 ? age / .3 : 1); b.scale.set(r * 1.3, r * .7, r * 1.3);
      });
      /* fuel vents breathe while the rocket waits (period 1.25 s divides the loop) */
      var env = (t < 2.7 ? 1 : t < 3 ? 1 - sm((t - 2.7) / .3) : t < 8.9 ? 0 : sm((t - 8.9) / .4));
      p.steam.forEach(function (b, k) {
        var f = P.phase(t, 1.25, k / 3), r = env * Math.sin(f * Math.PI) * (.07 + .09 * f);
        b.position.set(-2.4 + f * .12, .65 + f * .55, -1.4); b.scale.set(r + .001, r + .001, r + .001);
      });
      /* astronaut watches, waves at liftoff; a tap waves too */
      var since = c.pressed === p.ast.root ? t - c.pressedAt : 9, press = since < 2 ? Math.sin(Math.min(1, since / 2) * Math.PI) : 0;
      var w = Math.max(press, sm((t - 3.6) / .4) * (1 - sm((t - 5.8) / .4)), sm((t - 8.9) / .3) * (1 - sm((t - 9.7) / .3)));
      P.pose(p.ast, 'stand'); P.pose(p.ast, 'wave', w);
      p.ast.armR.rotation.z += .35 * Math.sin(t * 10) * w;
      p.ast.root.position.y = .5 * press * press * (2 - press) * .5;   // low-gravity hop on a tap
      p.ast.head.rotation.x = -.1 - .6 * (sm((t - 3) / 1.5) - sm((t - 8.2) / .8));
      /* life: beacon, rover dish, flag */
      p.beacon.visible = P.phase(t, 1.25) < .5;
      p.dish.rotation.y = c.q * TAU;
      p.flag.forEach(function (sg, k) { sg.rotation.y = .22 * Math.sin(c.q * TAU * 2 - k * .9) * (k ? 1 : .4); });
      c.read = press > 0 ? 'astronaut · waving' : t < 2.5 ? 'rocket · T-minus, all systems go' : t < GONE ? 'rocket · liftoff!' : t < D1 ? 'rocket · retro-burn, coming home' : 'rocket · touchdown';
    }
  });
})();
