import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;
const FRAMES = 7;

async function processSoldierDying() {
  const inputFile = "src/assets/dying - 7 figures.png";
  const outputFile = "src/assets/soldier_dying_transparent.png";

  console.log("Processing soldier dying sprite...");

  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);

  const alphaThreshold = 12;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isBackground =
      (r > 175 && g > 175 && b > 175) ||
      (r > 140 && g > 140 && b > 140 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28);

    if (isBackground) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  console.log("  Removing isolated noise...");

  const visitedGlobal = new Uint8Array(width * height);

  function collectComponentInRegion(startX, endX, seedX, seedY, visitedMap) {
    const stack = [[seedX, seedY]];
    const pixels = [];

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < startX || x >= endX || y < 0 || y >= height) continue;

      const linear = y * width + x;
      if (visitedMap[linear]) continue;
      visitedMap[linear] = 1;

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

  const minClusterSize = 35;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const linear = y * width + x;
      if (visitedGlobal[linear]) continue;

      const idx = linear * channels;
      if (data[idx + 3] <= alphaThreshold) continue;

      const component = collectComponentInRegion(0, width, x, y, visitedGlobal);
      if (component.length > 0 && component.length < minClusterSize) {
        for (const p of component) {
          const pIdx = p * channels;
          data[pIdx] = 0;
          data[pIdx + 1] = 0;
          data[pIdx + 2] = 0;
          data[pIdx + 3] = 0;
        }
      }
    }
  }

  console.log("  Keeping main figure per frame...");
  for (let frame = 0; frame < FRAMES; frame++) {
    const startX = Math.floor((frame * width) / FRAMES);
    const endX = Math.floor(((frame + 1) * width) / FRAMES);
    const visitedFrame = new Uint8Array(width * height);

    const components = [];

    for (let y = 0; y < height; y++) {
      for (let x = startX; x < endX; x++) {
        const linear = y * width + x;
        if (visitedFrame[linear]) continue;

        const idx = linear * channels;
        if (data[idx + 3] <= alphaThreshold) continue;

        const component = collectComponentInRegion(startX, endX, x, y, visitedFrame);
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
  }

  const figures = [];

  for (let frame = 0; frame < FRAMES; frame++) {
    const startX = Math.floor((frame * width) / FRAMES);
    const endX = Math.floor(((frame + 1) * width) / FRAMES);

    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * channels;
        const a = data[idx + 3];
        if (a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      console.log(`  Frame ${frame}: no pixels found, using full segment`);
      figures.push({ minX: startX, maxX: endX - 1, minY: 0, maxY: height - 1, figWidth: endX - startX, figHeight: height });
    } else {
      const figWidth = maxX - minX + 1;
      const figHeight = maxY - minY + 1;
      figures.push({ minX, maxX, minY, maxY, figWidth, figHeight });
      console.log(`  Frame ${frame}: bbox=(${minX},${minY})-(${maxX},${maxY}), size=${figWidth}x${figHeight}`);
    }
  }

  const maxFigWidth = Math.max(...figures.map((f) => f.figWidth));
  const maxFigHeight = Math.max(...figures.map((f) => f.figHeight));
  const scale = Math.min((FRAME_W - 12) / maxFigWidth, (FRAME_H - 12) / maxFigHeight, 1);

  const sheetWidth = FRAMES * FRAME_W;
  const sheetHeight = FRAME_H;
  const outputData = Buffer.alloc(sheetWidth * sheetHeight * 4);

  const scaledMaxHeight = Math.floor(maxFigHeight * scale);

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    const frameLeft = i * FRAME_W;
    const scaledWidth = Math.floor(fig.figWidth * scale);
    const scaledHeight = Math.floor(fig.figHeight * scale);

    const offsetX = frameLeft + Math.floor((FRAME_W - scaledWidth) / 2);
    const offsetY = FRAME_H - scaledMaxHeight - 6 + (scaledMaxHeight - scaledHeight);

    for (let sy = fig.minY; sy <= fig.maxY; sy++) {
      for (let sx = fig.minX; sx <= fig.maxX; sx++) {
        const srcIdx = (sy * width + sx) * channels;
        const a = data[srcIdx + 3];
        if (a <= alphaThreshold) continue;

        const localX = sx - fig.minX;
        const localY = sy - fig.minY;
        const dx = Math.floor(offsetX + localX * scale);
        const dy = Math.floor(offsetY + localY * scale);

        if (dx >= frameLeft && dx < frameLeft + FRAME_W && dy >= 0 && dy < FRAME_H) {
          const dstIdx = (dy * sheetWidth + dx) * 4;
          outputData[dstIdx] = data[srcIdx];
          outputData[dstIdx + 1] = data[srcIdx + 1];
          outputData[dstIdx + 2] = data[srcIdx + 2];
          outputData[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }
  }

  await sharp(outputData, {
    raw: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
    },
  })
    .png()
    .toFile(outputFile);

  console.log(`  ✓ Saved ${outputFile} (${sheetWidth}x${sheetHeight})`);
}

processSoldierDying();
