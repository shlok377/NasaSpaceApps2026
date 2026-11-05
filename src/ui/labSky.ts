import Phaser from 'phaser';
import { GAME_ASSETS } from '../core/assets';
import { BACKDROP_SCALE, createBackdropTexture } from './backdrop';
import { drawSparkle } from './pixel';

/**
 * The Rocket Lab sky: the dusk backdrop painting, faded stars, the Moon and twinkling sparkles.
 * The main menu and the lab both call this, so the two screens share one identical backdrop and
 * the menu can hand over to the lab without a visible cut.
 *
 * `g` is a graphics layer the caller owns (stars are drawn into it).
 */
export function paintLabSky(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics): void {
  const w = scene.scale.width;
  const rnd = new Phaser.Math.RandomDataGenerator(['rocket-lab']);

  g.clear();
  createBackdropTexture(scene, 'builder_backdrop');
  scene.add.image(0, 0, 'builder_backdrop').setOrigin(0).setScale(BACKDROP_SCALE).setDepth(-1);

  // Stars fade out toward the warm horizon.
  const dotColors = [0xffffff, 0xfff1d0, 0xffd6c2, 0xd8d0ff];
  for (let i = 0; i < 140; i++) {
    const y = Math.round(Math.pow(rnd.frac(), 1.8) * 420 / 2) * 2;
    g.fillStyle(rnd.pick(dotColors), rnd.realInRange(0.3, 1) * (1 - y / 520));
    g.fillRect(Math.round(rnd.between(0, w) / 2) * 2, y, rnd.frac() < 0.85 ? 2 : 3, 2);
  }

  // The destination looms over the launch site.
  scene.add.image(905, 175, GAME_ASSETS.UI_MOON_BIG.key).setScale(1.5);

  // Twinkling plus-shaped sparkles.
  const sparkleColors = [0xfff1d0, 0xffd23f, 0xff8a5c, 0xffffff];
  for (let i = 0; i < 18; i++) {
    const s = scene.add.graphics();
    drawSparkle(s, rnd.pick(sparkleColors), 3, rnd.frac() < 0.4);
    s.setPosition(rnd.between(20, w - 20), rnd.between(20, 380));
    scene.tweens.add({
      targets: s,
      alpha: { from: 1, to: 0.15 },
      duration: rnd.between(700, 1800),
      delay: rnd.between(0, 1500),
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      easeParams: [4]
    });
  }
}
