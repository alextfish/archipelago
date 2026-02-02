# Browser MCP Testing Guide

## Test Setup Complete ✅

The test marker system and automated test infrastructure are now fully integrated and ready for browser automation testing.

## What Was Added

### 1. Test Marker System (`src/helpers/TestMarkers.ts`)
- Creates transparent DOM elements positioned over Phaser game objects
- Syncs position every frame to follow game objects
- Forwards pointer events to Phaser (down, move, up with dragging support)
- Enables browser automation tools to interact with game elements
- Only active in test mode

### 2. Test Event System (`src/helpers/TestEvents.ts`)
- Emits generic game events to `window.__GAME_EVENTS__` array
- Events include: `conversation_started`, `conversation_ended`, etc.
- Enables test scripts to wait for specific game state changes
- Zero overhead in production (only active in test mode)
- Events are generic and reusable across multiple test scripts

### 3. Test Mode Entry Point (`public/test.html`)
- Sets `window.__TEST_MODE__ = true` before game loads
- Shows "TEST MODE" indicator in top-right corner
- Loads game with test markers and events enabled

### 4. Automated Test Script (`test-browser.mjs`)
- Playwright-based browser automation
- **Combination timeout strategy**:
  * Maximum duration timeout (60s) - safety net
  * Idle detection timeout (10s) - closes when stuck
  * Event-based completion - closes on `conversation_ended`
- Automatically closes browser on success or failure
- Exit codes: 0 = success, 1 = timeout/failure

### 5. Test Markers Added
- **Player sprite**: ID `player`, testID `player` (32x32 pixels)
- **NPCs**: ID `npc-{npcId}`, testID `npc-{npcId}` (dynamic size based on sprite)

### 6. Test Events Emitted
- `conversation_started` - When NPC conversation begins
  * Data: `{ conversationId, npcId, npcName }`
- `conversation_ended` - When conversation completes
  * Data: `{ conversationId, npcId, completed }`

## Manual Testing Steps

### 1. Start the Dev Server
```powershell
npm run dev
```
Server should start on http://localhost:5174/

### 2. Open Test Mode in Browser
Navigate to: http://localhost:5174/test.html

### 3. Verify Test Mode Active
**In Browser Console** (F12):
- Should see: "TEST MODE" indicator in top-right (red badge)
- Should see console logs: `[TEST] Added test marker for player at (x, y)`
- Should see console logs: `[TEST] Added test marker for NPC: ... at tile (...)`

### 4. Verify Markers Visible
**Visual Check**:
- Red dashed boxes should appear over the player character
- Red dashed boxes should appear over each NPC
- Boxes should move with the characters

**If not visible**: Check browser console for errors

### 5. Test Marker Interaction
**Click NPC Marker**:
1. Click on a red dashed box over an NPC
2. Player should start walking toward that NPC (tap-to-move)
3. Wait for player to reach NPC
4. Press **E** key
5. Should enter conversation mode

**Expected Console Logs**:
- "PlayerController: Setting target position to..."
- "PlayerController: Player reached target"
- Conversation-related logs

## Browser MCP Integration

### Using VS Code Browser MCP

The `.vscode/mcp.json` is configured with browsermcp. To use it:

1. **Open Browser via MCP**:
   - Browser MCP should connect to Chrome
   - Navigate to http://localhost:5174/test.html

2. **Interact with Test Markers**:
   ```javascript
   // Find NPC marker
   const npcMarker = document.querySelector('[data-testid^="npc-"]');
   
   // Click to trigger tap-to-move
   npcMarker.click();
   
   // After player reaches NPC, press E
   // (Browser MCP can simulate keyboard events)
   ```

3. **Read Console Logs**:
   - Browser MCP can capture console.log output
   - Verify game state transitions
   - Confirm player movement and interaction

## Test Marker API

### Attaching Markers

```typescript
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';

// Only in test mode
if (isTestMode()) {
  // Attach to a Phaser sprite
  attachTestMarker(scene, sprite, {
    id: 'unique-id',
    testId: 'test-id-for-automation',
    width: 32,
    height: 32,
    showBorder: true  // Optional red dashed border
  });
  
  // Attach to tile coordinates
  attachTestMarkerToTile(scene, tileX, tileY, {
    id: 'tile-marker',
    testId: 'tile-1234',
    width: 16,
    height: 16
  });
}
```

### Finding Markers in Browser

```javascript
// Find by test ID
const marker = document.querySelector('[data-testid="player"]');

// Find all NPC markers
const npcMarkers = document.querySelectorAll('[data-testid^="npc-"]');

// Get marker info
const testId = marker.getAttribute('data-testid');
const markerId = marker.id;
```

## Next Steps

### Add More Test Markers

Consider adding markers to:
- **Puzzle entry points**: Clickable areas to enter bridge puzzles
- **UI buttons**: HUD elements, menu buttons
- **Interactive objects**: Chests, doors, etc.
- **Puzzle islands**: Individual islands in bridge puzzles

### Example: Add Puzzle Entry Marker

```typescript
// In OverworldScene where puzzles are created
if (isTestMode()) {
  const puzzleEntryZone = this.add.zone(tileX * 16, tileY * 16, 32, 32);
  attachTestMarker(this, puzzleEntryZone, {
    id: `puzzle-entry-${puzzleId}`,
    testId: `puzzle-entry-${puzzleId}`,
    width: 32,
    height: 32,
    showBorder: true
  });
}
```

## Troubleshooting

### Markers Not Visible
1. Check browser console for `[TEST]` logs
2. Verify `window.__TEST_MODE__` is true in console
3. Verify red "TEST MODE" indicator is visible
4. Check for JavaScript errors in console

### Markers Not Clickable
1. Verify marker has `pointer-events: auto` in dev tools
2. Check z-index (should be 1000)
3. Verify marker is positioned correctly over game object

### Position Sync Issues
1. Markers update every frame via 'postupdate' event
2. Check camera scroll/zoom calculations
3. Verify canvas offset is correct

## Automated Testing with Playwright

A test script is available at `test-browser.mjs`. To run:

```powershell
# Make sure dev server is running
npm run dev

# In another terminal
node test-browser.mjs
```

The script will:
1. Open test.html in Chromium
2. Wait for game to load
3. Find NPC markers
4. Click first NPC to trigger tap-to-move
5. Press E to interact
6. Capture console logs
7. Keep browser open for inspection

## Success Criteria

✅ Test mode loads without errors
✅ Test markers visible over game objects
✅ Markers sync position with camera movement
✅ Clicking markers triggers game interaction
✅ Console logs confirm test mode active
✅ Browser automation can interact with markers

## Architecture Notes

- **Pure game logic**: Still in `model/` (unchanged)
- **Test markers**: View layer concern (DOM manipulation)
- **Test mode detection**: Helper utility
- **No production impact**: Test mode only active when explicitly enabled

The test marker system maintains architectural separation while enabling automated browser testing.
