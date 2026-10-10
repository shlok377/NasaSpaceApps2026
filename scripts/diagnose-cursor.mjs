import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

async function main() {
  const server = await createServer({
    server: { port: 3456 }
  });
  await server.listen();

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3456');
  await page.waitForFunction(() => !!window.__BUILDER_SCENE__);

  const result = await page.evaluate(() => {
    const scene = window.__BUILDER_SCENE__;
    const canvas = scene.game.canvas;
    const rect = canvas.getBoundingClientRect();

    const canvasCenterX = rect.left + rect.width / 2;
    const viewportCenterX = window.innerWidth / 2;
    const isCanvasCenteredX = Math.abs(canvasCenterX - viewportCenterX) < 2;

    const gridOriginY = scene.gridOriginY;
    const hudHeight = 96;
    const hudY = 20;
    const gridOverlapsHud = (gridOriginY < hudY + hudHeight);

    return {
      canvasCenterX,
      viewportCenterX,
      isCanvasCenteredX,
      gridOriginY,
      hudBottom: hudY + hudHeight,
      gridOverlapsHud
    };
  });

  await browser.close();
  await server.close();

  console.log('TEST_RESULT:', result);

  if (!result.isCanvasCenteredX || result.gridOverlapsHud) {
    console.error('FAIL: Layout is not centered or grid overlaps HUD!');
    process.exit(1);
  } else {
    console.log('PASS: Canvas is perfectly centered and no UI overlap.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
