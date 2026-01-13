import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PuzzleInputHandler } from '@controller/PuzzleInputHandler';

describe('PuzzleInputHandler', () => {
    let mockScene: any;
    let mockController: any;
    let mockView: any;
    let inputHandler: PuzzleInputHandler;

    beforeEach(() => {
        mockController = {
            onPointerDown: vi.fn(),
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            cancelPlacement: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn()
        };

        mockView = {
            screenToGrid: vi.fn().mockReturnValue({ x: 5, y: 3 }),
            gridToWorld: vi.fn().mockReturnValue({ x: 160, y: 96 })
        };

        const mockKeyboard = {
            on: vi.fn(),
            off: vi.fn()
        };

        mockScene = {
            input: {
                on: vi.fn(),
                off: vi.fn(),
                keyboard: mockKeyboard
            },
            events: {
                emit: vi.fn()
            }
        };

        inputHandler = new PuzzleInputHandler(mockScene, mockController, mockView);
    });

    describe('setupInputHandlers', () => {
        it('should set up pointer input handlers', () => {
            inputHandler.setupInputHandlers();

            expect(mockScene.input.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
            expect(mockScene.input.on).toHaveBeenCalledWith('pointermove', expect.any(Function));
            expect(mockScene.input.on).toHaveBeenCalledWith('pointerup', expect.any(Function));
        });

        it('should set up keyboard input handlers', () => {
            inputHandler.setupInputHandlers();

            expect(mockScene.input.keyboard.on).toHaveBeenCalledWith('keydown-ESC', expect.any(Function));
            expect(mockScene.input.keyboard.on).toHaveBeenCalledWith('keydown-Z', expect.any(Function));
            expect(mockScene.input.keyboard.on).toHaveBeenCalledWith('keydown-Y', expect.any(Function));
        });

        it('should handle missing keyboard gracefully', () => {
            mockScene.input.keyboard = null;

            expect(() => {
                inputHandler.setupInputHandlers();
            }).not.toThrow();
        });
    });

    describe('pointer input handling', () => {
        beforeEach(() => {
            inputHandler.setupInputHandlers();
        });

        it('should handle pointer down events', () => {
            const mockPointer = { x: 200, y: 150 };

            // Get the pointerdown handler
            const pointerDownHandler = mockScene.input.on.mock.calls.find(
                (call: any) => call[0] === 'pointerdown'
            )[1];

            pointerDownHandler(mockPointer);

            expect(mockView.screenToGrid).toHaveBeenCalledWith(200, 150);
            expect(mockView.gridToWorld).toHaveBeenCalledWith(5, 3);
            expect(mockController.onPointerDown).toHaveBeenCalledWith(160, 96, 5, 3);
        });

        it('should handle pointer move events', () => {
            const mockPointer = { x: 250, y: 200 };

            // Get the pointermove handler
            const pointerMoveHandler = mockScene.input.on.mock.calls.find(
                (call: any) => call[0] === 'pointermove'
            )[1];

            pointerMoveHandler(mockPointer);

            expect(mockView.screenToGrid).toHaveBeenCalledWith(250, 200);
            expect(mockView.gridToWorld).toHaveBeenCalledWith(5, 3);
            expect(mockController.onPointerMove).toHaveBeenCalledWith(160, 96, 5, 3);
        });

        it('should handle pointer up events', () => {
            const mockPointer = { x: 300, y: 250 };

            // Get the pointerup handler
            const pointerUpHandler = mockScene.input.on.mock.calls.find(
                (call: any) => call[0] === 'pointerup'
            )[1];

            pointerUpHandler(mockPointer);

            expect(mockView.screenToGrid).toHaveBeenCalledWith(300, 250);
            expect(mockView.gridToWorld).toHaveBeenCalledWith(5, 3);
            expect(mockController.onPointerUp).toHaveBeenCalledWith(160, 96, 5, 3);
        });
    });

    describe('keyboard input handling', () => {
        beforeEach(() => {
            inputHandler.setupInputHandlers();
        });

        it('should handle ESC key for cancel placement', () => {
            // Get the ESC handler
            const escHandler = mockScene.input.keyboard.on.mock.calls.find(
                (call: any) => call[0] === 'keydown-ESC'
            )[1];

            escHandler();

            expect(mockController.cancelPlacement).toHaveBeenCalled();
        });

        it('should handle Z key for undo', () => {
            // Get the Z handler
            const zHandler = mockScene.input.keyboard.on.mock.calls.find(
                (call: any) => call[0] === 'keydown-Z'
            )[1];

            zHandler();

            expect(mockController.undo).toHaveBeenCalled();
        });

        it('should handle Y key for redo', () => {
            // Get the Y handler
            const yHandler = mockScene.input.keyboard.on.mock.calls.find(
                (call: any) => call[0] === 'keydown-Y'
            )[1];

            yHandler();

            expect(mockController.redo).toHaveBeenCalled();
        });
    });

    describe('destroy', () => {
        it('should remove all event listeners', () => {
            inputHandler.setupInputHandlers();

            inputHandler.destroy();

            expect(mockScene.input.off).toHaveBeenCalledWith('pointerdown');
            expect(mockScene.input.off).toHaveBeenCalledWith('pointermove');
            expect(mockScene.input.off).toHaveBeenCalledWith('pointerup');
            expect(mockScene.input.keyboard.off).toHaveBeenCalledWith('keydown-ESC');
            expect(mockScene.input.keyboard.off).toHaveBeenCalledWith('keydown-Z');
            expect(mockScene.input.keyboard.off).toHaveBeenCalledWith('keydown-Y');
        });

        it('should handle missing keyboard during destroy', () => {
            inputHandler.setupInputHandlers();
            mockScene.input.keyboard = null;

            expect(() => {
                inputHandler.destroy();
            }).not.toThrow();
        });
    });
});