import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;
const DUCK_VISUAL_SCALE = 0.88;

async function processSoldierDuck() {
  const inputFile = "src/assets/duck - 1 figure.png";
  const outputFile = "src/assets/soldier_duck_transparent.png";

  console.log("Processing soldier duck sprite...");

  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);
  const alphaThreshold = 10;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isBackground =
      (r > 168 && g > 168 && b > 168) ||
      (r > 132 && g > 132 && b > 132 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22);

    if (isBackground) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  console.log("  Removing dirt artifacts...");
  const visited = new Uint8Array(width * height);
  const components = [];

  function collectComponent(seedX, seedY) {
    const stack = [[seedX, seedY]];
    const pixels = [];

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const linear = y * width + x;
      if (visited[linear]) continue;
      visited[linear] = 1;

      const idx = linear * channels;
      if (data[idx + 3] <= alphaThreshold) continue;

      pixels.push(linear);

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
      stack.push([x + 1, y + 1]);
      stack.push([x - 1, y - 1]);
      stack.push([x + 1, y - 1]);
      stack.push([x - 1, y + 1]);
    }

    return pixels;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const linear = y * width + x;
      if (visited[linear]) continue;

      const idx = linear * channels;
      if (data[idx + 3] <= alphaThreshold) continue;

      const component = collectComponent(x, y);
      if (component.length > 0) {
        components.push(component);
      }
    }
  }

  if (components.length > 1) {
    components.sort((a, b) => b.length - a.length);
    for (let i = 1; i < components.length; i++) {
      for (const p of components[i]) {
        const pIdx = p * channels;
        data[pIdx] = 0;
        data[pIdx + 1] = 0;
        data[pIdx + 2] = 0;
        data[pIdx + 3] = 0;
      }
    }
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (data[idx + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No visible duck pixels found after cleanup");
  }

  const figWidth = maxX - minX + 1;
  const figHeight = maxY - minY + 1;
  const fitScale = Math.min((FRAME_W - 16) / figWidth, (FRAME_H - 12) / figHeight, 1);
  const scale = fitScale * DUCK_VISUAL_SCALE;

  const scaledWidth = Math.floor(figWidth * scale);
  const scaledHeight = Math.floor(figHeight * scale);

  const outputData = Buffer.alloc(FRAME_W * FRAME_H * 4);
  const offsetX = Math.floor((FRAME_W - scaledWidth) / 2);
  const offsetY = FRAME_H - scaledHeight - 6;

  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      const srcIdx = (sy * width + sx) * channels;
      if (data[srcIdx + 3] <= alphaThreshold) continue;

      const localX = sx - minX;
      const localY = sy - minY;
      const dx = Math.floor(offsetX + localX * scale);
      const dy = Math.floor(offsetY + localY * scale);

      if (dx >= 0 && dx < FRAME_W && dy >= 0 && dy < FRAME_H) {
        const dstIdx = (dy * FRAME_W + dx) * 4;
        outputData[dstIdx] = data[srcIdx];
        outputData[dstIdx + 1] = data[srcIdx + 1];
        outputData[dstIdx + 2] = data[srcIdx + 2];
        outputData[dstIdx + 3] = data[srcIdx + 3];
      }
    }
  }

  await sharp(outputData, {
    raw: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
    },
  })
    .png()
    .toFile(outputFile);

  console.log(`  ✓ Saved ${outputFile} (${FRAME_W}x${FRAME_H})`);
}

processSoldierDuck();
