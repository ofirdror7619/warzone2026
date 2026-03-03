import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;

async function refineFiringSprite() {
  console.log("Refining hamas firing sprite...");
  
  const inputFile = "src/assets/hamas firing - 4 figures.png";
  const outputFile = "src/assets/hamas_firing_transparent.png";
  const frameCount = 4;
  
  // Load and process
  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);
  
  // Make background transparent - very aggressive
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
  
  // Estimate figure positions with larger padding
  const figureWidth = Math.floor(width / frameCount);
  const padding = 20; // More aggressive padding
  
  const regions = [];
  for (let i = 0; i < frameCount; i++) {
    const center = Math.floor((i + 0.5) * figureWidth);
    const start = Math.max(0, center - figureWidth / 2 + padding);
    const end = Math.min(width, center + figureWidth / 2 - padding);
    regions.push([start, end]);
  }
  
  // Extract figures with their center of mass
  const figures = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const [regionStart, regionEnd] = regions[frame];
    
    let minX = width, maxX = -1, minY = height, maxY = -1;
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    
    // Find bounding box and center of mass
    for (let y = 0; y < height; y++) {
      for (let x = regionStart; x < regionEnd; x++) {
        const idx = (y * width + x) * channels;
        const alpha = data[idx + 3];
        
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          totalMass += alpha;
          weightedX += x * alpha;
          weightedY += y * alpha;
        }
      }
    }
    
    if (totalMass > 0) {
      const centerX = weightedX / totalMass;
      const centerY = weightedY / totalMass;
      const figWidth = maxX - minX + 1;
      const figHeight = maxY - minY + 1;
      
      console.log(`  Frame ${frame}: bbox=${figWidth}x${figHeight}, center=(${centerX.toFixed(0)},${centerY.toFixed(0)})`);
      
      figures.push({ 
        minX, maxX, minY, maxY, 
        figWidth, figHeight,
        centerX: centerX - minX, // center relative to bbox
        centerY: centerY - minY
      });
    }
  }
  
  // Find max dimensions
  let maxFigWidth = 0;
  let maxFigHeight = 0;
  for (const fig of figures) {
    if (fig.figWidth > maxFigWidth) maxFigWidth = fig.figWidth;
    if (fig.figHeight > maxFigHeight) maxFigHeight = fig.figHeight;
  }
  
  // Calculate average center position (for consistent alignment)
  const avgCenterXRatio = figures.reduce((sum, fig) => sum + fig.centerX / fig.figWidth, 0) / figures.length;
  const avgCenterYRatio = figures.reduce((sum, fig) => sum + fig.centerY / fig.figHeight, 0) / figures.length;
  
  console.log(`  Max dimensions: ${maxFigWidth}x${maxFigHeight}`);
  console.log(`  Avg center ratio: X=${avgCenterXRatio.toFixed(2)}, Y=${avgCenterYRatio.toFixed(2)}`);
  
  // Create output
  const sheetWidth = frameCount * FRAME_W;
  const sheetHeight = FRAME_H;
  const outputData = Buffer.alloc(sheetWidth * sheetHeight * 4);
  
  const scale = Math.min(
    (FRAME_W - 20) / maxFigWidth,
    (FRAME_H - 20) / maxFigHeight,
    1.0
  );
  
  const scaledMaxWidth = Math.floor(maxFigWidth * scale);
  const scaledMaxHeight = Math.floor(maxFigHeight * scale);
  
  // Place figures aligned by their center of mass
  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    
    const thisFigScaledWidth = Math.floor(fig.figWidth * scale);
    const thisFigScaledHeight = Math.floor(fig.figHeight * scale);
    
    // Calculate where this figure's center should be in the output frame
    const frameLeft = i * FRAME_W;
    const targetCenterX = frameLeft + FRAME_W / 2;
    const targetCenterY = FRAME_H - (FRAME_H - scaledMaxHeight) / 2 - scaledMaxHeight * (1 - avgCenterYRatio);
    
    // Position figure so its center of mass aligns with target
    const figCenterScaledX = fig.centerX * scale;
    const figCenterScaledY = fig.centerY * scale;
    
    const offsetX = Math.floor(targetCenterX - figCenterScaledX);
    const offsetY = Math.floor(targetCenterY - figCenterScaledY);
    
    // Copy pixels
    for (let sy = fig.minY; sy <= fig.maxY; sy++) {
      for (let sx = fig.minX; sx <= fig.maxX; sx++) {
        const srcIdx = (sy * width + sx) * channels;
        const alpha = data[srcIdx + 3];
        
        if (alpha > 10) {
          const localX = sx - fig.minX;
          const localY = sy - fig.minY;
          
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
  
  console.log(`  ✓ Saved ${outputFile}`);
}

refineFiringSprite();
