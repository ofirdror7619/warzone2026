import sharp from "sharp";

const src = "src/assets/jumping_5figures_transparent.png";
const outNorm = "src/assets/jumping_5figures_transparent_norm.png";
const outCombined = "src/assets/soldier_idle_walk_fire_jump_combined.png";

const FRAME_W = 256;
const FRAME_H = 256;
const FRAMES = 5;
const TARGET_H = 243;

const meta = await sharp(src).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;

if (width <= 0 || height <= 0) {
  throw new Error("Invalid source size for jump strip.");
}

const rowComposites = [];

for (let index = 0; index < FRAMES; index++) {
  const left = Math.floor((index * width) / FRAMES);
  const right = index === FRAMES - 1 ? width : Math.floor(((index + 1) * width) / FRAMES);
  const sliceWidth = Math.max(1, right - left);

  const sliceBuffer = await sharp(src)
    .extract({ left, top: 0, width: sliceWidth, height })
    .png()
    .toBuffer();

  const sliceRaw = await sharp(sliceBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = sliceWidth;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < sliceWidth; x++) {
      const alpha = sliceRaw.data[(y * sliceWidth + x) * sliceRaw.info.channels + 3];
      if (alpha > 3) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cropLeft = maxX >= 0 ? minX : 0;
  const cropTop = maxY >= 0 ? minY : 0;
  const cropWidth = maxX >= 0 ? Math.max(1, maxX - minX + 1) : sliceWidth;
  const cropHeight = maxY >= 0 ? Math.max(1, maxY - minY + 1) : height;

  const cropped = await sharp(sliceBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const resized = await sharp(cropped)
    .resize({
      width: FRAME_W,
      height: TARGET_H,
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const resizedW = resizedMeta.width ?? FRAME_W;
  const resizedH = resizedMeta.height ?? TARGET_H;

  const frame = await sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((FRAME_W - resizedW) / 2),
        top: FRAME_H - resizedH,
      },
    ])
    .png()
    .toBuffer();

  rowComposites.push({ input: frame, left: index * FRAME_W, top: 0 });
}

await sharp({
  create: {
    width: FRAME_W * 8,
    height: FRAME_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(rowComposites)
  .png()
  .toFile(outNorm);

await sharp({
  create: {
    width: 2048,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: "src/assets/idle_4figures_transparent_norm.png", left: 0, top: 0 },
    { input: "src/assets/walking_8figures_transparent_norm.png", left: 0, top: 256 },
    { input: "src/assets/firing_4figures_transparent_norm.png", left: 0, top: 512 },
    { input: outNorm, left: 0, top: 768 },
  ])
  .png()
  .toFile(outCombined);

console.log(JSON.stringify({ outNorm, outCombined, targetHeight: TARGET_H }, null, 2));
