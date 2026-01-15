import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraManager } from '@view/CameraManager';

// Simple mock rectangle class
class MockRectangle {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number
    ) { }
}

describe('CameraManager', () => {
    let mockScene: any;
    let mockCamera: any;
    let cameraManager: CameraManager;

    beforeEach(() => {
        mockCamera = {
            scrollX: 100,
            scrollY: 200,
            displayWidth: 800,
            displayHeight: 600,
            width: 800,
            height: 600,
            zoom: 1,
            pan: vi.fn(),
            zoomTo: vi.fn(),
            setZoom: vi.fn(),
            centerOn: vi.fn(),
            setScroll: vi.fn()
        };

        mockScene = {
            cameras: {
                main: mockCamera
            }
        };

        cameraManager = new CameraManager(mockScene, 32);
    });

    describe('transitionToPuzzle', () => {
        it('should store original camera state', async () => {
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);

            // Mock pan callback to resolve immediately
            mockCamera.pan.mockImplementation((_x: number, _y: number, _duration: number, _ease: string, _force: boolean, callback: Function) => {
                callback(mockCamera, 1);
            });

            // Store camera state before transition
            cameraManager.storeCameraState();
            await cameraManager.transitionToPuzzle(puzzleBounds as any);

            expect(cameraManager.isInPuzzleView()).toBe(true);
        });

        it('should calculate correct target zoom and position', async () => {
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);
            const padding = 2 * 32; // 2 cells * 32px tile size

            mockCamera.pan.mockImplementation((_x: number, _y: number, _duration: number, _ease: string, _force: boolean, callback: Function) => {
                callback(mockCamera, 1);
            });

            // Store camera state before transition
            cameraManager.storeCameraState();
            await cameraManager.transitionToPuzzle(puzzleBounds as any);

            // Should pan to center of puzzle with padding
            const expectedCenterX = puzzleBounds.x + puzzleBounds.width / 2;
            const expectedCenterY = puzzleBounds.y + puzzleBounds.height / 2;

            expect(mockCamera.pan).toHaveBeenCalledWith(
                expectedCenterX,
                expectedCenterY,
                1000,
                'Power2',
                false,
                expect.any(Function)
            );

            // Should zoom to fit puzzle with padding (no max cap)
            // Use camera.width/height not displayWidth/displayHeight
            const puzzleWithPadding = {
                width: puzzleBounds.width + padding * 2,
                height: puzzleBounds.height + padding * 2
            };
            const scaleX = mockCamera.width / puzzleWithPadding.width;
            const scaleY = mockCamera.height / puzzleWithPadding.height;
            const expectedZoom = Math.min(scaleX, scaleY);

            expect(mockCamera.zoomTo).toHaveBeenCalledWith(expectedZoom, 1000, 'Power2');
        });
    });

    describe('transitionToOverworld', () => {
        it('should return to original camera state', async () => {
            // First enter puzzle mode
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);
            mockCamera.pan.mockImplementation((_x: number, _y: number, _duration: number, _ease: string, _force: boolean, callback: Function) => {
                callback(mockCamera, 1);
            });
            mockCamera.zoomTo.mockImplementation((_zoom: number, _duration: number, _ease: string, _force: boolean, callback: Function) => {
                if (callback) callback(mockCamera, 1);
            });

            // Store camera state then transition to puzzle
            cameraManager.storeCameraState();
            await cameraManager.transitionToPuzzle(puzzleBounds as any);

            // Now return to overworld
            await cameraManager.transitionToOverworld();

            // Should zoom back to original zoom (panning is handled by camera follow, not by CameraManager)
            expect(mockCamera.zoomTo).toHaveBeenCalledWith(1, 1000, 'Power2', false, expect.any(Function));
        });
    });

    describe('setPuzzleView', () => {
        it('should immediately set camera to puzzle view', () => {
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);

            cameraManager.storeCameraState();
            cameraManager.setPuzzleView(puzzleBounds as any);

            expect(mockCamera.setZoom).toHaveBeenCalled();
            expect(mockCamera.centerOn).toHaveBeenCalled();
        });
    });

    describe('setOverworldView', () => {
        it('should immediately return to overworld view', () => {
            // First enter puzzle mode
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);
            cameraManager.storeCameraState();
            cameraManager.setPuzzleView(puzzleBounds as any);

            // Now return
            cameraManager.setOverworldView();

            expect(mockCamera.setZoom).toHaveBeenCalledWith(1); // Original zoom
            expect(mockCamera.setScroll).toHaveBeenCalledWith(100, 200);
        });
    });

    describe('isInPuzzleView', () => {
        it('should return false initially', () => {
            expect(cameraManager.isInPuzzleView()).toBe(false);
        });

        it('should return true after entering puzzle view', () => {
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);
            cameraManager.storeCameraState();
            cameraManager.setPuzzleView(puzzleBounds as any);

            expect(cameraManager.isInPuzzleView()).toBe(true);
        });
    });

    describe('reset', () => {
        it('should clear all stored state', () => {
            const puzzleBounds = new MockRectangle(400, 300, 200, 150);
            cameraManager.storeCameraState();
            cameraManager.setPuzzleView(puzzleBounds as any);

            expect(cameraManager.isInPuzzleView()).toBe(true);

            cameraManager.reset();

            expect(cameraManager.isInPuzzleView()).toBe(false);
        });
    });
});