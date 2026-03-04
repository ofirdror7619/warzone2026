import Phaser from "phaser";
import Player from "../entities/player";
import HamasFighter from "../entities/hamasFighter";
import type { ExtendedGameConfig, GameplayCollisionConfig, GameplayCombatConfig } from "../config/gameConfig";
import soldierSprite2 from "../assets/hamas-1-sprites/soldier_idle_walk_fire_jump_combined.png";
import soldierDyingSprite from "../assets/hamas-1-sprites/soldier_dying_transparent.png";
import soldierDuckSprite from "../assets/hamas-1-sprites/soldier_duck_transparent.png";
import hamasIdleSprite from "../assets/hamas-1-sprites/hamas_idle_transparent.png";
import hamasFiringSprite from "../assets/hamas-1-sprites/hamas_firing_transparent.png";
import hamasRunningSprite from "../assets/hamas-1-sprites/hamas_running_transparent.png";
import hamasDyingSprite from "../assets/hamas-1-sprites/hamas_dying_transparent.png";
import hamas2IdleSprite from "../assets/hamas-2-sprites/hamas2_idle_transparent.png";
import hamas2ThrowSprite from "../assets/hamas-2-sprites/hamas2_throw_transparent.png";
import hamas2DyingSprite from "../assets/hamas-2-sprites/hamas2_dying_transparent.png";

type ActiveBomb = {
  x: number;
  y: number;
  fuseStartAt: number;
  explodeAt: number;
  bombBody: Phaser.GameObjects.Rectangle;
  bombCap: Phaser.GameObjects.Rectangle;
  bombDecor: Phaser.GameObjects.GameObject[];
  fuse: Phaser.GameObjects.Line;
  spark: Phaser.GameObjects.Arc;
};

type PickupType = "medkit" | "armor" | "ammo";

type ActivePickup = {
  type: PickupType;
  x: number;
  y: number;
  radius: number;
  objects: Phaser.GameObjects.GameObject[];
};

type ActiveEnemyGrenade = {
  body: Phaser.GameObjects.Arc;
  velocityX: number;
  velocityY: number;
  explodeAt: number;
  nextTrailAt: number;
  warningAt: number;
  warningShown: boolean;
  warningRing: Phaser.GameObjects.Arc | null;
};

