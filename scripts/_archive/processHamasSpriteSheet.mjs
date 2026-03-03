import sharp from "sharp";

const FRAME_W = 256;
const FRAME_H = 256;

async function processSpriteSheet() {
  console.log("Processing hamas-sprite-sheet.png...");
  
  // Load the sprite sheet
  const { data, info } = await sharp("src/assets/hamas-sprite-sheet.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  console.log(`  Input: ${width}x${height}, channels: ${channels}`);
  
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
  
  console.log("  Transparency applied");
  
  // Calculate grid dimensions (assuming 256x256 frames in 2048x2048)
  const cols = Math.floor(width / FRAME_W);
  const rows = Math.floor(height / FRAME_H);
  console.log(`  Grid: ${cols}x${rows} frames`);
  
  // Extract idle frames (top row, frames 0-1)
  await extractFrames(data, width, height, channels, [
    { row: 0, col: 0 },
    { row: 0, col: 1 }
  ], "src/assets/hamas_idle_sheet.png", "Idle");
  
  // Extract firing frames (top row frames 4-7, or adjust based on actual layout)
  await extractFrames(data, width, height, channels, [
    { row: 0, col: 4 },
    { row: 0, col: 5 },
    { row: 0, col: 6 },
    { row: 0, col: 7 }
  ], "src/assets/hamas_firing_sheet.png", "Firing");
  
  console.log("\n✓ Sprite sheet processed!");
}

async function extractFrames(data, width, height, channels, positions, outputFile, label) {
  const frameCount = positions.length;
  const outputWidth = frameCount * FRAME_W;
  const outputHeight = FRAME_H;
  const outputData = Buffer.alloc(outputWidth * outputHeight * 4);
  
  console.log(`\n  Extracting ${label} (${frameCount} frames)...`);
  
  for (let i = 0; i < positions.length; i++) {
    const { row, col } = positions[i];
    const srcX = col * FRAME_W;
    const srcY = row * FRAME_H;
    const dstX = i * FRAME_W;
    
    console.log(`    Frame ${i}: grid(${row},${col}) -> offset ${dstX}`);
    
    // Copy frame
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const srcIdx = ((srcY + y) * width + (srcX + x)) * channels;
        const dstIdx = (y * outputWidth + (dstX + x)) * 4;
        
        outputData[dstIdx] = data[srcIdx];
        outputData[dstIdx + 1] = data[srcIdx + 1];
        outputData[dstIdx + 2] = data[srcIdx + 2];
        outputData[dstIdx + 3] = data[srcIdx + 3];
      }
    }
  }
  
  await sharp(outputData, {
    raw: {
      width: outputWidth,
      height: outputHeight,
      channels: 4
    }
  })
  .png()
  .toFile(outputFile);
  
  console.log(`  ✓ Saved ${outputFile} (${outputWidth}x${outputHeight})`);
}

processSpriteSheet();
