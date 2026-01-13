import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddedPuzzleRenderer } from '@view/EmbeddedPuzzleRenderer';

describe('EmbeddedPuzzleRenderer - Coordinate Conversion', () => {
    let mockScene: any;
    let mockCamera: any;
    let renderer: EmbeddedPuzzleRenderer;

    beforeEach(() => {
        // Mock camera with zoom
        mockCamera = {
            scrollX: 100,
            scrollY: 200,
            zoom: 2.0
        };

        // Mock scene
        mockScene = {
            cameras: {
                main: mockCamera
            },
            add: {
                container: vi.fn().mockReturnValue({
                    setDepth: vi.fn()
                })
            }
        };

        // Create puzzle bounds
        const puzzleBounds = { x: 500, y: 600, width: 160, height: 160 };

        renderer = new EmbeddedPuzzleRenderer(mockScene, puzzleBounds as any);
    });

    describe('screenToGrid with zoom', () => {
        it('should correctly convert screen coordinates with camera zoom', () => {
            // Test case: screen position (400, 300) with camera zoom 2.0
            // Expected calculation:
            // worldX = (400 / 2.0) + 100 = 200 + 100 = 300
            // worldY = (300 / 2.0) + 200 = 150 + 200 = 350
            // gridX = Math.floor((300 - 500) / 32) = Math.floor(-200 / 32) = -7
            // gridY = Math.floor((350 - 600) / 32) = Math.floor(-250 / 32) = -8

            const result = renderer.screenToGrid(400, 300);
            expect(result.x).toBe(-7);
            expect(result.y).toBe(-8);
        });

        it('should handle zoom factor of 1.0 correctly', () => {
            mockCamera.zoom = 1.0;

            // worldX = (400 / 1.0) + 100 = 500
            // worldY = (300 / 1.0) + 200 = 500  
            // gridX = Math.floor((500 - 500) / 32) = 0
            // gridY = Math.floor((500 - 600) / 32) = Math.floor(-100 / 32) = -4

            const result = renderer.screenToGrid(400, 300);
            expect(result.x).toBe(0);
            expect(result.y).toBe(-4);
        });

        it('should handle different zoom levels consistently', () => {
            mockCamera.zoom = 0.5; // Zoomed out

            // worldX = (400 / 0.5) + 100 = 800 + 100 = 900
            // worldY = (300 / 0.5) + 200 = 600 + 200 = 800
            // gridX = Math.floor((900 - 500) / 32) = Math.floor(400 / 32) = 12
            // gridY = Math.floor((800 - 600) / 32) = Math.floor(200 / 32) = 6

            const result = renderer.screenToGrid(400, 300);
            expect(result.x).toBe(12);
            expect(result.y).toBe(6);
        });
    });

    describe('gridToWorld', () => {
        it('should convert grid coordinates to world coordinates', () => {
            // Grid (1, 1) should map to world (532, 632)
            // worldX = 1 * 32 + 500 = 532
            // worldY = 1 * 32 + 600 = 632

            const result = renderer.gridToWorld(1, 1);
            expect(result.x).toBe(532);
            expect(result.y).toBe(632);
        });

        it('should handle negative grid coordinates', () => {
            // Grid (-1, -1) should map to world (468, 568)
            // worldX = -1 * 32 + 500 = 468  
            // worldY = -1 * 32 + 600 = 568

            const result = renderer.gridToWorld(-1, -1);
            expect(result.x).toBe(468);
            expect(result.y).toBe(568);
        });
    });
});