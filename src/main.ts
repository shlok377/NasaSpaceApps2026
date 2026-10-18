import Phaser from 'phaser';
import { BuilderScene } from './scenes/BuilderScene';
import { FlightScene } from './scenes/FlightScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#0f172a',
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

async function bootGame(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.load('16px "Mozilla Headline"');
      await document.fonts.ready;
    } catch {
      // Gracefully continue if network is slow or offline
    }
  }
  new Phaser.Game(config);
}

void bootGame();
