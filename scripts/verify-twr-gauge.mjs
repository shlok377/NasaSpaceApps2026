import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => !!window.__BUILDER_SCENE__);

  const artifactDir = '/home/shlok377/.gemini/antigravity/brain/1414c13e-5cac-41b0-a94c-7807f73d8d19';

  // Build rocket and launch into FlightScene
  await page.evaluate(() => {
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
  });

  await page.waitForFunction(() => !!window.__FLIGHT_SIM__);

  const clip = { x: 18, y: 520, width: 320, height: 180 };

  // 1. Pad / Idle State (engines off)
  const padState = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      percent: flight.fuelTank.percentText.text,
      twrText: flight.fuelTank.twrValueText.text,
      needleAngle: flight.fuelTank.needleSprite.angle,
      massText: flight.fuelTank.massText.text,
      massSprites: flight.fuelTank.massSprites.map(sp => sp.texture.key)
    };
  });
  console.log('1. Pad Idle State:', padState);
  await page.screenshot({ path: `${artifactDir}/twr_gauge_pad_idle.png`, clip });

  // 2. Start Countdown and liftoff (engines burning)
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    flight.countdown = 0.05;
  });

  // Wait for liftoff & engines to accelerate
  await new Promise(r => setTimeout(r, 1200));

  const liftoffState = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      percent: flight.fuelTank.percentText.text,
      twrText: flight.fuelTank.twrValueText.text,
      needleAngle: flight.fuelTank.needleSprite.angle,
      massText: flight.fuelTank.massText.text
    };
  });
  console.log('2. Powered Liftoff State:', liftoffState);
  await page.screenshot({ path: `${artifactDir}/twr_gauge_powered_flight.png`, clip });

  // 3. Low-Thrust Alert Test (simulate low TWR < 1.0 with active engines)
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    // Force update with TWR 0.7 and active engines
    flight.fuelTank.update(0.8, 12000, 15000, 0.7, true, performance.now(), 0.1);
  });
  await new Promise(r => setTimeout(r, 200));

  const lowThrustState = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      twrText: flight.fuelTank.twrValueText.text,
      needleAngle: flight.fuelTank.needleSprite.angle
    };
  });
  console.log('3. Low Thrust Alert State:', lowThrustState);
  await page.screenshot({ path: `${artifactDir}/twr_gauge_low_thrust_alert.png`, clip });

  await browser.close();
  console.log('Verification finished successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
