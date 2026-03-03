import sharp from "sharp";

const file = "src/assets/soldier_idle_walk_fire_jump_combined.png";
const FRAME_W = 256;
const FRAME_H = 256;
const firingFrames = [16, 17, 18, 19];

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const sheetW = info.width;
const channels = info.channels;

const indexOf = (x, y) => (y * sheetW + x) * channels;

function frameStats(frame) {
  const col = frame % 8;
  const row = Math.floor(frame / 8);
  const ox = col * FRAME_W;
  const oy = row * FRAME_H;

  let minX = FRAME_W;
  let minY = FRAME_H;
  let maxX = -1;
  let maxY = -1;

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const i = indexOf(ox + x, oy + y);
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a <= 3) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const isMuzzleFlash = r > 220 && g > 170 && b < 170;
      if (!isMuzzleFlash) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (maxX < 0) {
    return {
      frame,
      minX: 0,
      minY: 0,
      maxX: FRAME_W - 1,
      maxY: FRAME_H - 1,
      width: FRAME_W,
      height: FRAME_H,
      centerX: FRAME_W / 2,
      centerY: FRAME_H / 2,
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const centerX = count > 0 ? sumX / count : minX + width / 2;
  const centerY = count > 0 ? sumY / count : minY + height / 2;

  return { frame, minX, minY, maxX, maxY, width, height, centerX, centerY };
}

const stats = firingFrames.map(frameStats);

const sortedCenters = [...stats].map((s) => s.centerX).sort((a, b) => a - b);
const targetCenterX = sortedCenters[Math.floor(sortedCenters.length / 2)];
const targetBottom = FRAME_H - 1;

const base = Buffer.from(data);
for (const frame of firingFrames) {
  const col = frame % 8;
  const row = Math.floor(frame / 8);
  const ox = col * FRAME_W;
  const oy = row * FRAME_H;

  for (let y = oy; y < oy + FRAME_H; y++) {
    for (let x = ox; x < ox + FRAME_W; x++) {
      const i = indexOf(x, y);
      base[i] = 0;
      base[i + 1] = 0;
      base[i + 2] = 0;
      base[i + 3] = 0;
    }
  }
}

const cleared = await sharp(base, {
  raw: { width: info.width, height: info.height, channels },
})
  .png()
  .toBuffer();

const composites = [];
for (const s of stats) {
  const col = s.frame % 8;
  const row = Math.floor(s.frame / 8);
  const ox = col * FRAME_W;
  const oy = row * FRAME_H;

  const cropped = await sharp(file)
    .extract({ left: ox + s.minX, top: oy + s.minY, width: s.width, height: s.height })
    .png()
    .toBuffer();

  const desiredLeft = Math.round(targetCenterX - (s.centerX - s.minX));
  const left = Math.max(0, Math.min(desiredLeft, FRAME_W - s.width));
  const top = Math.max(0, targetBottom - s.height + 1);

  const frameCanvas = await sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left, top }])
    .png()
    .toBuffer();

  composites.push({ input: frameCanvas, left: ox, top: oy });
}

await sharp(cleared).composite(composites).png().toFile(file);

console.log(
  JSON.stringify({ file, alignedFrames: firingFrames, targetCenterX, targetBottom, stats }, null, 2),
);
