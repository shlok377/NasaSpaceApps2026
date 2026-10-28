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

  // Build underpowered heavy rocket: 1 engine, 4 fuel tanks
  await page.evaluate(() => {
    const builder = window.__BUILDER_SCENE__;
    const tree = builder.rocketTree;
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(6, 9, 'FUEL_TANK');
    tree.attachPart(8, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'FUEL_TANK');
    tree.attachPart(7, 11, 'ENGINE');
    builder.renderRocket();
    builder.refreshEconomy();
    builder.launchReady = true;
    builder.launchFlight();
  });

  await page.waitForFunction(() => !!window.__FLIGHT_SIM__);

  // Start countdown and ignite
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    flight.countdown = 0.05;
  });

  await new Promise(r => setTimeout(r, 600));

  const clip = { x: 18, y: 520, width: 320, height: 180 };

  const lowThrustState = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      twrText: flight.fuelTank.twrValueText.text,
      needleAngle: flight.fuelTank.needleSprite.angle,
      color: flight.fuelTank.twrValueText.style.color
    };
  });
  console.log('Underpowered Ignition State:', lowThrustState);
  await page.screenshot({ path: `${artifactDir}/twr_gauge_underpowered_low.png`, clip });

  await browser.close();
  console.log('Underpowered test finished successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