export default class GameScene extends Phaser.Scene {
  private readonly countdownMusicMultiplier = 0.65;
  private readonly musicFadeStepMs = 40;
  private readonly maxLevels = 4;
  private currentLevel = 1;
  private pendingLives: number | null = null;
  private enemyVariant: "standard" | "assault" | "grenadier" = "standard";
  private player!: Player;
  private hamasFighter!: HamasFighter;
  private ground!: Phaser.GameObjects.Rectangle;
  private platforms: Phaser.GameObjects.Rectangle[] = [];
  private platformSideBlockers: Phaser.GameObjects.Rectangle[] = [];
  private hamasIsDead = false;
  private readonly standardFiringRange = 520; // pixels
  private readonly assaultFiringRange = 620; // pixels
  private readonly postKillFiringMs = 700;
  private readonly firstShotDelayMs = 450;
  private readonly standardShotIntervalMs = 1300;
  private readonly assaultShotIntervalMs = 780;
  private readonly grenadeThrowIntervalMs = 1750;
  private readonly bulletSpeed = 110;
  private readonly maxActiveBullets = 2;
  private readonly minBulletGapPx = 140;
  private readonly bulletSpawnXOffset = -66;
  private bulletYOffset = -6;
  private readonly muzzleFlashMs = 90;
  private readonly playerShotIntervalMs = 220;
  private readonly ammoBurstShotIntervalMs = 120;
  private readonly ammoBurstDurationMs = 8000;
  private readonly playerBulletSpeed = 330;
  private playerBulletMaxRangePx = 520;
  private playerBulletYOffsetGround = -38;
  private playerBulletYOffsetPlatform = -16;
  private playerBulletDuckExtraDrop = 24;
  private hamasBulletHitOffsetX = -12;
  private hamasBulletHitOffsetY = -1.5;
  private hamasBulletHitWidth = 12;
  private hamasBulletHitHeight = 3;
  private playerBulletHitOffsetXForward = -2;
  private playerBulletHitOffsetXBackward = -18;
  private playerBulletHitOffsetY = -4;
  private playerBulletHitWidth = 18;
  private playerBulletHitHeight = 8;
  private readonly worldWidth = 12000;
  private platformSideBlockExtraWidth = 0;
  private platformEarlyBlockDistance = 30;
  private platformSideBlockWidth = 18;
  private platformSideBlockHeight = 170;
  private readonly targetKills = 35;
  private readonly respawnDelayMs = 900;
  private readonly enemyFootOffsetPx = 60;
  private readonly bombSpawnMinDelayMs = 4500;
  private readonly bombSpawnMaxDelayMs = 9500;
  private readonly bombFuseDurationMs = 2300;
  private readonly bombExplosionRadius = 170;
  private readonly bombSpawnAheadMin = 150;
  private readonly bombSpawnAheadMax = 520;
  private readonly grenadeExplosionRadius = 120;
  private readonly grenadeGravity = 620;
  private readonly grenadeFlightMs = 820;
  private readonly grenadeFixedVelocityX = -250;
  private readonly grenadeFixedVelocityY = -220;
  private readonly grenadeSmokeIntervalMs = 36;
  private readonly grenadeWarningLeadMs = 300;
  private readonly pickupSpawnMinDelayMs = 6500;
  private readonly pickupSpawnMaxDelayMs = 12500;
  private readonly pickupSpawnAheadMin = 120;
  private readonly pickupSpawnAheadMax = 520;
  private boomNoiseBuffer: AudioBuffer | null = null;
  private shotNoiseBuffer: AudioBuffer | null = null;
  private masterSoundVolume = 0.78;
  private musicVolume = 0.45;
  private playerIsDead = false;
  private playerDeathTime = 0;
  private lastShotTime = 0;
  private lastPlayerShotTime = 0;
  private inFiringRange = false;
  private firingRangeEnteredAt = 0;
  private kills = 0;
  private maxLives = 3;
  private lives = 3;
  private nextRespawnAt = 0;
  private missionState: "running" | "won" | "lost" = "running";
  private hudLivesEl: HTMLElement | null = null;
  private hudKillsEl: HTMLElement | null = null;
  private hudStatusEl: HTMLElement | null = null;
  private missionOverlayText: Phaser.GameObjects.Text | null = null;
  private powerupOverlayText: Phaser.GameObjects.Text | null = null;
  private powerupOverlayExpiresAt = 0;
  private countdownOverlayText: Phaser.GameObjects.Text | null = null;
  private introCountdownActive = true;
  private hamasBullets: Phaser.GameObjects.Image[] = [];
  private enemyGrenades: ActiveEnemyGrenade[] = [];
  private playerBullets: Phaser.GameObjects.Image[] = [];
  private activeBomb: ActiveBomb | null = null;
  private nextBombSpawnAt = 0;
  private activePickup: ActivePickup | null = null;
  private nextPickupSpawnAt = 0;
  private armorShieldCharges = 0;
  private ammoBurstActiveUntil = 0;
  private levelMusic: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.spritesheet("soldier", soldierSprite2, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("soldier_dying", soldierDyingSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("soldier_duck", soldierDuckSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas_idle", hamasIdleSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas_firing", hamasFiringSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas_running", hamasRunningSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas_dying", hamasDyingSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas2_idle", hamas2IdleSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas2_throw", hamas2ThrowSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.spritesheet("hamas2_dying", hamas2DyingSprite, {
      frameWidth: 256,
      frameHeight: 256,
      margin: 0,
      spacing: 0,
    });

    this.load.audio("level_music_1", new URL("../assets/music/music-for-level-1.mp3", import.meta.url).toString());
  }

  init(data?: { level?: number; lives?: number }) {
    const rawLevel = data?.level;
    if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
      this.currentLevel = Phaser.Math.Clamp(Math.floor(rawLevel), 1, this.maxLevels);
    } else {
      this.currentLevel = 1;
    }

    const rawLives = data?.lives;
    this.pendingLives =
      typeof rawLives === "number" && Number.isFinite(rawLives)
        ? Math.max(0, Math.floor(rawLives))
        : null;
  }

  create() {
    this.hamasIsDead = false;
    this.enemyVariant = "standard";
    this.playerIsDead = false;
    this.playerDeathTime = 0;
    this.lastShotTime = 0;
    this.lastPlayerShotTime = 0;
    this.inFiringRange = false;
    this.firingRangeEnteredAt = 0;
    this.kills = 0;
    this.maxLives = this.getConfiguredLives();
    this.lives = this.pendingLives === null
      ? this.maxLives
      : Phaser.Math.Clamp(this.pendingLives, 0, this.maxLives);
    this.pendingLives = null;
    this.nextRespawnAt = 0;
    this.missionState = "running";
    this.introCountdownActive = true;
    this.hamasBullets = [];
    this.enemyGrenades = [];
    this.playerBullets = [];
    this.platforms = [];
    this.platformSideBlockers = [];
    this.activeBomb = null;
    this.nextBombSpawnAt = 0;
    this.activePickup = null;
    this.nextPickupSpawnAt = 0;
    this.armorShieldCharges = 0;
    this.ammoBurstActiveUntil = 0;
    this.loadCollisionConfig();
    this.loadCombatConfig();

    this.input.keyboard?.on("keydown-R", () => {
      this.scene.restart({ level: this.currentLevel });
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.scale.height);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.scale.height);

    this.drawNightBackdrop();

    this.player = new Player(this, 160, 480);

    // simple ground
    this.ground = this.add.rectangle(this.worldWidth * 0.5, 580, this.worldWidth, 40, 0x444444);
    this.ground.setVisible(false);
    this.physics.add.existing(this.ground, true);

    this.physics.add.collider(this.player, this.ground);

    this.createPlatforms();
    for (const platform of this.platforms) {
      this.physics.add.collider(this.player, platform);
    }
    for (const blocker of this.platformSideBlockers) {
      this.physics.add.collider(this.player, blocker);
    }

    this.spawnHamas();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(260, 180);
    this.cameras.main.setFollowOffset(-130, 0);

    this.hudLivesEl = document.getElementById("hud-lives");
    this.hudKillsEl = document.getElementById("hud-kills");
    this.hudStatusEl = document.getElementById("hud-status");
    if (this.hudStatusEl) {
      this.hudStatusEl.textContent = "";
    }
    this.bindVolumeControls();
    this.playLevelMusic();

    this.refreshHud();
    this.createMissionOverlay();
    this.startIntroCountdown();
    this.scheduleNextBombSpawn();
    this.scheduleNextPickupSpawn();

    const bulletGraphic = this.make.graphics({ x: 0, y: 0 });
    // Left-facing bullet: copper tip (left), steel body, warm tracer tail (right)
    bulletGraphic.fillStyle(0xffe08a, 0.55);
    bulletGraphic.fillRoundedRect(23, 4, 9, 4, 2);

    bulletGraphic.fillStyle(0x2f3237, 1);
    bulletGraphic.fillRoundedRect(8, 3, 15, 6, 2);
    bulletGraphic.fillStyle(0x6f7782, 1);
    bulletGraphic.fillRect(10, 4, 8, 1);
    bulletGraphic.fillStyle(0x111317, 1);
    bulletGraphic.fillRect(9, 8, 12, 1);

    bulletGraphic.fillStyle(0xbe7a2d, 1);
    bulletGraphic.fillTriangle(8, 3, 1, 6, 8, 9);
    bulletGraphic.fillStyle(0xf3c98a, 1);
    bulletGraphic.fillTriangle(6, 4, 2, 6, 6, 8);

    bulletGraphic.generateTexture("hamas_bullet_realistic", 32, 12);
    bulletGraphic.destroy();

    const playerBulletGraphic = this.make.graphics({ x: 0, y: 0 });
    // Right-facing soldier bullet, visually distinct from Hamas bullet
    playerBulletGraphic.fillStyle(0x7fe2ff, 0.55);
    playerBulletGraphic.fillRoundedRect(0, 4, 10, 4, 2);

    playerBulletGraphic.fillStyle(0x2f4f6a, 1);
    playerBulletGraphic.fillRoundedRect(9, 3, 14, 6, 2);
    playerBulletGraphic.fillStyle(0xaad8ff, 1);
    playerBulletGraphic.fillRect(11, 4, 7, 1);
    playerBulletGraphic.fillStyle(0x13212e, 1);
    playerBulletGraphic.fillRect(10, 8, 11, 1);

    playerBulletGraphic.fillStyle(0xd6b96e, 1);
    playerBulletGraphic.fillTriangle(23, 3, 31, 6, 23, 9);
    playerBulletGraphic.fillStyle(0xffe8aa, 1);
    playerBulletGraphic.fillTriangle(25, 4, 30, 6, 25, 8);

    playerBulletGraphic.generateTexture("player_bullet_realistic", 32, 12);
    playerBulletGraphic.destroy();

  }

  update(_time: number, delta: number) {
    this.player.update();
    this.hamasFighter.update();

    if (this.introCountdownActive) {
      this.hamasFighter.setAnimationState("idle");
      this.updatePowerupOverlay();
      return;
    }

    this.updateBombSystem();
    this.updateEnemyGrenades(delta);
    this.updatePickupSystem();
    this.updatePowerupOverlay();

    const playerBounds = this.player.getCombatHitBounds();
    const playerBoundInset = this.player.isDucking() ? 1 : 2;
    const playerBoundDoubleInset = playerBoundInset * 2;
    const precisePlayerBounds = new Phaser.Geom.Rectangle(
      playerBounds.x + playerBoundInset,
      playerBounds.y + playerBoundInset,
      Math.max(1, playerBounds.width - playerBoundDoubleInset),
      Math.max(1, playerBounds.height - playerBoundDoubleInset)
    );
    for (let i = this.hamasBullets.length - 1; i >= 0; i--) {
      const bullet = this.hamasBullets[i];
      bullet.x -= (this.bulletSpeed * delta) / 1000;

      if (bullet.x < this.physics.world.bounds.left - 40 || bullet.x > this.physics.world.bounds.right + 40) {
        bullet.destroy();
        this.hamasBullets.splice(i, 1);
        continue;
      }

      const bulletRightEdge = bullet.x + bullet.displayWidth * 0.5;
      if (bulletRightEdge < precisePlayerBounds.x - 72) {
        bullet.destroy();
        this.hamasBullets.splice(i, 1);
        continue;
      }

      if (!this.playerIsDead) {
        // Use only the compact projectile core/tip for true contact-based kills.
        // (Ignoring decorative tracer pixels avoids "close but not touching" deaths.)
        const bulletHitRect = new Phaser.Geom.Rectangle(
          bullet.x + this.hamasBulletHitOffsetX,
          bullet.y + this.hamasBulletHitOffsetY,
          this.hamasBulletHitWidth,
          this.hamasBulletHitHeight
        );

        const bulletTouchesPlayer = Phaser.Geom.Intersects.RectangleToRectangle(
          precisePlayerBounds,
          bulletHitRect
        );

        if (bulletTouchesPlayer) {
          this.handlePlayerHit();
          bullet.destroy();
          this.hamasBullets.splice(i, 1);
        }
      }
    }

    const hamasBoundsRaw = this.hamasFighter.getBounds();
    const preciseHamasBounds = new Phaser.Geom.Rectangle(
      hamasBoundsRaw.x + hamasBoundsRaw.width * 0.2,
      hamasBoundsRaw.y + hamasBoundsRaw.height * 0.08,
      hamasBoundsRaw.width * 0.58,
      hamasBoundsRaw.height * 0.78
    );

    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const bullet = this.playerBullets[i];
      const dir = (bullet.getData("dir") as number) ?? 1;
      bullet.x += (this.playerBulletSpeed * delta * dir) / 1000;
      const startX = (bullet.getData("startX") as number) ?? bullet.x;

      if (Math.abs(bullet.x - startX) > this.playerBulletMaxRangePx) {
        bullet.destroy();
        this.playerBullets.splice(i, 1);
        continue;
      }

      if (bullet.x > this.physics.world.bounds.right + 40 || bullet.x < this.physics.world.bounds.left - 40) {
        bullet.destroy();
        this.playerBullets.splice(i, 1);
        continue;
      }

      if (!this.hamasIsDead && this.missionState === "running") {
        const bulletHitRect = new Phaser.Geom.Rectangle(
          dir > 0 ? bullet.x + this.playerBulletHitOffsetXForward : bullet.x + this.playerBulletHitOffsetXBackward,
          bullet.y + this.playerBulletHitOffsetY,
          this.playerBulletHitWidth,
          this.playerBulletHitHeight
        );

        if (Phaser.Geom.Intersects.RectangleToRectangle(preciseHamasBounds, bulletHitRect)) {
          this.hamasIsDead = true;
          this.playHamasDeathSound(this.hamasFighter.x, this.hamasFighter.y);
          this.hamasFighter.setAnimationState("dying");
          this.kills += 1;
          this.refreshHud();
          if (this.kills >= this.targetKills && this.missionState === "running") {
            this.winMission();
          } else {
            this.nextRespawnAt = this.time.now + this.respawnDelayMs;
          }
          bullet.destroy();
          this.playerBullets.splice(i, 1);
          this.inFiringRange = false;
        }
      }
    }

    if (!this.playerIsDead && !this.player.isDeadState() && this.missionState === "running") {
      const playerCanShoot = this.time.now - this.lastPlayerShotTime >= this.getCurrentPlayerShotIntervalMs();
      if (playerCanShoot && this.player.isFireHeld()) {
        this.lastPlayerShotTime = this.time.now;

        const dir = this.player.flipX ? -1 : 1;
        const spawnX = this.player.x + dir * 66;
        const groundTopY = this.ground.y - this.ground.displayHeight * 0.5;
        const playerFeetY = this.player.y + this.player.displayHeight * 0.5;
        const isOnElevatedPlatform = playerFeetY < groundTopY - 8;
        const baseBulletYOffset = isOnElevatedPlatform
          ? this.playerBulletYOffsetPlatform
          : this.playerBulletYOffsetGround;
        const bulletYOffset = this.player.isDucking()
          ? baseBulletYOffset + this.playerBulletDuckExtraDrop
          : baseBulletYOffset;
        const spawnY = this.player.y + bulletYOffset;
        const bullet = this.add.image(spawnX, spawnY, "player_bullet_realistic");
        bullet.setDepth(21);
        bullet.setData("dir", dir);
        bullet.setData("startX", spawnX);
        if (dir < 0) {
          bullet.setFlipX(true);
        }
        this.playerBullets.push(bullet);
        this.playM16FireSound();
      }
    }

    if (this.playerIsDead) {
      const elapsedSinceDeath = this.time.now - this.playerDeathTime;

      if (this.lives <= 0) {
        if (this.missionState === "running") {
          this.failMission("Mission Failed");
        }
        if (!this.hamasIsDead) {
          this.hamasFighter.setAnimationState(elapsedSinceDeath <= this.postKillFiringMs ? "firing" : "idle");
        }
        return;
      }

      if (elapsedSinceDeath > this.postKillFiringMs) {
        this.respawnPlayerLeftSide();
      } else {
        if (!this.hamasIsDead) {
          this.hamasFighter.setAnimationState("firing");
        }
      }
      return;
    }

    if (this.hamasIsDead) {
      if (
        this.missionState === "running" &&
        this.kills < this.targetKills &&
        this.nextRespawnAt > 0 &&
        this.time.now >= this.nextRespawnAt
      ) {
        this.spawnHamas();
        this.hamasIsDead = false;
        this.nextRespawnAt = 0;
      }
      return;
    }

    if (this.missionState !== "running") {
      this.hamasFighter.setAnimationState("idle");
      return;
    }

    // Check distance between player and Hamas fighter
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.hamasFighter.x,
      this.hamasFighter.y
    );

