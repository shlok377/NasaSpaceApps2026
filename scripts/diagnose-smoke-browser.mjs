import puppeteer from 'puppeteer-core';
import fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => !!window.__BUILDER_SCENE__);

  // Transition to FlightScene with a basic rocket
  const result = await page.evaluate(async () => {
    const builder = window.__BUILDER_SCENE__;
    const tree = builder.rocketTree;
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');

    builder.renderRocket();
    builder.refreshEconomy();
    builder.launchReady = true;
    builder.launchFlight();

    // wait for FlightScene to initialize
    await new Promise(r => setTimeout(r, 600));

    const flightScene = builder.scene.manager.getScene('FlightScene');
    if (!flightScene || !flightScene.sim) {
      return { success: false, reason: 'FlightScene or sim not ready' };
    }

    // Launch the rocket in flight scene
    flightScene.countdown = null;
    flightScene.sim.launch();
    flightScene.launched = true;
    flightScene.throttle = 1;

    console.log('Sim phase before loop:', flightScene.sim.phase);

    // Step 200 frames climbing to reach safe altitude
    for (let f = 0; f < 200; f++) {
      flightScene.update(f * 16.6, 16.6);
    }

    console.log('Sim state at altitude:', JSON.stringify(flightScene.sim.state), 'phase:', flightScene.sim.phase);

    // Now tilt rocket like in screenshot (pointing diagonally upwards-right: theta = PI/4)
    flightScene.sim.state.theta = Math.PI / 4;

    // Step 20 more frames while tilted
    for (let f = 200; f < 220; f++) {
      flightScene.update(f * 16.6, 16.6);
    }

    console.log('Final sim state after 220 frames:', JSON.stringify(flightScene.sim.state), 'phase:', flightScene.sim.phase);

    // Measure engine nozzle and newest smoke position
    const sim = flightScene.sim;
    const world = flightScene.world;
    const s = sim.state;
    const com = sim.com;
    const rot = world.screenRotation(s.theta);
    const cellPx = world.camera.rocketScale;
    const visual = cellPx / world.camera.scale;

    const enginePart = sim.vehicle.parts.find(p => p.thrust > 0);
    const du = (enginePart.u - com.u) * visual;
    const da = (enginePart.a - com.a) * visual;
    const engineCenter = world.toScreen(
      s.x + da * Math.cos(s.theta) + du * Math.sin(s.theta),
      s.y + da * Math.sin(s.theta) - du * Math.cos(s.theta)
    );

    const base = cellPx / 2;
    const nozzleScreen = {
      x: engineCenter.x - base * Math.sin(rot),
      y: engineCenter.y + base * Math.cos(rot)
    };

    const smokeCount = world.smokeCount;
    const smokePool = world.smokePool;
    const youngPuffs = [];
    for (let i = 0; i < smokeCount; i++) {
      const p = smokePool[i];
      if (p.age < 0.2) {
        const sp = world.toScreen(p.x, p.y);
        youngPuffs.push({
          age: p.age,
          screen: sp,
          distToNozzle: Math.hypot(sp.x - nozzleScreen.x, sp.y - nozzleScreen.y)
        });
      }
    }
    youngPuffs.sort((a, b) => a.distToNozzle - b.distToNozzle);

    return {
      success: true,
      nozzleScreen,
      youngPuffs: youngPuffs.slice(0, 5),
      smokeCount,
      speed: sim.getTelemetry().speed
    };
  });

  console.log('BROWSER SMOKE TEST RESULT:', JSON.stringify(result, null, 2));

  // Take screenshot of the flight scene
  const screenshotPath = '/home/shlok377/.gemini/antigravity/brain/88c294bd-cde1-4b98-a017-e10cc6b0d395/smoke_alignment_verified.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  await browser.close();

  const minDistance = result.youngPuffs.length > 0 ? result.youngPuffs[0].distToNozzle : 999;
  if (!result.success || minDistance > 5) {
    console.error('FAIL: Smoke is not pivoted within 5px of engine nozzle! minDistance =', minDistance);
    process.exit(1);
  } else {
    console.log(`PASS: Smoke is perfectly pivoted to thrusters! Min distance = ${minDistance.toFixed(2)}px`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
