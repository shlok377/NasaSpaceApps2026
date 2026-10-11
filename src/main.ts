import Phaser from 'phaser';
import { BuilderScene } from './scenes/BuilderScene';
import { FlightScene } from './scenes/FlightScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BuilderScene, FlightScene]
};

new Phaser.Game(config);
