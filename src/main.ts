import Phaser from 'phaser';
import { BuilderScene } from './scenes/BuilderScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1080,
  height: 1020,
  parent: 'game-container',
  backgroundColor: '#11141a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BuilderScene]
};

new Phaser.Game(config);
