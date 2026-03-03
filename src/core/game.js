import Phaser from 'phaser'
import { BootScene } from '../scenes/BootScene.js'
import { GameScene } from '../scenes/GameScene.js'

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1024,
    height: 576,
    backgroundColor: '#0f172a',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, GameScene],
  })
}
