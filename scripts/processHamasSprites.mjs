import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;

// Process all hamas sprite files
const files = [
  { input: "src/assets/hamas idle - 2 figures.png", output: "src/assets/hamas_idle_transparent.png", frames: 2 },
  { input: "src/assets/hamas firing - 4 figures.png", output: "src/assets/hamas_firing_transparent.png", frames: 4 },
  { input: "src/assets/hamas running - 8 figures.png", output: "src/assets/hamas_running_transparent.png", frames: 8 },
  { input: "src/assets/hamas dying - 5 figures.png", output: "src/assets/hamas_dying_transparent.png", frames: 5 },
];

async function processSprite(inputFile, outputFile, frameCount) {
  console.log(`Processing ${inputFile}...`);
  
  // Load and make background transparent
  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);
  
  // Make background transparent - very aggressive threshold
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Remove any light/white/gray background - VERY aggressive
    const isBackground = (
      (r > 170 && g > 170 && b > 170) || // Light colors
      (r > 140 && g > 140 && b > 140 && Math.abs(r - g) < 40 && Math.abs(g - b) < 40) // Gray tones
    );
    
    if (isBackground) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0; // Set alpha to 0 (fully transparent)
    }
  }
  
  // Estimate figure width
  const figureWidth = Math.floor(width / frameCount);
  console.log(`  Estimated figure width: ${figureWidth}`);
  
  // Find horizontal mass centers for each figure
  const regionCenters = [];
  for (let i = 0; i < frameCount; i++) {
    const estimatedCenter = Math.floor((i + 0.5) * figureWidth);
    const searchStart = Math.max(0, estimatedCenter - figureWidth / 2);
    const searchEnd = Math.min(width, estimatedCenter + figureWidth / 2);
    
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
    
    if (totalMass > 0) {
      const centerX = Math.floor(weightedX / totalMass);
      regionCenters.push(centerX);
    } else {
      regionCenters.push(estimatedCenter);
    }
  }
  
  console.log(`  Figure centers: ${regionCenters.join(', ')}`);
  
  // Define regions with padding to avoid overlap
  const regions = [];
  const padding = 5; // Add padding to avoid bleeding between figures
  
  for (let i = 0; i < frameCount; i++) {
    let start, end;
    
    if (i === 0) {
      start = 0;
      end = Math.floor((regionCenters[0] + regionCenters[1]) / 2) - padding;
    } else if (i === frameCount - 1) {
      start = Math.floor((regionCenters[i - 1] + regionCenters[i]) / 2) + padding;
      end = width;
    } else {
      start = Math.floor((regionCenters[i - 1] + regionCenters[i]) / 2) + padding;
      end = Math.floor((regionCenters[i] + regionCenters[i + 1]) / 2) - padding;
    }
    
    regions.push([start, end]);
  }
  
  // Extract each figure and find its bounding box
  const figures = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const [regionStartX, regionEndX] = regions[frame];
    
    let minX = width, maxX = -1, minY = height, maxY = -1;
    
    // Find bounding box for this figure within its region
    for (let y = 0; y < height; y++) {
      for (let x = regionStartX; x < regionEndX; x++) {
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
    
    if (maxX >= minX && maxY >= minY) {
      const figWidth = maxX - minX + 1;
      const figHeight = maxY - minY + 1;
      console.log(`  Frame ${frame}: region=(${regionStartX}-${regionEndX}), bbox=(${minX},${minY}) to (${maxX},${maxY}), size=${figWidth}x${figHeight}`);
      
      figures.push({ minX, maxX, minY, maxY, figWidth, figHeight });
    }
  }
  
  // Find the maximum dimensions across all figures
  let maxFigWidth = 0;
  let maxFigHeight = 0;
  
  for (const fig of figures) {
    if (fig.figWidth > maxFigWidth) maxFigWidth = fig.figWidth;
    if (fig.figHeight > maxFigHeight) maxFigHeight = fig.figHeight;
  }
  
  console.log(`  Max figure dimensions: ${maxFigWidth}x${maxFigHeight}`);
  
  // Create new sprite sheet
  const cols = Math.min(frameCount, 8);
  const rows = Math.ceil(frameCount / 8);
  const sheetWidth = cols * FRAME_W;
  const sheetHeight = rows * FRAME_H;
  
  const outputData = Buffer.alloc(sheetWidth * sheetHeight * 4);
  
  // Calculate scale based on MAX dimensions to keep all figures same size
  // Use more conservative padding to avoid cutoff
  const scale = Math.min(
    (FRAME_W - 10) / maxFigWidth,
    (FRAME_H - 10) / maxFigHeight,
    1.0
  );
  
  const scaledMaxWidth = Math.floor(maxFigWidth * scale);
  const scaledMaxHeight = Math.floor(maxFigHeight * scale);
  
  // Place each figure aligned by the same absolute ground position
  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    const col = i % 8;
    const row = Math.floor(i / 8);
    
    const thisFigScaledWidth = Math.floor(fig.figWidth * scale);
    const thisFigScaledHeight = Math.floor(fig.figHeight * scale);
    
    // All figures centered horizontally in frame
    const frameLeft = col * FRAME_W;
    const frameCenterX = frameLeft + FRAME_W / 2;
    const offsetX = Math.floor(frameCenterX - thisFigScaledWidth / 2);
    
    // Reserve vertical space for max-height figure, centered in frame
    const topOfReservedSpace = row * FRAME_H + Math.floor((FRAME_H - scaledMaxHeight) / 2);
    
    // Place this figure so its bottom aligns with bottom of reserved space
    // (all figures' feet at same Y position)
    const offsetY = topOfReservedSpace + (scaledMaxHeight - thisFigScaledHeight);
    for (let sy = fig.minY; sy <= fig.maxY; sy++) {
      for (let sx = fig.minX; sx <= fig.maxX; sx++) {
        const srcIdx = (sy * width + sx) * channels;
        const alpha = data[srcIdx + 3];
        
        if (alpha > 10) {
          const localX = sx - fig.minX;
          const localY = sy - fig.minY;
          
          const dx = Math.floor(offsetX + localX * scale);
          const dy = Math.floor(offsetY + localY * scale);
          
          if (dx >= 0 && dx < sheetWidth && dy >= 0 && dy < sheetHeight) {
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

async function main() {
  for (const { input, output, frames } of files) {
    try {
      await processSprite(input, output, frames);
    } catch (error) {
      console.error(`Error processing ${input}:`, error.message);
    }
  }
  console.log("\n✓ All Hamas sprites processed!");
}

main();
