import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => !!window.__BUILDER_SCENE__);

  const artifactDir = '/home/shlok377/.gemini/antigravity/brain/88c294bd-cde1-4b98-a017-e10cc6b0d395';

  // Build the standard rocket and launch into FlightScene
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

  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    flight.countdown = 0.05;
  });

  await new Promise(r => setTimeout(r, 600));

  // 1. Launchpad rocket crop (matching media_1792337106322.png)
  const padClip = { x: 565, y: 320, width: 160, height: 180 };
  await page.screenshot({ path: `${artifactDir}/fat_pixel_launchpad_closeup.png`, clip: padClip });
  console.log('Saved fat_pixel_launchpad_closeup.png');

  // 2. Test pitch rotation (15 degrees / 0.26 radians) during flight
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    flight.sim.state.theta = 0.26; // 15 degrees tilt
    flight.sim.state.y = 80;       // in the air
  });
  await new Promise(r => setTimeout(r, 200));

  // Rocket remains at center x: 640, smoothedRocketY is around 400-500
  const rotatedClip = { x: 560, y: 320, width: 160, height: 180 };
  await page.screenshot({ path: `${artifactDir}/fat_pixel_rotated_closeup.png`, clip: rotatedClip });
  console.log('Saved fat_pixel_rotated_closeup.png');

  await browser.close();
  console.log('Verification completed successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
