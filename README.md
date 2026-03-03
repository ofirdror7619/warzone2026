# Warzone2026 Sprite Pipeline Guide

This file documents what is currently **active** versus **archived** after cleanup.

## Active runtime assets
The game currently loads these files in `src/scenes/gameScene.ts`:

- `src/assets/sprites/soldier_idle_walk_fire_jump_combined.png`
- `src/assets/sprites/soldier_dying_transparent.png`
- `src/assets/sprites/soldier_duck_transparent.png`
- `src/assets/sprites/hamas_idle_transparent.png`
- `src/assets/sprites/hamas_firing_transparent.png`
- `src/assets/sprites/hamas_running_transparent.png`
- `src/assets/sprites/hamas_dying_transparent.png`

## Active source art inputs
These are the source files we currently keep for re-processing:

- `src/assets/sprites/duck - 1 figure.png`
- `src/assets/sprites/dying - 7 figures.png`
- `src/assets/sprites/jumping - 5 figures.png`
- `src/assets/sprites/hamas idle - 2 figures.png`
- `src/assets/sprites/hamas firing - 4 figures.png`
- `src/assets/sprites/hamas running - 8 figures.png`
- `src/assets/sprites/hamas dying - figure #1.png`
- `src/assets/sprites/hamas dying - figure #2.png`
- `src/assets/sprites/hamas dying - figure #3.png`
- `src/assets/sprites/hamas dying - figure #4.png`
- `src/assets/sprites/hamas dying - figure #5.png`

## Active processing scripts
These scripts are part of the current sprite workflow:

- `scripts/processSoldierDuck.mjs`
- `scripts/processSoldierDying.mjs`
- `scripts/integrateJumpRow.mjs`
- `scripts/processHamasSprites.mjs`
- `scripts/processHamasDying.mjs`

## Archived files (safe storage)
Old/experimental files were moved, not deleted:

- Scripts archive: `scripts/_archive/`
- Assets archive: `src/assets/_archive/`

You can restore any file by moving it back from the archive folder.

## Typical regeneration flow
Run only what you changed:

- Hamas dying sheet:
  - `node scripts/processHamasDying.mjs`
- Hamas idle/firing/running sheets:
  - `node scripts/processHamasSprites.mjs`
- Soldier duck:
  - `node scripts/processSoldierDuck.mjs`
- Soldier dying:
  - `node scripts/processSoldierDying.mjs`
- Soldier combined idle/walk/fire/jump:
  - `node scripts/integrateJumpRow.mjs`

Then verify:

- `npm run build`

## Notes
- Press `R` in-game to restart scene quickly while tuning sprites.
- If cleanup ever feels risky, move files into `_archive` first instead of deleting.
