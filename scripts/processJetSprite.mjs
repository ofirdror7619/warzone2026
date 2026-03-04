import sharp from "sharp";

const INPUT = "src/assets/airstrike-sprites/jet.png";
const OUTPUT = "src/assets/airstrike-sprites/jet_transparent.png";
const ALPHA_THRESHOLD = 12;

function estimateBorderSeed(data, width, height, channels) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  const add = (x, y) => {
    const idx = (y * width + x) * channels;
    sumR += data[idx];
    sumG += data[idx + 1];
    sumB += data[idx + 2];
    count += 1;
  };

  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }

  return {
    r: Math.round(sumR / Math.max(1, count)),
    g: Math.round(sumG / Math.max(1, count)),
    b: Math.round(sumB / Math.max(1, count)),
  };
}

function clearBorderBackground(data, width, height, channels) {
  const seed = estimateBorderSeed(data, width, height, channels);

  const colorDistance = (r, g, b) => Math.abs(r - seed.r) + Math.abs(g - seed.g) + Math.abs(b - seed.b);
  const saturation = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

  const visited = new Uint8Array(width * height);
  const stack = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    stack.push([x, y]);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const idx = (y * width + x) * channels;

    if (data[idx + 3] <= ALPHA_THRESHOLD) continue;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const isBackground = saturation(r, g, b) <= 105 && colorDistance(r, g, b) <= 220;
    if (!isBackground) continue;

    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 0;

    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

async function run() {
  const { data, info } = await sharp(INPUT)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  clearBorderBackground(data, info.width, info.height, info.channels);

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(OUTPUT);

  console.log(`✅ Clean transparent jet written to ${OUTPUT}`);
}

run().catch((error) => {
  console.error("❌ Jet sprite cleanup failed:", error);
  process.exit(1);
});
