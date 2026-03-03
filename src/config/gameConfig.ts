import Phaser from "phaser";
import GameScene from "../scenes/gameScene";

export type GameplayCollisionConfig = {
  playerBodyWidthScale?: number;
  playerSidePushFactor?: number;
  platformSideBlockExtraWidth?: number;
  platformEarlyBlockDistance?: number;
  platformSideBlockWidth?: number;
  platformSideBlockHeight?: number;
};

export type GameplayCombatConfig = {
  hamasBulletYOffset?: number;
  hamasBulletHitOffsetX?: number;
  hamasBulletHitOffsetY?: number;
  hamasBulletHitWidth?: number;
  hamasBulletHitHeight?: number;
  playerBulletMaxRangePx?: number;
  playerBulletYOffsetGround?: number;
  playerBulletYOffsetPlatform?: number;
  playerBulletDuckExtraDrop?: number;
  playerBulletHitOffsetXForward?: number;
  playerBulletHitOffsetXBackward?: number;
  playerBulletHitOffsetY?: number;
  playerBulletHitWidth?: number;
  playerBulletHitHeight?: number;
};

export type ExtendedGameConfig = Phaser.Types.Core.GameConfig & {
  gameplay?: {
    lives?: number;
    collision?: GameplayCollisionConfig;
    combat?: GameplayCombatConfig;
  };
};

export const gameConfig: ExtendedGameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 900,
  height: 600,
  backgroundColor: "#0a1324",
  gameplay: {
    lives: 3,
    collision: {
      playerBodyWidthScale: 0.74,
      playerSidePushFactor: 0.35,
      platformSideBlockExtraWidth: 0,
      platformEarlyBlockDistance: 30,
      platformSideBlockWidth: 18,
      platformSideBlockHeight: 170,
    },
    combat: {
      hamasBulletYOffset: -6,
      hamasBulletHitOffsetX: -12,
      hamasBulletHitOffsetY: -1.5,
      hamasBulletHitWidth: 12,
      hamasBulletHitHeight: 3,
      playerBulletMaxRangePx: 520,
      playerBulletYOffsetGround: -38,
      playerBulletYOffsetPlatform: -16,
      playerBulletDuckExtraDrop: 24,
      playerBulletHitOffsetXForward: -2,
      playerBulletHitOffsetXBackward: -18,
      playerBulletHitOffsetY: -4,
      playerBulletHitWidth: 18,
      playerBulletHitHeight: 8,
    },
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 1000 },
      debug: false,
    },
  },
  scene: [GameScene],
};