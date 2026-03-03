import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;

async function extractFigure2() {
  console.log("Extracting figure 1 from hamas idle sprite...");
  
  const inputFile = "src/assets/hamas idle - 2 figures.png";
  const outputFile = "src/assets/hamas_idle_transparent.png";
  
  // Load image
  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);
  
  // Make background transparent
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const isBackground = (
      (r > 170 && g > 170 && b > 170) ||
      (r > 140 && g > 140 && b > 140 && Math.abs(r - g) < 40 && Math.abs(g - b) < 40)
    );
    
    if (isBackground) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  
  // Find center of mass for each figure
  const halfWidth = Math.floor(width / 2);
  
  // Figure 1 is in the left half
  const searchStart = 0;
  const searchEnd = halfWidth;
  
  let totalMass = 0;
  let weightedX = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = searchStart; x < searchEnd; x++) {
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      if (alpha > 10) {
        totalMass += alpha;
        weightedX += x * alpha;
      }
    }
  }
  
  const centerX = Math.floor(weightedX / totalMass);
  console.log(`  Figure 1 center: ${centerX}`);
  
  // Extract just figure 1 - use generous boundaries
  const extractStart = 0;
  const extractEnd = Math.min(halfWidth + 20, width);
  
  let minX = width, maxX = -1, minY = height, maxY = -1;
  
  for (let y = 0; y < height; y++) {
    for (let x = extractStart; x < extractEnd; x++) {
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  const figWidth = maxX - minX + 1;
  const figHeight = maxY - minY + 1;
  console.log(`  Figure 1: bbox=(${minX},${minY}) to (${maxX},${maxY}), size=${figWidth}x${figHeight}`);
  
  // Create output with 2 identical frames (for animation compatibility)
  const sheetWidth = 2 * FRAME_W;
  const sheetHeight = FRAME_H;
  const outputData = Buffer.alloc(sheetWidth * sheetHeight * 4);
  
  const scale = Math.min(
    (FRAME_W - 10) / figWidth,
    (FRAME_H - 10) / figHeight,
    1.0
  );
  
  const scaledWidth = Math.floor(figWidth * scale);
  const scaledHeight = Math.floor(figHeight * scale);
  
  // Place the same figure in both frames
  for (let frameIdx = 0; frameIdx < 2; frameIdx++) {
    const frameLeft = frameIdx * FRAME_W;
    const offsetX = frameLeft + Math.floor((FRAME_W - scaledWidth) / 2);
    const offsetY = FRAME_H - scaledHeight - 10;
    
    for (let sy = minY; sy <= maxY; sy++) {
      for (let sx = minX; sx <= maxX; sx++) {
        const srcIdx = (sy * width + sx) * channels;
        const alpha = data[srcIdx + 3];
        
        if (alpha > 10) {
          const localX = sx - minX;
          const localY = sy - minY;
          
          const dx = Math.floor(offsetX + localX * scale);
          const dy = Math.floor(offsetY + localY * scale);
          
          if (dx >= frameLeft && dx < frameLeft + FRAME_W && dy >= 0 && dy < sheetHeight) {
            const dstIdx = (dy * sheetWidth + dx) * 4;
            outputData[dstIdx] = data[srcIdx];
            outputData[dstIdx + 1] = data[srcIdx + 1];
            outputData[dstIdx + 2] = data[srcIdx + 2];
            outputData[dstIdx + 3] = data[srcIdx + 3];
          }
        }
      }
    }
  }
  
  await sharp(outputData, {
    raw: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4
    }
  })
  .png()
  .toFile(outputFile);
  
  console.log(`  ✓ Saved ${outputFile} (${sheetWidth}x${sheetHeight})`);
}

extractFigure2();
