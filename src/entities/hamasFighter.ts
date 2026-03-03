import Phaser from "phaser";

export default class HamasFighter extends Phaser.Physics.Arcade.Sprite {
  private readonly baseScale = 0.52;
  private animationState: "idle" | "firing" | "dying";

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    animationState: "idle" | "firing" | "dying" = "idle"
  ) {
    super(scene, x, y, "hamas_idle");

    this.animationState = animationState;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(this.baseScale);
    this.setDepth(7);
    this.setFlipX(true); // Face left towards the soldier

    const body = this.body as Phaser.Physics.Arcade.Body;
    const bodyWidth = this.displayWidth * 0.44;
    const bodyHeight = this.displayHeight * 0.72;
    body.setSize(bodyWidth, bodyHeight, false);
    body.setOffset((this.displayWidth - bodyWidth) / 2, this.displayHeight - bodyHeight + 80);

    this.setCollideWorldBounds(true);

    this.createAnimations(scene);
    this.play(`hamas_${this.animationState}`, true);
  }

  private createAnimations(scene: Phaser.Scene) {
    // Remove existing animations if they exist
    const animationKeys = ["hamas_idle", "hamas_firing", "hamas_running", "hamas_dying"];
    for (const key of animationKeys) {
      if (scene.anims.exists(key)) {
        scene.anims.remove(key);
      }
    }

    // Create idle animation (2 frames)
    scene.anims.create({
      key: "hamas_idle",
      frames: scene.anims.generateFrameNumbers("hamas_idle", { start: 0, end: 1 }),
      frameRate: 2,
      repeat: -1,
    });

    // Create firing animation (4 frames)
    scene.anims.create({
      key: "hamas_firing",
      frames: scene.anims.generateFrameNumbers("hamas_firing", { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    // Create running animation (8 frames)
    scene.anims.create({
      key: "hamas_running",
      frames: scene.anims.generateFrameNumbers("hamas_running", { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });

    // Create dying animation (5 frames)
    scene.anims.create({
      key: "hamas_dying",
      frames: scene.anims.generateFrameNumbers("hamas_dying", { start: 0, end: 4 }),
      frameRate: 8,
      repeat: 0,
    });
  }

  public update() {
    const targetKey = `hamas_${this.animationState}`;
    const currentKey = this.anims.currentAnim?.key;

    if (this.animationState === "dying") {
      if (currentKey !== "hamas_dying") {
        this.play("hamas_dying", true);
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
