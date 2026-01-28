/**
 * Test marker utilities for automated browser testing
 * These create invisible DOM elements over Phaser objects that can be clicked by browser automation tools
 * 
 * Only enabled when TEST_MODE environment variable is set
 */

import type Phaser from 'phaser';

/**
 * Check if test markers should be enabled
 */
export function isTestMode(): boolean {
    // Check window flag set by test.html
    if (typeof window !== 'undefined' && (window as any).__TEST_MODE__) {
        return true;
    }
    // Check Vite environment variables
    return import.meta.env.MODE === 'test' || import.meta.env.VITE_TEST_MODE === 'true';
}

interface TestMarkerOptions {
    id: string;
    testId?: string;
    width?: number;
    height?: number;
    showBorder?: boolean;
}

/**
 * Attach a test marker DOM element to a Phaser sprite or game object
 * The marker will follow the object's position and be clickable by automation tools
 * 
 * @param scene - The Phaser scene
 * @param object - The Phaser game object (sprite, image, etc.)
 * @param options - Configuration options
 * @returns The created marker element, or null if not in test mode
 */
export function attachTestMarker(
    scene: Phaser.Scene,
    object: Phaser.GameObjects.GameObject & { x: number; y: number; displayWidth?: number; displayHeight?: number },
    options: TestMarkerOptions
): HTMLElement | null {
    if (!isTestMode()) {
        return null;
    }

    console.log(`[TEST] Creating test marker: ${options.id}`);

    // Create the marker element
    const marker = document.createElement('div');
    marker.id = options.id;
    marker.dataset.testid = options.testId || options.id;
    marker.style.position = 'absolute';
    marker.style.pointerEvents = 'auto';
    marker.style.background = 'transparent';
    marker.style.zIndex = '1000';
    
    // Show border during development for visibility
    if (options.showBorder !== false) {
        marker.style.border = '2px dashed rgba(255, 0, 0, 0.3)';
    }

    // Set size based on display dimensions or explicit size
    const width = options.width || object.displayWidth || 64;
    const height = options.height || object.displayHeight || 64;
    marker.style.width = `${width}px`;
    marker.style.height = `${height}px`;

    document.body.appendChild(marker);

    // Function to update marker position
    const updatePosition = () => {
        if (!marker.parentElement) {
            // Marker was removed, stop updating
            scene.events.off('postupdate', updatePosition);
            return;
        }

        const canvas = scene.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const camera = scene.cameras.main;

        // Get sprite origin (defaults to 0.5, 0.5 if not set)
        const originX = (object as any).originX !== undefined ? (object as any).originX : 0.5;
        const originY = (object as any).originY !== undefined ? (object as any).originY : 0.5;

        // Calculate the top-left corner of the sprite in world coordinates
        const spriteDisplayWidth = object.displayWidth || width;
        const spriteDisplayHeight = object.displayHeight || height;
        const worldLeft = object.x - (originX * spriteDisplayWidth);
        const worldTop = object.y - (originY * spriteDisplayHeight);

        // Transform world coordinates to camera space (0,0 = top-left of camera view)
        const cameraSpaceX = (worldLeft - camera.worldView.x) * camera.zoom;
        const cameraSpaceY = (worldTop - camera.worldView.y) * camera.zoom;
        
        // Convert camera space to viewport coordinates
        const viewportX = canvasRect.left + cameraSpaceX;
        const viewportY = canvasRect.top + cameraSpaceY;
        
        // Convert to document coordinates
        const documentX = viewportX + window.scrollX;
        const documentY = viewportY + window.scrollY;

        // Position the marker
        marker.style.left = `${documentX}px`;
        marker.style.top = `${documentY}px`;
    };

    // Update position every frame
    scene.events.on('postupdate', updatePosition);
    updatePosition(); // Initial position

    // Clean up when scene shuts down
    scene.events.once('shutdown', () => {
        console.log(`[TEST] Removing test marker: ${options.id}`);
        scene.events.off('postupdate', updatePosition);
        if (marker.parentElement) {
            marker.parentElement.removeChild(marker);
        }
    });

    return marker;
}

/**
 * Attach a test marker to a tile position (for static objects)
 * 
 * @param scene - The Phaser scene
 * @param tileX - Tile X coordinate
 * @param tileY - Tile Y coordinate
 * @param tileWidth - Width of a tile in pixels
 * @param tileHeight - Height of a tile in pixels
 * @param options - Configuration options
 * @returns The created marker element, or null if not in test mode
 */
export function attachTestMarkerToTile(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
    options: TestMarkerOptions
): HTMLElement | null {
    if (!isTestMode()) {
        return null;
    }

    // Create a pseudo-object with the tile's world position
    const worldX = tileX * tileWidth + tileWidth / 2;
    const worldY = tileY * tileHeight + tileHeight / 2;

    const pseudoObject = {
        x: worldX,
        y: worldY,
        displayWidth: options.width || tileWidth,
        displayHeight: options.height || tileHeight
    } as any;

    return attachTestMarker(scene, pseudoObject, options);
}

/**
 * Remove a test marker by ID
 */
export function removeTestMarker(id: string): void {
    const marker = document.getElementById(id);
    if (marker && marker.parentElement) {
        marker.parentElement.removeChild(marker);
        console.log(`[TEST] Manually removed test marker: ${id}`);
    }
}

/**
 * Remove all test markers
 */
export function removeAllTestMarkers(): void {
    const markers = document.querySelectorAll('[data-testid]');
    markers.forEach(marker => {
        if (marker.parentElement) {
            marker.parentElement.removeChild(marker);
        }
    });
    console.log(`[TEST] Removed ${markers.length} test markers`);
}
