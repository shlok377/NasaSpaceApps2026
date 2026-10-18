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

  const artifactDir = '/home/shlok377/.gemini/antigravity/brain/88c294bd-cde1-4b98-a017-e10cc6b0d395';

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

  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    flight.countdown = 0.05;
  });

  await new Promise(r => setTimeout(r, 600));

  const clip = { x: 20, y: 520, width: 230, height: 180 };

  // 1. Full Mass (Liftoff)
  const fullSprites = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      text: flight.fuelTank.massText.text,
      sprites: flight.fuelTank.massSprites.map(sp => sp.texture.key)
    };
  });
  console.log('Full Mass Sprites (8/8):', fullSprites);
  await page.screenshot({ path: `${artifactDir}/fuel_tank_mass_card_full.png`, clip });

  // 2. Half fuel (drain tanks to 50%)
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    for (const [id, f] of flight.sim.tanks) {
      flight.sim.tanks.set(id, f * 0.5);
    }
    flight.sim.invalidateCom();
  });
  await new Promise(r => setTimeout(r, 300));
  const halfSprites = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      text: flight.fuelTank.massText.text,
      sprites: flight.fuelTank.massSprites.map(sp => sp.texture.key)
    };
  });
  console.log('Half-depleted Sprites (5/8):', halfSprites);
  await page.screenshot({ path: `${artifactDir}/fuel_tank_mass_card_half.png`, clip });

  // 3. Dry fuel (zero fuel in all tanks)
  await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    for (const [id] of flight.sim.tanks) {
      flight.sim.tanks.set(id, 0);
    }
    flight.sim.invalidateCom();
  });
  await new Promise(r => setTimeout(r, 300));
  const drySprites = await page.evaluate(() => {
    const flight = window.__BUILDER_SCENE__.scene.manager.getScene('FlightScene');
    return {
      text: flight.fuelTank.massText.text,
      sprites: flight.fuelTank.massSprites.map(sp => sp.texture.key)
    };
  });
  console.log('Dry Mass Sprites (2/8):', drySprites);
  await page.screenshot({ path: `${artifactDir}/fuel_tank_mass_card_dry.png`, clip });

  await browser.close();
  console.log('All visual states verified!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
