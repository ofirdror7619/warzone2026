import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;
const ALPHA_THRESHOLD = 10;
const FULL_SHEET = "src/assets/hamas-2-sprites/hamas grenade full sprite.png";
const COLS = 4;
const UNIFIED_TARGET_HEIGHT = 232;
const GLOBAL_TARGET_MULTIPLIER = 1.08;
const THROW_TARGET_MULTIPLIER = 1.12;

const ROWS = [
  { label: "idle", rowIndex: 0, output: "src/assets/hamas-2-sprites/hamas2_idle_transparent.png", minW: 0.35, minH: 0.55, minArea: 0.3 },
  { label: "throw", rowIndex: 1, output: "src/assets/hamas-2-sprites/hamas2_throw_transparent.png", minW: 0.3, minH: 0.45, minArea: 0.22 },
  { label: "dying", rowIndex: 2, output: "src/assets/hamas-2-sprites/hamas2_dying_transparent.png", minW: 0.22, minH: 0.16, minArea: 0.08 },
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

    const isBackground = saturation(r, g, b) <= 95 && colorDistance(r, g, b) <= 195;
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

function keepLargestComponent(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let best = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  const anchorX = width * 0.5;
  const anchorY = height * 0.68;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start]) continue;
      visited[start] = 1;

      const startIdx = start * channels;
      if (data[startIdx + 3] <= ALPHA_THRESHOLD) continue;

      const stack = [[x, y]];
      const component = [];
      let sumX = 0;
      let sumY = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const p = cy * width + cx;
        const idx = p * channels;
        if (data[idx + 3] <= ALPHA_THRESHOLD) continue;

        component.push(p);
        sumX += cx;
        sumY += cy;

        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = ny * width + nx;
          if (visited[np]) continue;
          visited[np] = 1;
          stack.push([nx, ny]);
        }
      }

      if (component.length === 0) continue;
      const cx = sumX / component.length;
      const cy = sumY / component.length;
      const distancePenalty = Math.abs(cx - anchorX) * 1.2 + Math.abs(cy - anchorY) * 0.9;
      const score = component.length - distancePenalty;

      if (score > bestScore) {
        bestScore = score;
        best = component;
      }
    }
  }

  if (best.length === 0) return;

  const keep = new Uint8Array(width * height);
  for (const p of best) keep[p] = 1;

  for (let p = 0; p < keep.length; p++) {
    if (keep[p]) continue;
    const idx = p * channels;
    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 0;
  }
}

function getBBox(data, width, height, channels) {
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
    return null;
  }

  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function loadFullSheet() {
  const { data, info } = await sharp(FULL_SHEET)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, channels: info.channels };
}

function extractCell(full, col, row) {
  const rowHeight = Math.floor(full.height / 3);
  const y0 = row * rowHeight;
  const y1 = row === 2 ? full.height : (row + 1) * rowHeight;

  const colWidth = Math.floor(full.width / COLS);
  const x0 = col * colWidth;
  const x1 = col === COLS - 1 ? full.width : (col + 1) * colWidth;

  const w = x1 - x0;
  const h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y0 + y) * full.width + (x0 + x)) * full.channels;
      const dstIdx = (y * w + x) * 4;
      out[dstIdx] = full.data[srcIdx];
      out[dstIdx + 1] = full.data[srcIdx + 1];
      out[dstIdx + 2] = full.data[srcIdx + 2];
      out[dstIdx + 3] = full.data[srcIdx + 3];
    }
  }

  return { data: out, width: w, height: h, channels: 4 };
}

function placeFigure(outputData, sheetW, frame, fig) {
  const frameLeft = frame * FRAME_W;
  const figW = fig.render.w;
  const figH = fig.render.h;
  const scale = fig.scale;

  const scaledW = Math.max(1, Math.floor(figW * scale));
  const scaledH = Math.max(1, Math.floor(figH * scale));

  const offsetX = frameLeft + Math.floor((FRAME_W - scaledW) / 2);
  const offsetY = FRAME_H - scaledH - 4;

  for (let sy = fig.render.minY; sy <= fig.render.maxY; sy++) {
    for (let sx = fig.render.minX; sx <= fig.render.maxX; sx++) {
      const srcIdx = (sy * fig.width + sx) * fig.channels;
      if (fig.data[srcIdx + 3] <= ALPHA_THRESHOLD) continue;

      const dx = Math.floor(offsetX + (sx - fig.render.minX) * scale);
      const dy = Math.floor(offsetY + (sy - fig.render.minY) * scale);

      if (dx < frameLeft || dx >= frameLeft + FRAME_W || dy < 0 || dy >= FRAME_H) continue;

      const dstIdx = (dy * sheetW + dx) * 4;
      outputData[dstIdx] = fig.data[srcIdx];
      outputData[dstIdx + 1] = fig.data[srcIdx + 1];
      outputData[dstIdx + 2] = fig.data[srcIdx + 2];
      outputData[dstIdx + 3] = fig.data[srcIdx + 3];
    }
  }
}

