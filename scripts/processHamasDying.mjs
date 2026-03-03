import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;
const ALPHA_THRESHOLD = 8;

const INPUT_FILES = [
  "src/assets/hamas dying - figure #1.png",
  "src/assets/hamas dying - figure #2.png",
  "src/assets/hamas dying - figure #3.png",
  "src/assets/hamas dying - figure #4.png",
  "src/assets/hamas dying - figure #5.png",
];

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
    count++;
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

    const isBackground = saturation(r, g, b) <= 84 && colorDistance(r, g, b) <= 175;
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

function removeTinyBlobs(data, width, height, channels, minSize = 12) {
  const visited = new Uint8Array(width * height);

  const pushIfValid = (stack, x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    stack.push([x, y]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (visited[p]) continue;

      const idx = p * channels;
      if (data[idx + 3] <= ALPHA_THRESHOLD) {
        visited[p] = 1;
        continue;
      }

      const stack = [[x, y]];
      visited[p] = 1;
      const component = [];

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const cp = cy * width + cx;
        const cIdx = cp * channels;
        if (data[cIdx + 3] <= ALPHA_THRESHOLD) continue;

        component.push(cp);

        pushIfValid(stack, cx + 1, cy);
        pushIfValid(stack, cx - 1, cy);
        pushIfValid(stack, cx, cy + 1);
        pushIfValid(stack, cx, cy - 1);
        pushIfValid(stack, cx + 1, cy + 1);
        pushIfValid(stack, cx - 1, cy - 1);
        pushIfValid(stack, cx + 1, cy - 1);
        pushIfValid(stack, cx - 1, cy + 1);
      }

      if (component.length < minSize) {
        for (const cp of component) {
          const cIdx = cp * channels;
          data[cIdx] = 0;
          data[cIdx + 1] = 0;
          data[cIdx + 2] = 0;
          data[cIdx + 3] = 0;
        }
      }
    }
  }
}

async function loadAndCleanFigure(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  clearBorderBackground(data, width, height, channels);
  removeTinyBlobs(data, width, height, channels, 12);

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (data[idx + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error(`No visible pixels found in ${path}`);
  }

  return { data, width, height, channels, minX, maxX, minY, maxY, path };
}

async function processHamasDying() {
  const outputFile = "src/assets/hamas_dying_transparent.png";

  console.log("Processing Hamas dying sprites from individual files...");

  const figures = [];
  for (const path of INPUT_FILES) {
    const fig = await loadAndCleanFigure(path);
    figures.push(fig);
    console.log(`  ${path} -> bbox (${fig.minX},${fig.minY})-(${fig.maxX},${fig.maxY})`);
  }

  const maxFigW = Math.max(...figures.map((f) => f.maxX - f.minX + 1));
  const maxFigH = Math.max(...figures.map((f) => f.maxY - f.minY + 1));
  const uniformScale = Math.min((FRAME_W - 10) / maxFigW, (FRAME_H - 8) / maxFigH, 1);

  const sheetW = FRAME_W * INPUT_FILES.length;
  const outputData = Buffer.alloc(sheetW * FRAME_H * 4);

  for (let frame = 0; frame < figures.length; frame++) {
    const fig = figures[frame];
    const figW = fig.maxX - fig.minX + 1;
    const figH = fig.maxY - fig.minY + 1;

    const scaledW = Math.max(1, Math.floor(figW * uniformScale));
    const scaledH = Math.max(1, Math.floor(figH * uniformScale));

    const frameLeft = frame * FRAME_W;
    const offsetX = frameLeft + Math.floor((FRAME_W - scaledW) / 2);
    const offsetY = FRAME_H - scaledH - 4;

    for (let sy = fig.minY; sy <= fig.maxY; sy++) {
      for (let sx = fig.minX; sx <= fig.maxX; sx++) {
        const srcIdx = (sy * fig.width + sx) * fig.channels;
        if (fig.data[srcIdx + 3] <= ALPHA_THRESHOLD) continue;

        const dx = Math.floor(offsetX + (sx - fig.minX) * uniformScale);
        const dy = Math.floor(offsetY + (sy - fig.minY) * uniformScale);

        if (dx < frameLeft || dx >= frameLeft + FRAME_W || dy < 0 || dy >= FRAME_H) continue;

        const dstIdx = (dy * sheetW + dx) * 4;
        outputData[dstIdx] = fig.data[srcIdx];
        outputData[dstIdx + 1] = fig.data[srcIdx + 1];
        outputData[dstIdx + 2] = fig.data[srcIdx + 2];
        outputData[dstIdx + 3] = fig.data[srcIdx + 3];
      }
    }
  }

  await sharp(outputData, {
    raw: {
      width: sheetW,
      height: FRAME_H,
      channels: 4,
    },
  })
    .png()
    .toFile(outputFile);

  console.log(`  ✓ Saved ${outputFile} (${sheetW}x${FRAME_H})`);
}

processHamasDying().catch((error) => {
  console.error("Failed to process Hamas dying sprites:", error);
  process.exitCode = 1;
});
