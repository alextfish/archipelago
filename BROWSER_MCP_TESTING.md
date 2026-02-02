# Browser MCP Testing Guide

## Test Setup Complete ✅

The test marker system and automated test infrastructure are now fully integrated and ready for browser automation testing.

## What Was Added

### 1. Test Marker System (`src/helpers/TestMarkers.ts`)
- Creates transparent DOM elements positioned over Phaser game objects
- Syncs position every frame to follow game objects
- **Direct callback invocation**: For UI elements (conversation buttons), calls custom `onClick` handlers directly
- **Event forwarding**: For world objects (NPCs, player), forwards pointer events to Phaser input system
- Enables browser automation tools to interact with both world and UI elements
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
- **Tests full conversation flow**: Player movement → NPC interaction → conversation choices → conversation end
- **Combination timeout strategy**:
  * Maximum duration timeout (60s) - safety net
  * Idle detection timeout (10s) - closes when stuck
  * Event-based completion - closes on `conversation_ended`
- Automatically closes browser on success or failure
- Exit codes: 0 = success, 1 = timeout/failure

### 5. Test Markers Added
- **Player sprite**: ID `player`, testID `player` (32x32 pixels)
- **NPCs**: ID `npc-{npcId}`, testID `npc-{npcId}` (dynamic size based on sprite)
- **Conversation choice buttons**: ID `choice-{index}-{normalized-text}`, testID `choice-{normalized-text}`
  * Example: "OK" button → testID `choice-ok`
  * Example: "I don't understand" → testID `choice-i-don-t-understand`
- **Leave button**: ID `choice-leave`, testID `choice-leave` (shown when conversation ends)

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

### 6. Test Conversation Buttons
**In Conversation Mode**:
1. After entering conversation, choice button markers should appear
2. Red dashed boxes should appear over each choice button
3. Click on a choice button marker (e.g., "OK" button with testID `choice-ok`)
4. Conversation should advance to the next node
5. Click "[Leave]" button marker (testID `choice-leave`) to end conversation

**Expected Console Logs**:
- `[TEST] Added test marker for choice: "OK" (choice-ok)`
- `[TEST MARKER] Calling custom onClick handler`
- `[TEST EVENT] conversation_ended { conversationId, npcId, completed }`
- Conversation markers are automatically removed when conversation ends

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
   
   // In conversation, find and click choice buttons
   const okButton = document.querySelector('[data-testid="choice-ok"]');
   okButton.click();
   
   // Click leave button to exit
   const leaveButton = document.querySelector('[data-testid="choice-leave"]');
   leaveButton.click();
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
  // Attach to a Phaser sprite (event forwarding)
  attachTestMarker(scene, sprite, {
    id: 'unique-id',
    testId: 'test-id-for-automation',
    width: 32,
    height: 32,
    showBorder: true  // Optional red dashed border
  });
  
  // Attach with custom onClick callback (direct invocation)
  attachTestMarker(scene, button, {
    id: 'button-marker',
    testId: 'button-test-id',
    width: 200,
    height: 60,
    showBorder: true,
    onClick: () => this.handleButtonClick()  // Called directly on click
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

// Find conversation choice buttons
const okButton = document.querySelector('[data-testid="choice-ok"]');
const leaveButton = document.querySelector('[data-testid="choice-leave"]');

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
3. Find and click NPC marker to trigger tap-to-move
4. Wait for player movement (with timeout)
5. Press E key to start conversation
6. Wait for `conversation_started` event
7. **Click "OK" conversation choice button**
8. Wait for conversation to advance
9. **Click "[Leave]" button to end conversation**
10. Wait for `conversation_ended` event
11. Close browser automatically
12. Exit with code 0 (success) or 1 (failure/timeout)

**Test Duration**: ~10-15 seconds for full conversation flow

**Console Output**: Shows all browser console logs prefixed with `[BROWSER]`

## Success Criteria

✅ Test mode loads without errors
✅ Test markers visible over game objects (player, NPCs, conversation buttons)
✅ Markers sync position with camera movement
✅ Clicking NPC markers triggers tap-to-move
✅ Clicking conversation choice buttons advances conversation
✅ Conversation events (`conversation_started`, `conversation_ended`) emit correctly
✅ Console logs confirm test mode active
✅ Browser automation can complete full conversation flow
✅ Test script exits automatically with correct exit code

## Architecture Notes

- **Pure game logic**: Still in `model/` (unchanged)
- **Test markers**: View layer concern (DOM manipulation)
- **Test mode detection**: Helper utility
- **No production impact**: Test mode only active when explicitly enabled

The test marker system maintains architectural separation while enabling automated browser testing.