    // Switch to firing when player gets close
    if (distance <= this.getCurrentFiringRange()) {
      if (!this.inFiringRange) {
        this.inFiringRange = true;
        this.firingRangeEnteredAt = this.time.now;
        this.lastShotTime = this.time.now - this.getCurrentShotIntervalMs();
      }

      this.hamasFighter.setAnimationState("firing");

      if (this.enemyVariant === "grenadier") {
        const readyToStartThrowing = this.time.now - this.firingRangeEnteredAt >= this.firstShotDelayMs;
        const canThrow = this.enemyGrenades.length < 1;
        if (
          readyToStartThrowing &&
          canThrow &&
          this.time.now - this.lastShotTime >= this.getCurrentShotIntervalMs()
        ) {
          this.lastShotTime = this.time.now;
          this.throwEnemyGrenade();
        }
      } else {
        const activeBulletCount = this.hamasBullets.length;
        const readyToStartShooting = this.time.now - this.firingRangeEnteredAt >= this.firstShotDelayMs;
        const muzzleX = this.hamasFighter.x + this.bulletSpawnXOffset;
        const nearestBulletX =
          this.hamasBullets.length > 0 ? Math.max(...this.hamasBullets.map((bullet) => bullet.x)) : Number.NEGATIVE_INFINITY;
        const hasEnoughGap =
          this.hamasBullets.length === 0 || muzzleX - nearestBulletX >= this.minBulletGapPx;

        if (
          readyToStartShooting &&
          hasEnoughGap &&
          activeBulletCount < this.maxActiveBullets &&
          this.time.now - this.lastShotTime >= this.getCurrentShotIntervalMs()
        ) {
          this.lastShotTime = this.time.now;

          const muzzleY = this.hamasFighter.y + this.bulletYOffset;

          const muzzleFlash = this.add.triangle(
            muzzleX - 7,
            muzzleY,
            0,
            0,
            16,
            4,
            16,
            -4,
            0xffd166
          );
          muzzleFlash.setDepth(25);
          this.tweens.add({
            targets: muzzleFlash,
            alpha: 0,
            duration: this.muzzleFlashMs,
            onComplete: () => muzzleFlash.destroy(),
          });

          const bullet = this.add.image(
            muzzleX,
            muzzleY,
            "hamas_bullet_realistic"
          );
          bullet.setDepth(20);
          this.hamasBullets.push(bullet);
          this.playAk47FireSound(this.hamasFighter.x, this.hamasFighter.y);
        }
      }
    } else {
      this.inFiringRange = false;
      this.hamasFighter.setAnimationState("idle");
    }
  }

  private spawnHamas() {
    if (this.hamasFighter && this.hamasFighter.active) {
      this.hamasFighter.destroy();
    }

    const aheadBase = Math.max(this.player.x + 380, this.cameras.main.worldView.right + 120);
    const spawnX = this.pickClearGroundSpawnX(aheadBase);
    this.enemyVariant = Phaser.Math.Between(0, 1) === 0 ? "standard" : "grenadier";

    const surfaceTopY = this.ground.y - this.ground.displayHeight * 0.5;
    const spawnY = surfaceTopY - this.enemyFootOffsetPx;
    const visualVariant = this.enemyVariant === "grenadier" ? "hamas2" : "hamas1";
    this.hamasFighter = new HamasFighter(this, spawnX, spawnY, "idle", visualVariant);
    this.hamasFighter.setTint(0xfff3bf);
    if (this.ground && this.ground.active) {
      this.physics.add.collider(this.hamasFighter, this.ground);
    }
    for (const platform of this.platforms) {
      if (platform.active) {
        this.physics.add.collider(this.hamasFighter, platform);
      }
    }
    this.snapHamasFeetToSurface(surfaceTopY);
  }

  private pickClearGroundSpawnX(aheadBase: number) {
    const minX = 620;
    const maxX = this.worldWidth - 120;

    for (let attempt = 0; attempt < 14; attempt++) {
      const candidate = Phaser.Math.Clamp(
        aheadBase + Phaser.Math.Between(40, 260),
        minX,
        maxX
      );

      if (!this.isUnderPlatformSpan(candidate)) {
        return candidate;
      }
    }

    return Phaser.Math.Clamp(aheadBase + 300, minX, maxX);
  }

  private isUnderPlatformSpan(x: number) {
    const margin = 36;
    for (const platform of this.platforms) {
      if (!platform.active) continue;
      const halfWidth = platform.displayWidth * 0.5;
      if (x >= platform.x - halfWidth - margin && x <= platform.x + halfWidth + margin) {
        return true;
      }
    }
    return false;
  }

  private getCurrentFiringRange() {
    if (this.enemyVariant === "assault") {
      return this.assaultFiringRange;
    }
    if (this.enemyVariant === "grenadier") {
      return 470;
    }
    return this.standardFiringRange;
  }

  private getCurrentShotIntervalMs() {
    if (this.enemyVariant === "assault") {
      return this.assaultShotIntervalMs;
    }
    if (this.enemyVariant === "grenadier") {
      return this.grenadeThrowIntervalMs;
    }
    return this.standardShotIntervalMs;
  }

  private throwEnemyGrenade() {
    const startX = this.hamasFighter.x + this.bulletSpawnXOffset + 8;
    const startY = this.hamasFighter.y + this.bulletYOffset - 8;

    const grenade = this.add.circle(startX, startY, 6, 0x8f1f1f, 1);
    grenade.setDepth(24);
    grenade.setStrokeStyle(2, 0xff8a8a, 0.95);

    const velocityX = this.grenadeFixedVelocityX;
    const velocityY = this.grenadeFixedVelocityY;

    this.enemyGrenades.push({
      body: grenade,
      velocityX,
      velocityY,
      explodeAt: this.time.now + this.grenadeFlightMs,
      nextTrailAt: this.time.now,
      warningAt: this.time.now + Math.max(0, this.grenadeFlightMs - this.grenadeWarningLeadMs),
      warningShown: false,
      warningRing: null,
    });
  }

  private showGrenadeWarningRing(x: number, y: number) {
    const ring = this.add.circle(x, y, this.grenadeExplosionRadius, 0xff4d4d, 0.08);
    ring.setDepth(19);
    ring.setStrokeStyle(3, 0xff6b6b, 0.9);

    this.tweens.add({
      targets: ring,
      alpha: 0.22,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: "Sine.InOut",
    });

    return ring;
  }

  private emitGrenadeSmokePuff(x: number, y: number) {
    const puff = this.add.circle(
      x + Phaser.Math.Between(-2, 2),
      y + Phaser.Math.Between(-2, 2),
      Phaser.Math.Between(4, 7),
      0xc7cfd8,
      0.52
    );
    puff.setDepth(23);

    this.tweens.add({
      targets: puff,
      x: puff.x + Phaser.Math.Between(-12, -4),
      y: puff.y - Phaser.Math.Between(8, 16),
      radius: puff.radius + Phaser.Math.Between(10, 15),
      alpha: 0,
      duration: 480,
      ease: "Sine.Out",
      onComplete: () => puff.destroy(),
    });
  }

  private updateEnemyGrenades(delta: number) {
    if (this.enemyGrenades.length === 0) {
      return;
    }

    const deltaSec = delta / 1000;
    const groundTopY = this.ground.y - this.ground.displayHeight * 0.5;

    for (let i = this.enemyGrenades.length - 1; i >= 0; i--) {
      const grenade = this.enemyGrenades[i];

      grenade.velocityY += this.grenadeGravity * deltaSec;
      grenade.body.x += grenade.velocityX * deltaSec;
      grenade.body.y += grenade.velocityY * deltaSec;

      if (this.time.now >= grenade.nextTrailAt) {
        this.emitGrenadeSmokePuff(grenade.body.x, grenade.body.y);
        grenade.nextTrailAt = this.time.now + this.grenadeSmokeIntervalMs;
      }

      if (!grenade.warningShown && this.time.now >= grenade.warningAt) {
        const timeLeftSec = Math.max(0, (grenade.explodeAt - this.time.now) / 1000);
        const predictedX = grenade.body.x + grenade.velocityX * timeLeftSec;
        grenade.warningRing = this.showGrenadeWarningRing(predictedX, groundTopY - 2);
        grenade.warningShown = true;
      }

      const shouldExplode =
        this.time.now >= grenade.explodeAt ||
        grenade.body.y >= groundTopY - 4;

      if (!shouldExplode) {
        continue;
      }

      const gx = grenade.body.x;
      const gy = grenade.body.y;
      grenade.warningRing?.destroy();
      grenade.body.destroy();
      this.enemyGrenades.splice(i, 1);
      this.detonateEnemyGrenade(gx, gy);
    }
  }

  private detonateEnemyGrenade(x: number, y: number) {
    this.playClaymoreBoomSound(x, y);

    const flash = this.add.circle(x, y, 18, 0xffe59a, 0.85);
    flash.setDepth(30);
    const shockwave = this.add.circle(x, y, 20, 0xffb86a, 0.5);
    shockwave.setDepth(29);
    shockwave.setStrokeStyle(3, 0xffd18a, 0.68);

    this.tweens.add({
      targets: flash,
      radius: this.grenadeExplosionRadius * 0.45,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: shockwave,
      radius: this.grenadeExplosionRadius,
      alpha: 0,
      duration: 300,
      onComplete: () => shockwave.destroy(),
    });

    if (!this.playerIsDead) {
      const playerBounds = this.player.getCombatHitBounds();
      const distance = Phaser.Math.Distance.Between(x, y, playerBounds.centerX, playerBounds.centerY);
      if (distance <= this.grenadeExplosionRadius) {
        this.handlePlayerHit();
      }
    }
  }

  private createPlatforms() {
    const specs = [
      { x: 760, y: 548, width: 210 },
      { x: 1250, y: 536, width: 240 },
      { x: 1810, y: 556, width: 180 },
      { x: 2380, y: 530, width: 250 },
      { x: 3020, y: 544, width: 220 },
      { x: 3560, y: 532, width: 260 },
    ];

    for (const spec of specs) {
      const platform = this.add.rectangle(spec.x, spec.y, spec.width, 20, 0x6a6862, 0.98);
      platform.setDepth(6);
      this.physics.add.existing(platform, true);

      const body = platform.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(spec.width + this.platformSideBlockExtraWidth, 20);
      body.updateFromGameObject();

      const edge = this.add.rectangle(spec.x, spec.y - 10, spec.width, 2, 0xcac6ba, 0.9);
      edge.setDepth(6);

      const shade = this.add.rectangle(spec.x, spec.y + 4, spec.width, 8, 0x4b4a45, 0.68);
      shade.setDepth(6);

      const halfWidth = spec.width * 0.5;
      const blockerCenterY = spec.y - 10 + this.platformSideBlockHeight * 0.5;

      const leftBlocker = this.add.rectangle(
        spec.x - halfWidth - this.platformEarlyBlockDistance,
        blockerCenterY,
        this.platformSideBlockWidth,
        this.platformSideBlockHeight,
        0xff0000,
        0
      );
      leftBlocker.setVisible(false);
      this.physics.add.existing(leftBlocker, true);

      const rightBlocker = this.add.rectangle(
        spec.x + halfWidth + this.platformEarlyBlockDistance,
        blockerCenterY,
        this.platformSideBlockWidth,
        this.platformSideBlockHeight,
        0xff0000,
        0
      );
      rightBlocker.setVisible(false);
      this.physics.add.existing(rightBlocker, true);

      this.platforms.push(platform);
      this.platformSideBlockers.push(leftBlocker, rightBlocker);
    }
  }

  private loadCollisionConfig() {
    const cfg = ((this.game.config as unknown) as ExtendedGameConfig).gameplay?.collision as GameplayCollisionConfig | undefined;

    this.platformSideBlockExtraWidth = cfg?.platformSideBlockExtraWidth ?? 0;
    this.platformEarlyBlockDistance = cfg?.platformEarlyBlockDistance ?? 30;
    this.platformSideBlockWidth = cfg?.platformSideBlockWidth ?? 18;
    this.platformSideBlockHeight = cfg?.platformSideBlockHeight ?? 170;
  }

  private loadCombatConfig() {
    const cfg = ((this.game.config as unknown) as ExtendedGameConfig).gameplay?.combat as GameplayCombatConfig | undefined;

    this.bulletYOffset = cfg?.hamasBulletYOffset ?? -6;
    this.hamasBulletHitOffsetX = cfg?.hamasBulletHitOffsetX ?? -12;
    this.hamasBulletHitOffsetY = cfg?.hamasBulletHitOffsetY ?? -1.5;
    this.hamasBulletHitWidth = cfg?.hamasBulletHitWidth ?? 12;
    this.hamasBulletHitHeight = cfg?.hamasBulletHitHeight ?? 3;

    this.playerBulletMaxRangePx = cfg?.playerBulletMaxRangePx ?? 520;
    this.playerBulletYOffsetGround = cfg?.playerBulletYOffsetGround ?? -38;
    this.playerBulletYOffsetPlatform = cfg?.playerBulletYOffsetPlatform ?? -16;
    this.playerBulletDuckExtraDrop = cfg?.playerBulletDuckExtraDrop ?? 24;
    this.playerBulletHitOffsetXForward = cfg?.playerBulletHitOffsetXForward ?? -2;
    this.playerBulletHitOffsetXBackward = cfg?.playerBulletHitOffsetXBackward ?? -18;
    this.playerBulletHitOffsetY = cfg?.playerBulletHitOffsetY ?? -4;
    this.playerBulletHitWidth = cfg?.playerBulletHitWidth ?? 18;
    this.playerBulletHitHeight = cfg?.playerBulletHitHeight ?? 8;
  }

  private snapHamasFeetToSurface(surfaceTopY: number) {
    const body = this.hamasFighter.body as Phaser.Physics.Arcade.Body;
    const footTargetY = surfaceTopY + 1;
    const spriteHalfHeight = this.hamasFighter.displayHeight * 0.5;
    const desiredSpriteY = footTargetY - body.offset.y - body.height + spriteHalfHeight;
    this.hamasFighter.y = desiredSpriteY;
    body.reset(this.hamasFighter.x, this.hamasFighter.y);
  }

  private drawNightBackdrop() {
    const width = this.worldWidth;
    const height = this.scale.height;

    const sky = this.add.graphics();
    sky.setDepth(-1000);
    sky.fillGradientStyle(0x081225, 0x081225, 0x111d33, 0x111d33, 1);
    sky.fillRect(0, 0, width, height);

    const stars = this.add.graphics();
    stars.setDepth(-980);
    let twinklingStars = 0;
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.Between(8, width - 8);
      const y = Phaser.Math.Between(8, Math.floor(height * 0.52));
      const radius = Phaser.Math.Between(1, 2);
      const alpha = Phaser.Math.FloatBetween(0.35, 0.9);
      stars.fillStyle(0xe7eeff, alpha);
      stars.fillCircle(x, y, radius);

      if (twinklingStars < 10 && Math.random() < 0.22) {
        const twinkle = this.add.circle(x, y, radius + Phaser.Math.FloatBetween(0.35, 0.85), 0xf6fbff, alpha * 0.7);
        twinkle.setDepth(-970);
        this.tweens.add({
          targets: twinkle,
          alpha: { from: alpha * 0.72, to: Math.max(0.18, alpha * 0.42) },
          scale: { from: 1, to: Phaser.Math.FloatBetween(1.08, 1.26) },
          duration: Phaser.Math.Between(2200, 4200),
          yoyo: true,
          repeat: -1,
          repeatDelay: Phaser.Math.Between(900, 2800),
          delay: Phaser.Math.Between(400, 2200),
          ease: "Sine.easeInOut",
        });
        twinklingStars += 1;
      }
    }

    const moonGlow = this.add.circle(760, 96, 42, 0xb8d5ff, 0.2);
    moonGlow.setDepth(-960);

    const moon = this.add.circle(760, 96, 26, 0xe9f2ff, 0.92);
    moon.setDepth(-950);

    const skylineFar = this.add.graphics();
    skylineFar.setDepth(-930);
    skylineFar.fillStyle(0x101a2a, 1);
    let twinkleBudget = 18;
    let xFar = 0;
    while (xFar < width) {
      const blockWidth = Phaser.Math.Between(36, 80);
      const blockHeight = Phaser.Math.Between(135, 255);
      const topY = height - 40 - blockHeight;
      skylineFar.fillRect(xFar, topY, blockWidth, blockHeight);

      const cols = Math.max(1, Math.floor((blockWidth - 8) / 10));
      const rows = Math.max(1, Math.floor((blockHeight - 10) / 12));
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          if (Math.random() < 0.33) {
            const wx = xFar + 4 + col * 10;
            const wy = topY + 5 + row * 12;
            skylineFar.fillStyle(0xffd869, 0.55);
            skylineFar.fillRect(wx, wy, 3, 3);
            if (twinkleBudget > 0 && Math.random() < 0.12) {
              this.createWindowFlicker(wx + 1.5, wy + 1.5, 3, -906, 0.55);
              twinkleBudget -= 1;
            }
          }
        }
      }
      xFar += blockWidth + Phaser.Math.Between(2, 10);
    }

    const skylineNear = this.add.graphics();
    skylineNear.setDepth(-920);
    skylineNear.fillStyle(0x162338, 1);
    let xNear = -10;
    while (xNear < width + 20) {
      const blockWidth = Phaser.Math.Between(44, 96);
      const blockHeight = Phaser.Math.Between(105, 195);
      const topY = height - 30 - blockHeight;
      skylineNear.fillRect(xNear, topY, blockWidth, blockHeight);

      const cols = Math.max(1, Math.floor((blockWidth - 10) / 11));
      const rows = Math.max(1, Math.floor((blockHeight - 8) / 13));
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          if (Math.random() < 0.4) {
            const wx = xNear + 5 + col * 11;
            const wy = topY + 4 + row * 13;
            skylineNear.fillStyle(0xffe27d, 0.72);
            skylineNear.fillRect(wx, wy, 4, 4);
            if (twinkleBudget > 0 && Math.random() < 0.18) {
              this.createWindowFlicker(wx + 2, wy + 2, 4, -905, 0.72);
              twinkleBudget -= 1;
            }
          }
        }
      }
      xNear += blockWidth + Phaser.Math.Between(0, 8);
    }

    const horizonGlow = this.add.graphics();
    horizonGlow.setDepth(-910);
    horizonGlow.fillGradientStyle(0x1f3350, 0x1f3350, 0x0f1a2d, 0x0f1a2d, 0.55);
    horizonGlow.fillRect(0, height - 150, width, 150);

    const roadTop = height - 88;
    const roadHeight = 88;

    const roadBase = this.add.graphics();
    roadBase.setDepth(-900);
    roadBase.fillStyle(0x141a24, 0.95);
    roadBase.fillRect(0, roadTop, width, roadHeight);

    const roadBricks = this.add.graphics();
    roadBricks.setDepth(-899);
    const rowCount = 5;

    for (let row = 0; row < rowCount; row++) {
      const rowH = Phaser.Math.Between(14, 19);
      const yBase = roadTop + row * 17 + Phaser.Math.Between(-1, 2);
      let x = Phaser.Math.Between(-22, 10);

      while (x < width + 30) {
        const brickW = Phaser.Math.Between(22, 44);
        const brickH = rowH + Phaser.Math.Between(-2, 2);
        const gap = Phaser.Math.Between(1, 4);
        const topY = yBase + Phaser.Math.Between(-1, 2);
        const brokenChance = row < 2 ? 0.34 : 0.23;

        if (Math.random() > brokenChance) {
          const variant = Phaser.Math.Between(0, 4);
          const brickColor =
            variant === 0
              ? 0x1f2835
              : variant === 1
              ? 0x273140
              : variant === 2
              ? 0x2d3747
              : variant === 3
              ? 0x334052
              : 0x3a4758;

          const inset = Phaser.Math.Between(0, 2);
          roadBricks.fillStyle(brickColor, Phaser.Math.FloatBetween(0.78, 0.94));
          roadBricks.fillRect(x + inset, topY + inset, brickW - (2 + inset), brickH - (2 + inset));

          if (Math.random() < 0.22) {
            roadBricks.fillStyle(0x121821, 0.42);
            roadBricks.fillRect(x + 2, topY + 2, brickW - 6, 1);
          }
        } else {
          roadBricks.fillStyle(0x0f151f, Phaser.Math.FloatBetween(0.35, 0.6));
          roadBricks.fillRect(x, topY + Phaser.Math.Between(0, 2), brickW - 1, Phaser.Math.Between(2, 5));
        }

        x += brickW + gap;
      }
    }

    const cracks = this.add.graphics();
    cracks.setDepth(-898);
    cracks.lineStyle(1, 0x0d1118, 0.55);
    for (let i = 0; i < 26; i++) {
      const startX = Phaser.Math.Between(0, width);
      const startY = Phaser.Math.Between(roadTop + 4, height - 8);
      const len = Phaser.Math.Between(10, 34);
      cracks.beginPath();
      cracks.moveTo(startX, startY);
      cracks.lineTo(startX + len * 0.45, startY + Phaser.Math.Between(-4, 4));
      cracks.lineTo(startX + len, startY + Phaser.Math.Between(-3, 6));
      cracks.strokePath();
    }

    const grime = this.add.graphics();
    grime.setDepth(-897);
    for (let i = 0; i < 20; i++) {
      const gx = Phaser.Math.Between(0, width);
      const gy = Phaser.Math.Between(roadTop + 4, height - 6);
      const gw = Phaser.Math.Between(18, 70);
      const gh = Phaser.Math.Between(6, 16);
      grime.fillStyle(0x0b0f16, Phaser.Math.FloatBetween(0.15, 0.28));
      grime.fillEllipse(gx, gy, gw, gh);
    }

    const potholes = this.add.graphics();
    potholes.setDepth(-895);
    const biasedRoadX = () => {
      const center = width * 0.5;
      const uniform = Phaser.Math.Between(24, width - 24);
      return Math.round(Phaser.Math.Linear(uniform, center, 0.7));
    };
    for (let i = 0; i < 8; i++) {
      const px = biasedRoadX();
      const py = Phaser.Math.Between(roadTop + 18, height - 12);
      const pw = Phaser.Math.Between(28, 70);
      const ph = Phaser.Math.Between(10, 24);

      potholes.fillStyle(0x070b12, Phaser.Math.FloatBetween(0.5, 0.72));
      potholes.fillEllipse(px, py, pw, ph);
      potholes.fillStyle(0x121a24, Phaser.Math.FloatBetween(0.16, 0.28));
      potholes.fillEllipse(px - Phaser.Math.Between(1, 3), py - Phaser.Math.Between(1, 3), pw * 0.75, ph * 0.6);
    }

    const rubble = this.add.graphics();
    rubble.setDepth(-894);
    for (let i = 0; i < 42; i++) {
      const rx = biasedRoadX();
      const ry = Phaser.Math.Between(roadTop + 6, height - 4);
      const stoneSize = Phaser.Math.Between(2, 5);
      const tone = Phaser.Math.Between(0, 2);
      const color = tone === 0 ? 0x202938 : tone === 1 ? 0x2a3343 : 0x364154;
      rubble.fillStyle(color, Phaser.Math.FloatBetween(0.7, 0.94));
      rubble.fillRect(rx, ry, stoneSize, stoneSize);
      if (Math.random() < 0.35) {
        rubble.fillStyle(0x131923, 0.7);
        rubble.fillRect(rx + 1, ry + stoneSize, Math.max(1, stoneSize - 1), 1);
      }
    }

    const concreteBlocks = this.add.graphics();
    concreteBlocks.setDepth(-893);
    for (let i = 0; i < 12; i++) {
      const bx = biasedRoadX();
      const by = Phaser.Math.Between(roadTop + 8, height - 12);
      const bw = Phaser.Math.Between(8, 16);
      const bh = Phaser.Math.Between(5, 10);
      concreteBlocks.fillStyle(0x394355, Phaser.Math.FloatBetween(0.68, 0.9));
      concreteBlocks.fillRect(bx, by, bw, bh);
      concreteBlocks.fillStyle(0x1d2431, 0.72);
      concreteBlocks.fillRect(bx + 1, by + bh - 1, bw - 2, 1);
      if (Math.random() < 0.5) {
        concreteBlocks.fillStyle(0x566176, 0.38);
        concreteBlocks.fillRect(bx + 1, by + 1, Math.max(2, bw - 4), 1);
      }
    }

    const dirtSpecks = this.add.graphics();
    dirtSpecks.setDepth(-892);
    for (let i = 0; i < 160; i++) {
      const dx = biasedRoadX();
      const dy = Phaser.Math.Between(roadTop, height);
      const ds = Phaser.Math.Between(1, 2);
      dirtSpecks.fillStyle(0x0a0e14, Phaser.Math.FloatBetween(0.16, 0.36));
      dirtSpecks.fillRect(dx, dy, ds, ds);
    }

    const roadShade = this.add.graphics();
    roadShade.setDepth(-891);
    roadShade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.2);
    roadShade.fillRect(0, roadTop, width, roadHeight);
  }

  private createWindowFlicker(
    centerX: number,
    centerY: number,
    size: number,
    depth: number,
    baseAlpha: number
  ) {
    const windowRect = this.add.rectangle(centerX, centerY, size, size, 0xffde7a, baseAlpha);
    windowRect.setDepth(depth);

    this.tweens.add({
      targets: windowRect,
      alpha: { from: baseAlpha * 0.78, to: Math.max(0.12, baseAlpha * 0.52) },
      scale: { from: 1, to: Phaser.Math.FloatBetween(1.03, 1.12) },
      duration: Phaser.Math.Between(1800, 3600),
      yoyo: true,
      repeat: -1,
      repeatDelay: Phaser.Math.Between(900, 2400),
      delay: Phaser.Math.Between(500, 2200),
      ease: "Sine.easeInOut",
    });
  }

  private updateBombSystem() {
    if (this.missionState !== "running") {
      return;
    }

    if (!this.activeBomb) {
      if (this.time.now >= this.nextBombSpawnAt) {
        this.spawnBomb();
      }
      return;
    }

    const bomb = this.activeBomb;
    const fuseProgress = Phaser.Math.Clamp(
      (this.time.now - bomb.fuseStartAt) / this.bombFuseDurationMs,
      0,
      1
    );

    const fuseStartX = bomb.x + 4;
    const fuseStartY = bomb.y - 14;
    const fuseEndX = bomb.x + 16;
    const fuseEndY = bomb.y - 26;

    bomb.spark.x = Phaser.Math.Linear(fuseStartX, fuseEndX, fuseProgress);
    bomb.spark.y = Phaser.Math.Linear(fuseStartY, fuseEndY, fuseProgress);
    bomb.spark.setRadius(2.1 + Math.sin(this.time.now * 0.028) * 0.65);
    bomb.spark.setAlpha(0.72 + Math.sin(this.time.now * 0.06) * 0.18);

    if (this.time.now >= bomb.explodeAt) {
      this.detonateBomb(bomb);
    }
  }

  private spawnBomb() {
    const bombPos = this.pickBombSpawnPosition();
    if (!bombPos) {
      this.scheduleNextBombSpawn();
      return;
    }

    const fuseStartAt = this.time.now;
    const explodeAt = fuseStartAt + this.bombFuseDurationMs;

    const bombBody = this.add.rectangle(bombPos.x, bombPos.y, 34, 16, 0x2b313e, 1);
    bombBody.setDepth(22);

    const bombCap = this.add.rectangle(bombPos.x + 10, bombPos.y - 9, 10, 6, 0x4f596d, 0.95);
    bombCap.setDepth(23);

    const centerStripe = this.add.rectangle(bombPos.x, bombPos.y, 4, 16, 0xd0c28e, 0.9);
    centerStripe.setDepth(23);

    const leftCharge = this.add.rectangle(bombPos.x - 9, bombPos.y + 1, 7, 10, 0x202733, 1);
    leftCharge.setDepth(23);
    const rightCharge = this.add.rectangle(bombPos.x + 9, bombPos.y + 1, 7, 10, 0x202733, 1);
    rightCharge.setDepth(23);

    const wireRed = this.add.line(bombPos.x + 7, bombPos.y - 6, -2, 2, 8, -2, 0xdb4f45, 0.95);
    wireRed.setLineWidth(1.5, 1.5);
    wireRed.setDepth(24);

    const wireBlack = this.add.line(bombPos.x + 8, bombPos.y - 4, -2, 2, 8, -3, 0x11151d, 0.95);
    wireBlack.setLineWidth(1.5, 1.5);
    wireBlack.setDepth(24);

    const fuse = this.add.line(bombPos.x + 16, bombPos.y - 18, -6, 6, 7, -8, 0xe8d28f, 0.95);
    fuse.setLineWidth(2, 2);
    fuse.setDepth(24);

    const spark = this.add.circle(bombPos.x + 10, bombPos.y - 13, 2.2, 0xffb347, 0.9);
    spark.setDepth(25);

    const bombDecor: Phaser.GameObjects.GameObject[] = [
      centerStripe,
      leftCharge,
      rightCharge,
      wireRed,
      wireBlack,
    ];

    this.tweens.add({
      targets: [bombBody, bombCap, ...bombDecor],
      y: "+=1.5",
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.activeBomb = {
      x: bombPos.x,
      y: bombPos.y,
      fuseStartAt,
      explodeAt,
      bombBody,
      bombCap,
      bombDecor,
      fuse,
      spark,
    };
  }

  private pickBombSpawnPosition() {
    const minX = Phaser.Math.Clamp(this.player.x + this.bombSpawnAheadMin, 80, this.worldWidth - 80);
    const maxX = Phaser.Math.Clamp(this.player.x + this.bombSpawnAheadMax, 80, this.worldWidth - 80);
    const groundTopY = this.ground.y - this.ground.displayHeight * 0.5;
    const bombY = groundTopY - 8;

    if (maxX <= minX) {
      return null;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const x = Phaser.Math.Between(minX, Math.max(minX + 1, maxX));
      if (this.isUnderPlatformSpan(x)) {
        continue;
      }
      if (x <= this.player.x + 90) {
        continue;
      }
      return { x, y: bombY };
    }

    return null;
  }

  private detonateBomb(bomb: ActiveBomb) {
    this.playClaymoreBoomSound(bomb.x, bomb.y);

    const flash = this.add.circle(bomb.x, bomb.y, 20, 0xffe59a, 0.9);
    flash.setDepth(30);
    const blastCore = this.add.circle(bomb.x, bomb.y, 16, 0xff8a3c, 0.85);
    blastCore.setDepth(29);
    const shockwave = this.add.circle(bomb.x, bomb.y, 26, 0xffb86a, 0.55);
    shockwave.setDepth(28);
    shockwave.setStrokeStyle(3, 0xffd18a, 0.7);

    this.tweens.add({
      targets: flash,
      radius: this.bombExplosionRadius * 0.55,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: blastCore,
      radius: this.bombExplosionRadius * 0.45,
      alpha: 0,
      duration: 260,
      onComplete: () => blastCore.destroy(),
    });

    this.tweens.add({
      targets: shockwave,
      radius: this.bombExplosionRadius,
      alpha: 0,
      duration: 320,
      onComplete: () => shockwave.destroy(),
    });

    if (!this.playerIsDead) {
      const playerBounds = this.player.getCombatHitBounds();
      const playerCenterX = playerBounds.centerX;
      const playerCenterY = playerBounds.centerY;
      const distance = Phaser.Math.Distance.Between(bomb.x, bomb.y, playerCenterX, playerCenterY);
      if (distance <= this.bombExplosionRadius) {
        this.handlePlayerHit();
      }
    }

    this.clearActiveBomb();
    this.scheduleNextBombSpawn();
  }

  private updatePickupSystem() {
    if (this.missionState !== "running") {
      return;
    }

    if (!this.activePickup) {
      if (this.time.now >= this.nextPickupSpawnAt) {
        this.spawnPickup();
      }
      return;
    }

    if (this.playerIsDead) {
      return;
    }

    const pickup = this.activePickup;
    const playerBounds = this.player.getHitBounds();
    const playerPickupBounds = new Phaser.Geom.Rectangle(
      playerBounds.x - 8,
      playerBounds.y - 4,
      playerBounds.width + 16,
      playerBounds.height + 14
    );
    const pickupBounds = new Phaser.Geom.Rectangle(
      pickup.x - pickup.radius,
      pickup.y - pickup.radius,
      pickup.radius * 2,
      pickup.radius * 2
    );

    if (Phaser.Geom.Intersects.RectangleToRectangle(playerPickupBounds, pickupBounds)) {
      this.applyPickup(pickup.type);
      this.clearActivePickup();
      this.scheduleNextPickupSpawn();
    }
  }

  private spawnPickup() {
    const pos = this.pickPickupSpawnPosition();
    if (!pos) {
      this.scheduleNextPickupSpawn();
      return;
    }

    const typeRoll = Phaser.Math.Between(0, 99);
    const type: PickupType = typeRoll < 34 ? "medkit" : typeRoll < 67 ? "armor" : "ammo";

    const radius = 16;
    const glowColor = type === "medkit" ? 0xff6b6b : type === "armor" ? 0x62b6ff : 0xffd166;
    const coreColor = type === "medkit" ? 0xe24a4a : type === "armor" ? 0x3f8ed8 : 0xd49b3a;
    const labelText = type === "medkit" ? "+" : type === "armor" ? "S" : "A";

    const glow = this.add.circle(pos.x, pos.y, radius + 7, glowColor, 0.22);
    glow.setDepth(22);

    const core = this.add.circle(pos.x, pos.y, radius, coreColor, 0.95);
    core.setDepth(23);
    core.setStrokeStyle(2, 0xffffff, 0.5);

    const label = this.add.text(pos.x, pos.y, labelText, {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#102030",
      strokeThickness: 3,
    });
    label.setOrigin(0.5);
    label.setDepth(24);

    const objects: Phaser.GameObjects.GameObject[] = [glow, core, label];

    this.tweens.add({
      targets: objects,
      y: "-=6",
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.activePickup = {
      type,
      x: pos.x,
      y: pos.y,
      radius: radius + 6,
      objects,
    };
  }

  private pickPickupSpawnPosition() {
    const minX = Phaser.Math.Clamp(this.player.x + this.pickupSpawnAheadMin, 80, this.worldWidth - 80);
    const maxX = Phaser.Math.Clamp(this.player.x + this.pickupSpawnAheadMax, 80, this.worldWidth - 80);
    const groundTopY = this.ground.y - this.ground.displayHeight * 0.5;
    const pickupY = groundTopY - 20;

    if (maxX <= minX) {
      return null;
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Phaser.Math.Between(minX, Math.max(minX + 1, maxX));
      if (this.isUnderPlatformSpan(x)) {
        continue;
      }
      if (x <= this.player.x + 70) {
        continue;
      }
      return { x, y: pickupY };
    }

    return null;
  }

  private scheduleNextPickupSpawn() {
    const delay = Phaser.Math.Between(this.pickupSpawnMinDelayMs, this.pickupSpawnMaxDelayMs);
    this.nextPickupSpawnAt = this.time.now + delay;
  }

  private clearActivePickup() {
    if (!this.activePickup) {
      return;
    }

    for (const object of this.activePickup.objects) {
      object.destroy();
    }
    this.activePickup = null;
  }

  private applyPickup(type: PickupType) {
    if (type === "medkit") {
      this.lives += 1;
      this.refreshHud();
      this.showPowerupStatus("Medkit collected: +1 Life", "#86efac");
      return;
    }

    if (type === "armor") {
      this.armorShieldCharges = 1;
      this.showPowerupStatus("Armor collected: Shield ready", "#93c5fd");
      return;
    }

    this.ammoBurstActiveUntil = this.time.now + this.ammoBurstDurationMs;
    this.showPowerupStatus("Ammo Burst: 8.0s", "#fbbf24", this.ammoBurstDurationMs);
  }

  private getCurrentPlayerShotIntervalMs() {
    return this.time.now < this.ammoBurstActiveUntil
      ? this.ammoBurstShotIntervalMs
      : this.playerShotIntervalMs;
  }

  private clearActiveBomb() {
    if (!this.activeBomb) {
      return;
    }

    this.activeBomb.bombBody.destroy();
    this.activeBomb.bombCap.destroy();
    for (const part of this.activeBomb.bombDecor) {
      part.destroy();
    }
    this.activeBomb.fuse.destroy();
    this.activeBomb.spark.destroy();
    this.activeBomb = null;
  }

  private scheduleNextBombSpawn() {
    const delay = Phaser.Math.Between(this.bombSpawnMinDelayMs, this.bombSpawnMaxDelayMs);
    this.nextBombSpawnAt = this.time.now + delay;
  }

  private getAudioContext() {
    const maybeSoundManager = this.sound as unknown as { context?: AudioContext };
    return maybeSoundManager.context ?? null;
  }

  private bindVolumeControls() {
    const sfxInput = document.getElementById("hud-vol-sfx") as HTMLInputElement | null;
    if (sfxInput) {
      const clampedSfx = Phaser.Math.Clamp(this.masterSoundVolume, 0, 1);
      sfxInput.value = clampedSfx.toFixed(2);
      this.masterSoundVolume = clampedSfx;

      sfxInput.oninput = () => {
        const parsed = Number(sfxInput.value);
        if (!Number.isFinite(parsed)) return;
        this.masterSoundVolume = Phaser.Math.Clamp(parsed, 0, 1);
      };
    }

    const musicInput = document.getElementById("hud-vol-music") as HTMLInputElement | null;
    if (musicInput) {
      const clampedMusic = Phaser.Math.Clamp(this.musicVolume, 0, 1);
      musicInput.value = clampedMusic.toFixed(2);
      this.musicVolume = clampedMusic;

      musicInput.oninput = () => {
        const parsed = Number(musicInput.value);
        if (!Number.isFinite(parsed)) return;
        this.musicVolume = Phaser.Math.Clamp(parsed, 0, 1);
        this.applyLevelMusicVolume();
      };
    }
  }

  private applyLevelMusicVolume() {
    if (!this.levelMusic) {
      return;
    }

    const soundWithVolume = this.levelMusic as unknown as {
      setVolume?: (volume: number) => unknown;
      volume?: number;
    };

    if (typeof soundWithVolume.setVolume === "function") {
      soundWithVolume.setVolume(this.musicVolume);
      return;
    }

    if (typeof soundWithVolume.volume === "number") {
      soundWithVolume.volume = this.musicVolume;
    }
  }

  private playM16FireSound() {
    if (this.masterSoundVolume <= 0.001) return;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const shotNoiseBuffer = this.getOrCreateShotNoiseBuffer(audioContext);

    const crackOsc = audioContext.createOscillator();
    crackOsc.type = "square";
    crackOsc.frequency.setValueAtTime(2100 + Math.random() * 200, now);
    crackOsc.frequency.exponentialRampToValueAtTime(540, now + 0.022);

    const crackGain = audioContext.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.12 * this.masterSoundVolume, now + 0.0012);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    const bodyOsc = audioContext.createOscillator();
    bodyOsc.type = "triangle";
    bodyOsc.frequency.setValueAtTime(840 + Math.random() * 90, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(260, now + 0.085);

    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.19 * this.masterSoundVolume, now + 0.0036);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    const shotNoise = audioContext.createBufferSource();
    shotNoise.buffer = shotNoiseBuffer;

    const shotNoiseBand = audioContext.createBiquadFilter();
    shotNoiseBand.type = "bandpass";
    shotNoiseBand.frequency.setValueAtTime(2600, now);
    shotNoiseBand.Q.setValueAtTime(1.15, now);

    const shotNoiseHiCut = audioContext.createBiquadFilter();
    shotNoiseHiCut.type = "lowpass";
    shotNoiseHiCut.frequency.setValueAtTime(4600, now);
    shotNoiseHiCut.frequency.exponentialRampToValueAtTime(1700, now + 0.12);

    const shotNoiseGain = audioContext.createGain();
    shotNoiseGain.gain.setValueAtTime(0.0001, now);
    shotNoiseGain.gain.exponentialRampToValueAtTime(0.34 * this.masterSoundVolume, now + 0.002);
    shotNoiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    const slapDelay = audioContext.createDelay(0.2);
    slapDelay.delayTime.setValueAtTime(0.055, now);

    const slapGain = audioContext.createGain();
    slapGain.gain.setValueAtTime(0.05 * this.masterSoundVolume, now);

    crackOsc.connect(crackGain);
    bodyOsc.connect(bodyGain);
    shotNoise.connect(shotNoiseBand);
    shotNoiseBand.connect(shotNoiseHiCut);
    shotNoiseHiCut.connect(shotNoiseGain);

    crackGain.connect(audioContext.destination);
    bodyGain.connect(audioContext.destination);
    shotNoiseGain.connect(audioContext.destination);

    shotNoiseGain.connect(slapDelay);
    slapDelay.connect(slapGain);
    slapGain.connect(audioContext.destination);

    crackOsc.start(now);
    crackOsc.stop(now + 0.035);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.12);
    shotNoise.start(now);
    shotNoise.stop(now + 0.13);
  }

  private playAk47FireSound(sourceX?: number, sourceY?: number) {
    if (this.masterSoundVolume <= 0.001) return;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const shotNoiseBuffer = this.getOrCreateShotNoiseBuffer(audioContext);
    const spatial = this.getSpatialAudioFromSource({
      sourceX,
      sourceY,
      nearDistance: 120,
      farDistance: 1450,
      farVolume: 0.34,
      nearLowpassHz: 13000,
      farLowpassHz: 1500,
    });
    const outputGain = audioContext.createGain();
    outputGain.gain.setValueAtTime(1, now);

    const spatialLowpass = audioContext.createBiquadFilter();
    spatialLowpass.type = "lowpass";
    spatialLowpass.frequency.setValueAtTime(spatial.lowpassHz, now);

    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(spatial.pan, now);

    outputGain.connect(spatialLowpass);
    spatialLowpass.connect(panner);
    panner.connect(audioContext.destination);

    const crackOsc = audioContext.createOscillator();
    crackOsc.type = "square";
    crackOsc.frequency.setValueAtTime(1250 + Math.random() * 160, now);
    crackOsc.frequency.exponentialRampToValueAtTime(330, now + 0.034);

    const crackGain = audioContext.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.11 * this.masterSoundVolume * spatial.volume, now + 0.0016);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    const bodyOsc = audioContext.createOscillator();
    bodyOsc.type = "sawtooth";
    bodyOsc.frequency.setValueAtTime(520 + Math.random() * 55, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(105, now + 0.14);

    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.24 * this.masterSoundVolume * spatial.volume, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    const thumpOsc = audioContext.createOscillator();
    thumpOsc.type = "triangle";
    thumpOsc.frequency.setValueAtTime(190, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(75, now + 0.13);

    const thumpGain = audioContext.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.16 * this.masterSoundVolume * spatial.volume, now + 0.004);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    const shotNoise = audioContext.createBufferSource();
    shotNoise.buffer = shotNoiseBuffer;

    const shotNoiseBand = audioContext.createBiquadFilter();
    shotNoiseBand.type = "bandpass";
    shotNoiseBand.frequency.setValueAtTime(1700, now);
    shotNoiseBand.Q.setValueAtTime(0.95, now);

    const shotNoiseLow = audioContext.createBiquadFilter();
    shotNoiseLow.type = "lowpass";
    shotNoiseLow.frequency.setValueAtTime(3200, now);
    shotNoiseLow.frequency.exponentialRampToValueAtTime(1200, now + 0.19);

    const shotNoiseGain = audioContext.createGain();
    shotNoiseGain.gain.setValueAtTime(0.0001, now);
    shotNoiseGain.gain.exponentialRampToValueAtTime(0.38 * this.masterSoundVolume * spatial.volume, now + 0.0035);
    shotNoiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    const tailDelay = audioContext.createDelay(0.24);
    tailDelay.delayTime.setValueAtTime(0.08, now);

    const tailGain = audioContext.createGain();
    tailGain.gain.setValueAtTime(0.065 * this.masterSoundVolume * spatial.volume, now);

    crackOsc.connect(crackGain);
    bodyOsc.connect(bodyGain);
    thumpOsc.connect(thumpGain);
    shotNoise.connect(shotNoiseBand);
    shotNoiseBand.connect(shotNoiseLow);
    shotNoiseLow.connect(shotNoiseGain);

    crackGain.connect(outputGain);
    bodyGain.connect(outputGain);
    thumpGain.connect(outputGain);
    shotNoiseGain.connect(outputGain);

    shotNoiseGain.connect(tailDelay);
    tailDelay.connect(tailGain);
    tailGain.connect(outputGain);

    crackOsc.start(now);
    crackOsc.stop(now + 0.05);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.19);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.18);
    shotNoise.start(now);
    shotNoise.stop(now + 0.21);
  }

  private playClaymoreBoomSound(sourceX?: number, sourceY?: number) {
    if (this.masterSoundVolume <= 0.001) return;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const spatial = this.getSpatialAudioFromSource({
      sourceX,
      sourceY,
      nearDistance: 100,
      farDistance: 1700,
      farVolume: 0.28,
      nearLowpassHz: 12000,
      farLowpassHz: 1100,
    });
    const outputGain = audioContext.createGain();
    outputGain.gain.setValueAtTime(1, now);

    const spatialLowpass = audioContext.createBiquadFilter();
    spatialLowpass.type = "lowpass";
    spatialLowpass.frequency.setValueAtTime(spatial.lowpassHz, now);

    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(spatial.pan, now);

    outputGain.connect(spatialLowpass);
    spatialLowpass.connect(panner);
    panner.connect(audioContext.destination);

    const crackNoise = audioContext.createBufferSource();
    crackNoise.buffer = this.getOrCreateShotNoiseBuffer(audioContext);

    const crackHiPass = audioContext.createBiquadFilter();
    crackHiPass.type = "highpass";
    crackHiPass.frequency.setValueAtTime(1600, now);

    const crackGain = audioContext.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.25 * this.masterSoundVolume * spatial.volume, now + 0.0025);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    const subOsc = audioContext.createOscillator();
    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(150, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.85);

    const subGain = audioContext.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.52 * this.masterSoundVolume * spatial.volume, now + 0.014);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

    if (!this.boomNoiseBuffer) {
      const noiseLength = Math.floor(audioContext.sampleRate * 1.0);
      this.boomNoiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
      const data = this.boomNoiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = this.boomNoiseBuffer;

    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(110, now);
    bandpass.Q.setValueAtTime(0.85, now);

    const boomToneLowpass = audioContext.createBiquadFilter();
    boomToneLowpass.type = "lowpass";
    boomToneLowpass.frequency.setValueAtTime(900, now);
    boomToneLowpass.frequency.exponentialRampToValueAtTime(220, now + 0.7);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.82 * this.masterSoundVolume * spatial.volume, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

    const boomDelay = audioContext.createDelay(0.45);
    boomDelay.delayTime.setValueAtTime(0.11, now);

    const boomDelayGain = audioContext.createGain();
    boomDelayGain.gain.setValueAtTime(0.08 * this.masterSoundVolume * spatial.volume, now);

    crackNoise.connect(crackHiPass);
    crackHiPass.connect(crackGain);
    crackGain.connect(outputGain);

    subOsc.connect(subGain);
    subGain.connect(outputGain);

    noiseSource.connect(bandpass);
    bandpass.connect(boomToneLowpass);
    boomToneLowpass.connect(noiseGain);
    noiseGain.connect(outputGain);
    noiseGain.connect(boomDelay);
    boomDelay.connect(boomDelayGain);
    boomDelayGain.connect(outputGain);

    crackNoise.start(now);
    crackNoise.stop(now + 0.08);
    subOsc.start(now);
    subOsc.stop(now + 1.0);
    noiseSource.start(now);
    noiseSource.stop(now + 1.05);
  }

  private playPlayerDeathSound() {
    if (this.masterSoundVolume <= 0.001) return;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;

    const bodyOsc = audioContext.createOscillator();
    bodyOsc.type = "triangle";
    bodyOsc.frequency.setValueAtTime(230, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(42, now + 0.62);

    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.34 * this.masterSoundVolume, now + 0.02);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

    const crackNoise = audioContext.createBufferSource();
    crackNoise.buffer = this.getOrCreateShotNoiseBuffer(audioContext);

    const crackFilter = audioContext.createBiquadFilter();
    crackFilter.type = "bandpass";
    crackFilter.frequency.setValueAtTime(780, now);
    crackFilter.Q.setValueAtTime(0.9, now);

    const crackGain = audioContext.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.26 * this.masterSoundVolume, now + 0.008);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(audioContext.destination);

    crackNoise.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(audioContext.destination);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.74);
    crackNoise.start(now);
    crackNoise.stop(now + 0.3);
  }

  private playHamasDeathSound(sourceX?: number, sourceY?: number) {
    if (this.masterSoundVolume <= 0.001) return;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const spatial = this.getSpatialAudioFromSource({
      sourceX,
      sourceY,
      nearDistance: 120,
      farDistance: 1450,
      farVolume: 0.34,
      nearLowpassHz: 12000,
      farLowpassHz: 1500,
    });

    const outputGain = audioContext.createGain();
    outputGain.gain.setValueAtTime(1, now);

    const spatialLowpass = audioContext.createBiquadFilter();
    spatialLowpass.type = "lowpass";
    spatialLowpass.frequency.setValueAtTime(spatial.lowpassHz, now);

    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(spatial.pan, now);

    outputGain.connect(spatialLowpass);
    spatialLowpass.connect(panner);
    panner.connect(audioContext.destination);

    const bodyOsc = audioContext.createOscillator();
    bodyOsc.type = "sawtooth";
    bodyOsc.frequency.setValueAtTime(200, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(52, now + 0.58);

    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.32 * this.masterSoundVolume * spatial.volume, now + 0.016);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.64);

    const noise = audioContext.createBufferSource();
    noise.buffer = this.getOrCreateShotNoiseBuffer(audioContext);

    const noiseLow = audioContext.createBiquadFilter();
    noiseLow.type = "lowpass";
    noiseLow.frequency.setValueAtTime(1400, now);
    noiseLow.frequency.exponentialRampToValueAtTime(380, now + 0.45);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.24 * this.masterSoundVolume * spatial.volume, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(outputGain);

    noise.connect(noiseLow);
    noiseLow.connect(noiseGain);
    noiseGain.connect(outputGain);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.66);
    noise.start(now);
    noise.stop(now + 0.52);
  }

  private getOrCreateShotNoiseBuffer(audioContext: AudioContext) {
    if (this.shotNoiseBuffer) {
      return this.shotNoiseBuffer;
    }

    const durationSec = 0.25;
    const noiseLength = Math.floor(audioContext.sampleRate * durationSec);
    const buffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    let last = 0;
    for (let i = 0; i < noiseLength; i++) {
      const white = Math.random() * 2 - 1;
      const pinkish = last * 0.9 + white * 0.1;
      const env = 1 - i / noiseLength;
      data[i] = pinkish * env;
      last = pinkish;
    }

    this.shotNoiseBuffer = buffer;
    return buffer;
  }

  private getSpatialAudioFromSource(params: {
    sourceX?: number;
    sourceY?: number;
    nearDistance: number;
    farDistance: number;
    farVolume: number;
    nearLowpassHz: number;
    farLowpassHz: number;
  }) {
    const listenerX = this.player ? this.player.x : this.cameras.main.worldView.centerX;
    const listenerY = this.player ? this.player.y : this.cameras.main.worldView.centerY;

    const sourceX = params.sourceX ?? listenerX;
    const sourceY = params.sourceY ?? listenerY;

    const distance = Phaser.Math.Distance.Between(listenerX, listenerY, sourceX, sourceY);
    const t = Phaser.Math.Clamp(
      (distance - params.nearDistance) / Math.max(1, params.farDistance - params.nearDistance),
      0,
      1
    );

    const volume = Phaser.Math.Linear(1, params.farVolume, t);
    const lowpassHz = Phaser.Math.Linear(params.nearLowpassHz, params.farLowpassHz, t);
    const pan = Phaser.Math.Clamp((sourceX - listenerX) / 650, -0.9, 0.9);

    return { volume, lowpassHz, pan };
  }

  private createMissionOverlay() {
    this.missionOverlayText?.destroy();
    this.powerupOverlayText?.destroy();

    this.missionOverlayText = this.add.text(
      this.scale.width * 0.5,
      22,
      `Mission #${this.currentLevel} - Eliminate ${this.targetKills} Vipers`,
      {
        fontFamily: "Arial",
        fontSize: "30px",
        color: "#7ec8ff",
        fontStyle: "bold",
        stroke: "#0b1a30",
        strokeThickness: 4,
      }
    );
    this.missionOverlayText.setOrigin(0.5, 0);
    this.missionOverlayText.setDepth(300);
    this.missionOverlayText.setScrollFactor(0);
    this.missionOverlayText.setShadow(0, 0, "#7ec8ff", 18, true, true);

    this.powerupOverlayText = this.add.text(this.scale.width * 0.5, 58, "", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#fbbf24",
      fontStyle: "bold",
      stroke: "#0b1a30",
      strokeThickness: 4,
    });
    this.powerupOverlayText.setOrigin(0.5, 0);
    this.powerupOverlayText.setDepth(299);
    this.powerupOverlayText.setScrollFactor(0);
    this.powerupOverlayText.setShadow(0, 0, "#7ec8ff", 18, true, true);
    this.powerupOverlayExpiresAt = 0;
  }

  private startIntroCountdown() {
    this.countdownOverlayText?.destroy();
    this.countdownOverlayText = this.add.text(this.scale.width * 0.5, this.scale.height * 0.42, "3", {
      fontFamily: "Arial",
      fontSize: "118px",
      color: "#7ec8ff",
      fontStyle: "bold",
      stroke: "#0b1a30",
      strokeThickness: 8,
    });
    this.countdownOverlayText.setOrigin(0.5);
    this.countdownOverlayText.setDepth(320);
    this.countdownOverlayText.setScrollFactor(0);
    this.countdownOverlayText.setShadow(0, 0, "#7ec8ff", 26, true, true);

    const steps = ["3", "2", "1"];
    steps.forEach((label, index) => {
      this.time.delayedCall(index * 700, () => {
        if (!this.countdownOverlayText) return;
        this.countdownOverlayText.setText(label);
        this.countdownOverlayText.setAlpha(1);
        this.countdownOverlayText.setShadow(0, 0, "#7ec8ff", 30, true, true);
      });
    });

    this.time.delayedCall(2100, () => {
      if (!this.countdownOverlayText) return;
      this.countdownOverlayText.setText("GO!");
      this.countdownOverlayText.setAlpha(1);
      this.countdownOverlayText.setShadow(0, 0, "#7ec8ff", 34, true, true);
      this.fadeLevelMusicTo(this.musicVolume, 420);
    });

    this.time.delayedCall(2480, () => {
      this.introCountdownActive = false;
      this.countdownOverlayText?.destroy();
      this.countdownOverlayText = null;
    });
  }

  private getCurrentLevelIndex() {
    return this.currentLevel;
  }

  private getLevelMusicKey() {
    const levelIndex = this.getCurrentLevelIndex();
    void levelIndex;
    return "level_music_1";
  }

  private playLevelMusic() {
    const key = this.getLevelMusicKey();

    if (this.levelMusic?.isPlaying && this.levelMusic.key === key) {
      return;
    }

    this.levelMusic?.stop();
    this.levelMusic?.destroy();
    this.levelMusic = null;

    this.levelMusic = this.sound.add(key, {
      loop: true,
      volume: this.musicVolume,
    });
    this.applyLevelMusicVolume();
    this.fadeLevelMusicTo(this.musicVolume * this.countdownMusicMultiplier, 0);
    this.levelMusic.play();
  }

  private fadeLevelMusicTo(targetVolume: number, durationMs: number) {
    if (!this.levelMusic) {
      return;
    }

    const desiredVolume = Phaser.Math.Clamp(targetVolume, 0, 1);

    const soundWithVolume = this.levelMusic as unknown as {
      setVolume?: (volume: number) => unknown;
      volume?: number;
    };

    const getCurrentVolume = () => {
      if (typeof soundWithVolume.volume === "number") {
        return soundWithVolume.volume;
      }
      return this.musicVolume;
    };

    const applyVolume = (volume: number) => {
      if (typeof soundWithVolume.setVolume === "function") {
        soundWithVolume.setVolume(volume);
        return;
      }
      if (typeof soundWithVolume.volume === "number") {
        soundWithVolume.volume = volume;
      }
    };

    if (durationMs <= 0) {
      applyVolume(desiredVolume);
      return;
    }

    const startVolume = getCurrentVolume();
    const steps = Math.max(1, Math.floor(durationMs / this.musicFadeStepMs));

    for (let step = 1; step <= steps; step++) {
      this.time.delayedCall(step * this.musicFadeStepMs, () => {
        if (!this.levelMusic) {
          return;
        }
        const t = step / steps;
        const nextVolume = Phaser.Math.Linear(startVolume, desiredVolume, t);
        applyVolume(nextVolume);
      });
    }
  }

  private stopLevelMusic() {
    this.levelMusic?.stop();
    this.levelMusic?.destroy();
    this.levelMusic = null;
  }

  private showPowerupStatus(message: string, color: string, durationMs = 1600) {
    if (!this.powerupOverlayText) {
      return;
    }

    this.powerupOverlayText.setText(message);
    this.powerupOverlayText.setColor(color);
    this.powerupOverlayText.setShadow(0, 0, "#7ec8ff", 18, true, true);
    this.powerupOverlayExpiresAt = this.time.now + durationMs;
  }

  private updatePowerupOverlay() {
    if (!this.powerupOverlayText) {
      return;
    }

    if (this.missionState !== "running") {
      this.powerupOverlayText.setText("");
      return;
    }

    const ammoRemainingMs = this.ammoBurstActiveUntil - this.time.now;
    if (ammoRemainingMs > 0) {
      const remainingSec = Math.max(0, ammoRemainingMs / 1000);
      this.powerupOverlayText.setText(`Ammo Burst: ${remainingSec.toFixed(1)}s`);
      this.powerupOverlayText.setColor("#fbbf24");
      this.powerupOverlayText.setShadow(0, 0, "#7ec8ff", 18, true, true);
      return;
    }

    if (this.armorShieldCharges > 0) {
      this.powerupOverlayText.setText("Shield: Ready");
      this.powerupOverlayText.setColor("#93c5fd");
      this.powerupOverlayText.setShadow(0, 0, "#7ec8ff", 18, true, true);
      return;
    }

    if (this.time.now >= this.powerupOverlayExpiresAt) {
      this.powerupOverlayText.setText("");
    }
  }

  private refreshHud() {
    if (this.hudLivesEl) {
      this.hudLivesEl.textContent = `Lives: ${this.lives}`;
    }
    if (this.hudKillsEl) {
      this.hudKillsEl.textContent = `Vipers Eliminated: ${this.kills}/${this.targetKills}`;
    }
  }

  private handlePlayerHit() {
    if (this.playerIsDead) return;

    if (this.armorShieldCharges > 0) {
      this.armorShieldCharges -= 1;
      this.showPowerupStatus("Shield absorbed the hit", "#93c5fd", 1200);
      return;
    }

    this.playPlayerDeathSound();
    this.player.die();
    this.playerIsDead = true;
    this.playerDeathTime = this.time.now;
    this.lives = Math.max(0, this.lives - 1);
    this.refreshHud();
  }

  private respawnPlayerLeftSide() {
    const leftX = Phaser.Math.Clamp(
      this.cameras.main.worldView.left + 120,
      60,
      this.worldWidth - 60
    );
    this.player.respawnAt(leftX, 480);
    this.playerIsDead = false;
    this.playerDeathTime = 0;
  }

  private getConfiguredLives() {
    const configuredLives = (this.game.config as unknown as Phaser.Types.Core.GameConfig & {
      gameplay?: { lives?: number };
    }).gameplay?.lives;

    if (typeof configuredLives !== "number" || !Number.isFinite(configuredLives)) {
      return 3;
    }

    return Math.max(1, Math.floor(configuredLives));
  }

  private winMission() {
    this.missionState = "won";
    this.stopLevelMusic();
    this.clearActivePickup();
    const finalLevel = this.currentLevel >= this.maxLevels;

    if (this.missionOverlayText) {
      this.missionOverlayText.setText(finalLevel ? "Mission Passed" : `Level ${this.currentLevel} Passed`);
      this.missionOverlayText.setColor("#86efac");
    }

    if (!finalLevel) {
      const nextLevel = this.currentLevel + 1;
      if (this.hudStatusEl) {
        this.hudStatusEl.textContent = `Loading Mission #${nextLevel}...`;
      }
      this.time.delayedCall(1400, () => {
        this.scene.restart({ level: nextLevel, lives: this.lives });
      });
    }
  }

  private failMission(label: string) {
    this.missionState = "lost";
    this.stopLevelMusic();
    this.clearActivePickup();
    if (this.missionOverlayText) {
      this.missionOverlayText.setText(label);
      this.missionOverlayText.setColor("#fca5a5");
    }
  }
}