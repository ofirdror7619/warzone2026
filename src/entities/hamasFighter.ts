import Phaser from "phaser";

type HamasVisualVariant = "hamas1" | "hamas2";

export default class HamasFighter extends Phaser.Physics.Arcade.Sprite {
  private readonly baseScaleHamas1 = 0.52;
  private readonly baseScaleHamas2 = 0.68;
  private animationState: "idle" | "firing" | "dying";
  private visualVariant: HamasVisualVariant;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    animationState: "idle" | "firing" | "dying" = "idle",
    visualVariant: HamasVisualVariant = "hamas1"
  ) {
    super(scene, x, y, visualVariant === "hamas2" ? "hamas2_idle" : "hamas_idle");

    this.animationState = animationState;
    this.visualVariant = visualVariant;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(this.visualVariant === "hamas2" ? this.baseScaleHamas2 : this.baseScaleHamas1);
    this.setDepth(7);
    this.setFlipX(true); // Face left towards the soldier

    const body = this.body as Phaser.Physics.Arcade.Body;
    const bodyWidth = this.displayWidth * 0.44;
    const bodyHeight = this.displayHeight * 0.72;
    body.setSize(bodyWidth, bodyHeight, false);
    body.setOffset((this.displayWidth - bodyWidth) / 2, this.displayHeight - bodyHeight + 80);

    this.setCollideWorldBounds(true);

    this.createAnimations(scene);
    this.play(this.resolveAnimationKey(this.animationState), true);
  }

  private createAnimations(scene: Phaser.Scene) {
    if (!scene.anims.exists("hamas_dying")) {
      scene.anims.create({
        key: "hamas_dying",
        frames: scene.anims.generateFrameNumbers("hamas_dying", { start: 0, end: 4 }),
        frameRate: 8,
        repeat: 0,
      });
    }

    if (this.visualVariant === "hamas2") {
      if (!scene.anims.exists("hamas2_dying")) {
        scene.anims.create({
          key: "hamas2_dying",
          frames: scene.anims.generateFrameNumbers("hamas2_dying", { start: 0, end: 3 }),
          frameRate: 8,
          repeat: 0,
        });
      }

      if (!scene.anims.exists("hamas2_idle")) {
        scene.anims.create({
          key: "hamas2_idle",
          frames: scene.anims.generateFrameNumbers("hamas2_idle", { start: 0, end: 2 }),
          frameRate: 3,
          repeat: -1,
        });
      }

      if (!scene.anims.exists("hamas2_throwing")) {
        scene.anims.create({
          key: "hamas2_throwing",
          frames: scene.anims.generateFrameNumbers("hamas2_throw", { start: 0, end: 3 }),
          frameRate: 10,
          repeat: -1,
        });
      }
      return;
    }

    if (!scene.anims.exists("hamas_idle")) {
      scene.anims.create({
        key: "hamas_idle",
        frames: scene.anims.generateFrameNumbers("hamas_idle", { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("hamas_firing")) {
      scene.anims.create({
        key: "hamas_firing",
        frames: scene.anims.generateFrameNumbers("hamas_firing", { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("hamas_running")) {
      scene.anims.create({
        key: "hamas_running",
        frames: scene.anims.generateFrameNumbers("hamas_running", { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  private resolveAnimationKey(state: "idle" | "firing" | "dying") {
    if (state === "dying") {
      return this.visualVariant === "hamas2" ? "hamas2_dying" : "hamas_dying";
    }

    if (this.visualVariant === "hamas2") {
      return state === "firing" ? "hamas2_throwing" : "hamas2_idle";
    }

    return state === "firing" ? "hamas_firing" : "hamas_idle";
  }

  public update() {
    const targetKey = this.resolveAnimationKey(this.animationState);
    const currentKey = this.anims.currentAnim?.key;

    if (this.animationState === "dying") {
      if (currentKey !== targetKey) {
        this.play(targetKey, true);
      }
      return;
    }

    if (currentKey !== targetKey || !this.anims.isPlaying) {
      this.play(targetKey, true);
    }
  }

  public setAnimationState(state: "idle" | "firing" | "dying") {
    this.animationState = state;
  }
}
