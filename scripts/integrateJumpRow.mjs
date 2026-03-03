import sharp from "sharp";

const src = "src/assets/jumping - 5 figures.png";
const outTransparent = "src/assets/jumping_5figures_transparent.png";
const outNorm = "src/assets/jumping_5figures_transparent_norm.png";
const outCombined = "src/assets/soldier_idle_walk_fire_jump_combined.png";

const FRAME_W = 256;
const FRAME_H = 256;
const FRAMES = 5;
const JUMP_VISUAL_SCALE = 1.16;

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const width = info.width;
const height = info.height;
const channels = info.channels;
const pixelIndex = (x, y) => (y * width + x) * channels;

let sumR = 0;
let sumG = 0;
let sumB = 0;
let count = 0;
for (let x = 0; x < width; x++) {
  for (const y of [0, height - 1]) {
    const i = pixelIndex(x, y);
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    count++;
  }
}
for (let y = 1; y < height - 1; y++) {
  for (const x of [0, width - 1]) {
    const i = pixelIndex(x, y);
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    count++;
  }
}

const seed = {
  r: Math.round(sumR / count),
  g: Math.round(sumG / count),
  b: Math.round(sumB / count),
};

const colorDistance = (r, g, b) => Math.abs(r - seed.r) + Math.abs(g - seed.g) + Math.abs(b - seed.b);
const saturation = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

const visited = new Uint8Array(width * height);
const queue = [];
const push = (x, y) => {
  const key = y * width + x;
  if (visited[key]) return;
  visited[key] = 1;
  queue.push([x, y]);
};

for (let x = 0; x < width; x++) {
  push(x, 0);
  push(x, height - 1);
}
for (let y = 1; y < height - 1; y++) {
  push(0, y);
  push(width - 1, y);
}

while (queue.length > 0) {
  const [x, y] = queue.pop();
  const i = pixelIndex(x, y);
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];

  const isBackground = a > 5 && saturation(r, g, b) < 90 && colorDistance(r, g, b) < 170;
  if (!isBackground) continue;

  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 0;

  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
    if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
      push(nx, ny);
    }
  }
}

await sharp(data, { raw: { width, height, channels } }).png().toFile(outTransparent);

const rowComposites = [];
for (let index = 0; index < FRAMES; index++) {
  const left = Math.floor((index * width) / FRAMES);
  const right = index === FRAMES - 1 ? width : Math.floor(((index + 1) * width) / FRAMES);
  const sliceWidth = Math.max(1, right - left);

  const targetW = Math.max(1, Math.floor(FRAME_W * JUMP_VISUAL_SCALE));
  const targetH = Math.max(1, Math.floor(FRAME_H * JUMP_VISUAL_SCALE));

  let slicePipeline = sharp(outTransparent)
    .extract({ left, top: 0, width: sliceWidth, height })
    .resize({
      width: targetW,
      height: targetH,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  if (targetW > FRAME_W || targetH > FRAME_H) {
    const extractLeft = Math.max(0, Math.floor((targetW - FRAME_W) / 2));
    const extractTop = Math.max(0, targetH - FRAME_H);
    slicePipeline = slicePipeline.extract({
      left: extractLeft,
      top: extractTop,
      width: FRAME_W,
      height: FRAME_H,
    });
  } else {
    const padLeft = Math.floor((FRAME_W - targetW) / 2);
    const padRight = FRAME_W - targetW - padLeft;
    const padTop = FRAME_H - targetH;
    slicePipeline = slicePipeline.extend({
      top: padTop,
      left: padLeft,
      right: padRight,
      bottom: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  const slice = await slicePipeline.png().toBuffer();

  rowComposites.push({ input: slice, left: index * FRAME_W, top: 0 });
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

console.log(JSON.stringify({ outTransparent, outNorm, outCombined }, null, 2));
