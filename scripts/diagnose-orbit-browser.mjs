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

  // Transition to FlightScene with a reference rocket (tip, tank, fins, engine)
  const result = await page.evaluate(async () => {
    const builder = window.__BUILDER_SCENE__;
    const tree = builder.rocketTree;
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(6, 9, 'FIN');
    tree.attachPart(8, 9, 'FIN');
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

    // Simulate flight up to Moon SOI
    // Teleport to Moon SOI approach (y = 4200m, insideMoonSoi)
    flightScene.sim.state.x = -200;
    flightScene.sim.state.y = 4200;
    flightScene.sim.state.vx = 25;
    flightScene.sim.state.vy = 20;
    flightScene.sim.state.theta = Math.PI / 3;
    flightScene.throttle = 0; // Coasting
    flightScene.sim.step(1 / 120, { throttle: 0, steer: 0 });

    // Step 30 frames
    for (let f = 0; f < 30; f++) {
      flightScene.update(f * 16.6, 16.6);
    }

    const t = flightScene.sim.getTelemetry();
    const camMode = flightScene.world.camera.mode;
    const timeScale = flightScene.timeScale;
    const activeSpriteCount = flightScene.world.activeSpriteCount;
    const spriteTextures = flightScene.world.partSpritesPool
      .slice(0, activeSpriteCount)
      .map(s => s.texture.key);

    const rocketScreen = flightScene.world.rocketScreen(flightScene.sim);

    return {
      success: true,
      camMode,
      timeScale,
      activeSpriteCount,
      spriteTextures,
      rocketScreen,
      telemetry: {
        altitude: t.altitude,
        speed: t.speed,
        thrust: t.thrust,
        moonOrbit: !!t.moonOrbit
      }
    };
  });

  console.log('Flight Scene State:', JSON.stringify(result, null, 2));

  // Capture full screenshot
  const screenshotPath = '/home/shlok377/.gemini/antigravity/brain/88c294bd-cde1-4b98-a017-e10cc6b0d395/orbit_view_verified.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  // If rocket was on screen, capture zoomed-in crop of rocket
  if (result.success && result.rocketScreen) {
    const rx = Math.max(0, Math.min(1280 - 150, Math.round(result.rocketScreen.x - 75)));
    const ry = Math.max(0, Math.min(720 - 150, Math.round(result.rocketScreen.y - 75)));
    const zoomPath = '/home/shlok377/.gemini/antigravity/brain/88c294bd-cde1-4b98-a017-e10cc6b0d395/orbit_rocket_zoom.png';
    await page.screenshot({
      path: zoomPath,
      clip: { x: rx, y: ry, width: 150, height: 150 }
    });
    console.log('Saved zoomed rocket to:', zoomPath);
  }

  await browser.close();
}

main().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