async function processRow(full, rowDef, sharedTargetHeight = null) {
  const frames = [];

  for (let col = 0; col < COLS; col++) {
    const cell = extractCell(full, col, rowDef.rowIndex);
    clearBorderBackground(cell.data, cell.width, cell.height, cell.channels);
    keepLargestComponent(cell.data, cell.width, cell.height, cell.channels);

    const bbox = getBBox(cell.data, cell.width, cell.height, cell.channels);
    if (!bbox) continue;

    frames.push({ ...cell, bbox });
    console.log(`  ${rowDef.label} frame ${col + 1}: bbox (${bbox.minX},${bbox.minY})-(${bbox.maxX},${bbox.maxY})`);
  }

  if (frames.length === 0) {
    throw new Error(`No visible frames detected in ${rowDef.label} row`);
  }

  const maxW = Math.max(...frames.map((f) => f.bbox.w));
  const maxH = Math.max(...frames.map((f) => f.bbox.h));
  const maxArea = Math.max(...frames.map((f) => f.bbox.w * f.bbox.h));

  const filteredFrames = frames.filter((f) => {
    const area = f.bbox.w * f.bbox.h;
    return f.bbox.w >= maxW * rowDef.minW && f.bbox.h >= maxH * rowDef.minH && area >= maxArea * rowDef.minArea;
  });

  if (filteredFrames.length > 0 && filteredFrames.length < frames.length) {
    console.log(`  ${rowDef.label}: skipped ${frames.length - filteredFrames.length} dirt frame(s)`);
  }

  const usableFrames = filteredFrames.length > 0 ? filteredFrames : frames;
  const widths = usableFrames.map((f) => f.bbox.w).sort((a, b) => a - b);
  const heights = usableFrames.map((f) => f.bbox.h).sort((a, b) => a - b);
  const p75 = Math.max(0, Math.floor((usableFrames.length - 1) * 0.75));

  const canonicalW = rowDef.label === "throw" ? widths[p75] : widths[widths.length - 1];
  const canonicalH = heights[heights.length - 1];
  const canonicalScale = Math.min((FRAME_W - 8) / canonicalW, (FRAME_H - 6) / canonicalH, 1);
  const rowDefaultTargetHeight = Math.max(1, Math.floor(canonicalH * canonicalScale));
  const targetScaledHeight = sharedTargetHeight ?? rowDefaultTargetHeight;

  for (const frame of usableFrames) {
    const centerX = Math.round((frame.bbox.minX + frame.bbox.maxX) / 2);
    const bottomY = frame.bbox.maxY;

    const halfW = Math.floor(canonicalW / 2);
    let minX = Math.max(0, centerX - halfW);
    let maxX = Math.min(frame.width - 1, minX + canonicalW - 1);
    minX = Math.max(0, maxX - canonicalW + 1);

    let maxY = Math.min(frame.height - 1, bottomY);
    let minY = Math.max(0, maxY - canonicalH + 1);
    maxY = Math.min(frame.height - 1, minY + canonicalH - 1);

    frame.render = {
      minX,
      maxX,
      minY,
      maxY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
    };
    const desiredScale = targetScaledHeight / frame.render.h;
    const fitScale = Math.min((FRAME_W - 8) / frame.render.w, (FRAME_H - 6) / frame.render.h, 1);
    frame.scale = Math.min(desiredScale, fitScale);
  }

  const sheetW = FRAME_W * usableFrames.length;
  const outputData = Buffer.alloc(sheetW * FRAME_H * 4);

  for (let i = 0; i < usableFrames.length; i++) {
    placeFigure(outputData, sheetW, i, usableFrames[i]);
  }

  await sharp(outputData, {
    raw: { width: sheetW, height: FRAME_H, channels: 4 },
  })
    .png()
    .toFile(rowDef.output);

  console.log(`  ✓ Saved ${rowDef.output} (${sheetW}x${FRAME_H})`);

  return targetScaledHeight;
}

async function main() {
  console.log("Processing Hamas-2 full sprite sheet...");
  const full = await loadFullSheet();
  console.log(`  Full sheet: ${full.width}x${full.height}`);

  const dyingRow = ROWS.find((r) => r.label === "dying");
  const idleRow = ROWS.find((r) => r.label === "idle");
  const throwRow = ROWS.find((r) => r.label === "throw");

  if (!dyingRow || !idleRow || !throwRow) {
    throw new Error("Missing required rows (idle/throw/dying)");
  }

  const baseTargetHeight = Math.round(UNIFIED_TARGET_HEIGHT * GLOBAL_TARGET_MULTIPLIER);

  console.log(`\nProcessing ${dyingRow.label} row...`);
  const dyingTargetHeight = await processRow(full, dyingRow, baseTargetHeight);

  console.log(`\nProcessing ${idleRow.label} row...`);
  await processRow(full, idleRow, dyingTargetHeight);

  console.log(`\nProcessing ${throwRow.label} row...`);
  await processRow(full, throwRow, Math.round(dyingTargetHeight * THROW_TARGET_MULTIPLIER));

  console.log("\n✓ Hamas-2 sprites processed from full sheet");
}

main().catch((error) => {
  console.error("Failed to process Hamas-2 sprites:", error);
  process.exitCode = 1;
});
