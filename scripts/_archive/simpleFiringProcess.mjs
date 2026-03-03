import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;

async function processFiringOnly() {
  console.log("Processing hamas firing sprite...");
  
  const inputFile = "src/assets/hamas firing - 4 figures.png";
  const outputFile = "src/assets/hamas_firing_transparent.png";
  const frameCount = 4;
  
  // Load image
  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}`);
  
  // Make background transparent - more aggressive
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Remove light backgrounds and grays
    const isBackground = (
      (r > 180 && g > 180 && b > 180) ||
      (r > 150 && g > 150 && b > 150 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30)
    );
    
    if (isBackground) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  
  // Noise removal: remove small isolated pixel groups (artifacts)
  console.log("  Removing noise...");
  const minClusterSize = 50; // pixels - anything smaller is noise
  const visited = new Set();
  
  function floodFill(startX, startY) {
    const stack = [[startX, startY]];
    const cluster = [];
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      
      if (alpha <= 10) continue;
      
      visited.add(key);
      cluster.push([x, y, idx]);
      
      // Check 8 neighbors
      stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
      stack.push([x+1, y+1], [x-1, y-1], [x+1, y-1], [x-1, y+1]);
    }
    
    return cluster;
  }
  
  // Find all clusters and remove small ones
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3];
      
      if (alpha > 10) {
        const cluster = floodFill(x, y);
        
        if (cluster.length < minClusterSize) {
          // Remove this noise cluster
          for (const [cx, cy, cidx] of cluster) {
            data[cidx] = 0;
            data[cidx + 1] = 0;
            data[cidx + 2] = 0;
            data[cidx + 3] = 0;
          }
        }
      }
    }
  }
  
  // Find center of mass for each figure to properly separate them
  const figureWidth = Math.floor(width / frameCount);
  
  // First pass: find centers of mass
  const centerPositions = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const searchStart = Math.floor(frame * figureWidth);
    const searchEnd = Math.min(width, Math.floor((frame + 1) * figureWidth));
    
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
    
    const centerX = totalMass > 0 ? weightedX / totalMass : (searchStart + searchEnd) / 2;
    centerPositions.push(centerX);
  }
  
  console.log(`  Figure centers: ${centerPositions.map(c => Math.floor(c)).join(', ')}`);
  
  // Second pass: extract figures using midpoints between centers as boundaries
  // Add generous overlap padding to capture muzzle flash and other effects
  const overlapPadding = 60; // pixels of overlap on each side
  
  const figures = [];
  for (let frame = 0; frame < frameCount; frame++) {
    let searchStart, searchEnd;
    
    if (frame === 0) {
      searchStart = 0;
      searchEnd = Math.floor((centerPositions[0] + centerPositions[1]) / 2) + overlapPadding;
    } else if (frame === frameCount - 1) {
      searchStart = Math.max(0, Math.floor((centerPositions[frame - 1] + centerPositions[frame]) / 2) - overlapPadding);
      searchEnd = width;
    } else {
      searchStart = Math.max(0, Math.floor((centerPositions[frame - 1] + centerPositions[frame]) / 2) - overlapPadding);
      searchEnd = Math.min(width, Math.floor((centerPositions[frame] + centerPositions[frame + 1]) / 2) + overlapPadding);
    }
    
    let minX = width, maxX = -1, minY = height, maxY = -1;
    
    for (let y = 0; y < height; y++) {
      for (let x = searchStart; x < searchEnd; x++) {
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
      console.log(`  Frame ${frame}: region=${searchStart}-${searchEnd}, bbox=(${minX},${minY}) to (${maxX},${maxY}), size=${figWidth}x${figHeight}`);
      
      figures.push({ minX, maxX, minY, maxY, figWidth, figHeight });
    }
  }
  
  let maxFigWidth = 0;
  let maxFigHeight = 0;
  for (const fig of figures) {
    if (fig.figWidth > maxFigWidth) maxFigWidth = fig.figWidth;
    if (fig.figHeight > maxFigHeight) maxFigHeight = fig.figHeight;
  }
  
  console.log(`  Max figure dimensions: ${maxFigWidth}x${maxFigHeight}`);
  
  // Create output
  const sheetWidth = frameCount * FRAME_W;
  const sheetHeight = FRAME_H;
  const outputData = Buffer.alloc(sheetWidth * sheetHeight * 4);
  
  const scale = Math.min(
    (FRAME_W - 15) / maxFigWidth,
    (FRAME_H - 15) / maxFigHeight,
    1.0
  );
  
  const scaledMaxHeight = Math.floor(maxFigHeight * scale);
  
  // Place figures - simple centered, bottom-aligned
  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    
    const thisFigScaledWidth = Math.floor(fig.figWidth * scale);
    const thisFigScaledHeight = Math.floor(fig.figHeight * scale);
    
    // Center horizontally
    const frameLeft = i * FRAME_W;
    const offsetX = frameLeft + Math.floor((FRAME_W - thisFigScaledWidth) / 2);
    
    // Bottom align all to same Y
    const offsetY = FRAME_H - scaledMaxHeight - 10 + (scaledMaxHeight - thisFigScaledHeight);
    
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
  
  // Cleanup pass: keep only the largest connected component in each frame
  console.log("  Cleaning up stray artifacts...");
  
  function floodFillOutput(startX, startY, frameIdx) {
    const frameLeft = frameIdx * FRAME_W;
    const frameRight = frameLeft + FRAME_W;
    const stack = [[startX, startY]];
    const component = [];
    const visited = new Set();
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < frameLeft || x >= frameRight || y < 0 || y >= sheetHeight) continue;
      
      const idx = (y * sheetWidth + x) * 4;
      const alpha = outputData[idx + 3];
      
      if (alpha <= 10) continue;
      
      visited.add(key);
      component.push([x, y, idx]);
      
      // Check 8 neighbors
      stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
      stack.push([x+1, y+1], [x-1, y-1], [x+1, y-1], [x-1, y+1]);
    }
    
    return component;
  }
  
  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const frameLeft = frameIdx * FRAME_W;
    const frameRight = frameLeft + FRAME_W;
    
    // Find all connected components in this frame
    const visited = new Set();
    const components = [];
    
    for (let y = 0; y < sheetHeight; y++) {
      for (let x = frameLeft; x < frameRight; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        
        const idx = (y * sheetWidth + x) * 4;
        const alpha = outputData[idx + 3];
        
        if (alpha > 10) {
          const component = floodFillOutput(x, y, frameIdx);
          if (component.length > 0) {
            components.push(component);
            for (const [cx, cy] of component) {
              visited.add(`${cx},${cy}`);
            }
          }
        }
      }
    }
    
    // Keep only the largest component
    if (components.length > 1) {
      components.sort((a, b) => b.length - a.length);
      const largest = components[0];
      const largestSet = new Set(largest.map(([x, y]) => `${x},${y}`));
      
      // Remove all other components
      for (let i = 1; i < components.length; i++) {
        for (const [x, y, idx] of components[i]) {
          outputData[idx] = 0;
          outputData[idx + 1] = 0;
          outputData[idx + 2] = 0;
          outputData[idx + 3] = 0;
        }
      }
      
      console.log(`  Frame ${frameIdx}: Kept largest component (${largest.length} pixels), removed ${components.length - 1} smaller components`);
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

processFiringOnly();
