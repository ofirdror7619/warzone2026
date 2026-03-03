import Phaser from "phaser";
import type { ExtendedGameConfig, GameplayCollisionConfig } from "../config/gameConfig";

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private readonly baseScale = 0.5;
  private readonly enableAirControl = true;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey: Phaser.Input.Keyboard.Key;
  private speed = 200;
  private runSpeed = 350;
  private sidePushFactor = 0.35;
  private bodyWidthScale = 0.74;
  private isDead = false;
  private isDuckingState = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "soldier");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(this.baseScale);
    this.setDepth(7);

    const collisionConfig = this.getCollisionConfig(scene);
    this.sidePushFactor = collisionConfig.playerSidePushFactor ?? 0.35;
    this.bodyWidthScale = collisionConfig.playerBodyWidthScale ?? 0.74;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const bodyWidth = this.displayWidth * this.bodyWidthScale;
    const bodyHeight = this.displayHeight * 0.72;
    body.setSize(bodyWidth, bodyHeight, false);
    body.setOffset((this.displayWidth - bodyWidth) / 2, this.displayHeight - bodyHeight + 88);

    this.setCollideWorldBounds(true);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is not available in this scene.");
    }

    this.cursors = keyboard.createCursorKeys();
    this.fireKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.createAnimations(scene);
  }

  private getCollisionConfig(scene: Phaser.Scene): GameplayCollisionConfig {
    return (((scene.game.config as unknown) as ExtendedGameConfig).gameplay?.collision ?? {}) as GameplayCollisionConfig;
  }

  private createAnimations(scene: Phaser.Scene) {
    const animationKeys = ["idle", "walk", "run", "duckShoot", "jump", "die", "fire"];
    for (const key of animationKeys) {
      if (scene.anims.exists(key)) {
        scene.anims.remove(key);
      }
    }

    const texture = scene.textures.get("soldier");
    const frameNames = texture
      .getFrameNames()
      .filter((name) => name !== "__BASE")
      .map((name) => Number(name))
      .filter((name) => Number.isFinite(name));

    const maxFrame = frameNames.length > 0 ? Math.max(...frameNames) : 0;
    const hasWalkRow = maxFrame >= 15;
    const hasFireRow = maxFrame >= 19;
    const hasJumpRow = maxFrame >= 28;

    const clampedRange = (start: number, end: number) => {
      const safeStart = Math.min(start, maxFrame);
      const safeEnd = Math.min(end, maxFrame);
      return { start: safeStart, end: Math.max(safeStart, safeEnd) };
    };

    const idleRange = clampedRange(0, Math.min(3, maxFrame));
    const walkRange = hasWalkRow ? clampedRange(8, 15) : idleRange;
    const runRange = walkRange;
    const fireRange = hasFireRow ? clampedRange(16, 19) : idleRange;
    const jumpRange = hasJumpRow ? clampedRange(24, 28) : walkRange;
    const hasDedicatedDyingSheet = scene.textures.exists("soldier_dying");
    const hasDedicatedDuckSheet = scene.textures.exists("soldier_duck");

    // row 0
    scene.anims.create({
      key: "idle",
      frames: scene.anims.generateFrameNumbers("soldier", idleRange),
      frameRate: 1.5,
      repeat: -1,
    });

    const walkFrames = hasWalkRow
      ? scene.anims
          .generateFrameNumbers("soldier", walkRange)
          .map((f) => f.frame as number)
          .filter((_, i) => ![1, 2, 6, 7].includes(i))
      : scene.anims.generateFrameNumbers("soldier", walkRange).map((f) => f.frame as number);

    // row 1
    scene.anims.create({
      key: "walk",
      frames: walkFrames.map((frame) => ({ key: "soldier", frame })),
      frameRate: 5,
      repeat: -1,
    });

    // row 2
    scene.anims.create({
      key: "run",
      frames: scene.anims.generateFrameNumbers("soldier", runRange),
      frameRate: 14,
      repeat: -1,
    });

    // row 3
    scene.anims.create({
      key: "duckShoot",
      frames: hasDedicatedDuckSheet
        ? scene.anims.generateFrameNumbers("soldier_duck", { start: 0, end: 0 })
        : scene.anims.generateFrameNumbers("soldier", walkRange),
      frameRate: hasDedicatedDuckSheet ? 1 : 12,
      repeat: -1,
    });

    scene.anims.create({
      key: "jump",
      frames: scene.anims.generateFrameNumbers("soldier", jumpRange),
      frameRate: 6,
      repeat: -1,
    });

    // row 4
    scene.anims.create({
      key: "die",
      frames: hasDedicatedDyingSheet
        ? scene.anims.generateFrameNumbers("soldier_dying", { start: 0, end: 6 })
        : scene.anims.generateFrameNumbers("soldier", idleRange),
      frameRate: 6,
      repeat: 0,
    });

    scene.anims.create({
      key: "fire",
      frames: scene.anims.generateFrameNumbers("soldier", fireRange),
      frameRate: 9,
      repeat: -1,
    });
  }

  public update() {
    if (this.isDead) {
      this.isDuckingState = false;
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    const airSpeed = this.speed;
    this.isDuckingState = false;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && body.blocked.down) {
      body.setVelocityY(-360);
    }

    const pressingIntoLeftWall = this.cursors.left?.isDown && body.blocked.left;
    const pressingIntoRightWall = this.cursors.right?.isDown && body.blocked.right;

    if (!body.blocked.down) {
      if (this.enableAirControl && this.cursors.left?.isDown) {
        this.setFlipX(true);
        body.setVelocityX(pressingIntoLeftWall ? -airSpeed * this.sidePushFactor : -airSpeed);
      } else if (this.enableAirControl && this.cursors.right?.isDown) {
        this.setFlipX(false);
        body.setVelocityX(pressingIntoRightWall ? airSpeed * this.sidePushFactor : airSpeed);
      } else {
        body.setVelocityX(0);
      }

      this.play("jump", true);
      return;
    }

    body.setVelocityX(0);

    // LEFT
    if (this.cursors.left?.isDown) {
      this.setFlipX(true);

      if (this.cursors.shift?.isDown) {
        body.setVelocityX(pressingIntoLeftWall ? -this.runSpeed * this.sidePushFactor : -this.runSpeed);
        this.play("run", true);
      } else {
        body.setVelocityX(pressingIntoLeftWall ? -this.speed * this.sidePushFactor : -this.speed);
        this.play("walk", true);
      }
    }

    // RIGHT
    else if (this.cursors.right?.isDown) {
      this.setFlipX(false);

      if (this.cursors.shift?.isDown) {
        body.setVelocityX(pressingIntoRightWall ? this.runSpeed * this.sidePushFactor : this.runSpeed);
        this.play("run", true);
      } else {
        body.setVelocityX(pressingIntoRightWall ? this.speed * this.sidePushFactor : this.speed);
        this.play("walk", true);
      }
    }

    // DUCK
    else if (this.cursors.down?.isDown) {
      this.isDuckingState = true;
      this.play("duckShoot", true);
    }

    // FIRE
    else if (this.fireKey.isDown) {
      this.play("fire", true);
    }

    // IDLE
    else {
      this.play("idle", true);
    }
  }

  public die() {
    this.isDead = true;
    this.isDuckingState = false;
    this.setVelocity(0, 0);
    this.play("die");
  }

  public respawnAt(x: number, y: number) {
    this.isDead = false;
    this.isDuckingState = false;
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.play("idle", true);
  }

  public isDucking() {
    return this.isDuckingState;
  }

  public consumeFirePressed() {
    if (this.isDead) return false;
    return Phaser.Input.Keyboard.JustDown(this.fireKey);
  }

  public isFireHeld() {
    if (this.isDead) return false;
    return this.fireKey.isDown;
  }

  public isDeadState() {
    return this.isDead;
  }

  public getHitBounds() {
    const bounds = this.getBounds();

    if (!this.isDuckingState) {
      return bounds;
    }

    const reducedHeight = bounds.height * 0.58;
    const topShift = bounds.height - reducedHeight;

    return new Phaser.Geom.Rectangle(
      bounds.x,
      bounds.y + topShift,
      bounds.width,
      reducedHeight
    );
  }

  public getCombatHitBounds() {
    const bounds = this.getBounds();
    const centerX = bounds.centerX;
    const hitWidth = bounds.width * 0.42;

    if (!this.isDuckingState) {
      const standingHeight = bounds.height * 0.72;
      const standingY = bounds.y + bounds.height * 0.12;
      return new Phaser.Geom.Rectangle(centerX - hitWidth / 2, standingY, hitWidth, standingHeight);
    }

    const duckWidth = bounds.width * 0.5;
    const duckHeight = bounds.height * 0.5;
    const duckY = bounds.y + bounds.height * 0.42;
    return new Phaser.Geom.Rectangle(centerX - duckWidth / 2, duckY, duckWidth, duckHeight);
  }
}