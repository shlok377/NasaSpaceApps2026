import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('FAIL') || text.includes('Error')) {
      console.log('BROWSER LOG:', text);
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => !!window.__BUILDER_SCENE__);

  // Transition to FlightScene
  const result = await page.evaluate(async () => {
    const builder = window.__BUILDER_SCENE__;
    const tree = builder.rocketTree;
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    tree.attachPart(6, 9, 'FUEL_TANK');
    tree.attachPart(5, 9, 'FIN');
    tree.attachPart(6, 10, 'ENGINE');
    tree.attachPart(8, 9, 'FUEL_TANK');
    tree.attachPart(9, 9, 'FIN');
    tree.attachPart(8, 10, 'ENGINE');

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
    flightScene.sim.launch();

    // Record rocket screen positions over 120 frames
    const yPositions = [];
    const xPositions = [];
    for (let f = 0; f < 120; f++) {
      flightScene.update(f * 16.6, 16.6);
      const pos = flightScene.world.rocketScreen(flightScene.sim);
      xPositions.push(pos.x);
      yPositions.push(pos.y);
    }

    // calculate max step jitter
    let maxJitterY = 0;
    let maxJitterX = 0;
    for (let i = 2; i < yPositions.length; i++) {
      const dy1 = yPositions[i - 1] - yPositions[i - 2];
      const dy2 = yPositions[i] - yPositions[i - 1];
      const jy = Math.abs(dy2 - dy1);
      if (jy > maxJitterY) maxJitterY = jy;

      const dx1 = xPositions[i - 1] - xPositions[i - 2];
      const dx2 = xPositions[i] - xPositions[i - 1];
      const jx = Math.abs(dx2 - dx1);
      if (jx > maxJitterX) maxJitterX = jx;
    }

    return {
      success: true,
      maxJitterY,
      maxJitterX,
      sampleY: yPositions.slice(50, 60),
      speed: flightScene.sim.getTelemetry().speed
    };
  });

  console.log('FLIGHT_VERIFY_RESULT:', result);
  await browser.close();

  if (!result.success || result.maxJitterY > 2.0 || result.maxJitterX > 2.0) {
    console.error('FAIL: Jitter too high or flight scene failed!', result);
    process.exit(1);
  } else {
    console.log(`PASS: Rocket tracking is silky smooth in browser! Jitter Y = ${result.maxJitterY.toFixed(3)} px, Jitter X = ${result.maxJitterX.toFixed(3)} px`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
