import Phaser from 'phaser';
import { BuilderScene } from './scenes/BuilderScene';
import { FlightScene } from './scenes/FlightScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#04050d',
  pixelArt: false,
  antialias: true,
  antialiasGL: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BuilderScene, FlightScene]
};

// Phaser text is drawn to canvas, so the fonts must be ready before the first scene renders.
const fontsReady = Promise.all([
  document.fonts.load('16px "Mozilla Headline"'),
  document.fonts.load('16px "Press Start 2P"'),
  document.fonts.load('22px "VT323"')
]).catch(() => undefined);
const timeout = new Promise(resolve => setTimeout(resolve, 2500));

Promise.race([fontsReady, timeout]).then(() => new Phaser.Game(config));
