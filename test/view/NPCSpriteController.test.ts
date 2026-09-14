import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NPCSpriteController } from '@view/NPCSpriteController';
import { GridToWorldMapper } from '@view/GridToWorldMapper';

function createMockSprite(initialX: number, initialY: number) {
    const sprite: any = {
        x: initialX,
        y: initialY,
        depth: initialY,
        frame: undefined as number | undefined,
        anims: {
            stop: vi.fn(),
        },
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn(function (depth: number) {
            sprite.depth = depth;
            return sprite;
        }),
        setPosition: vi.fn(function (x: number, y: number) {
            sprite.x = x;
            sprite.y = y;
            return sprite;
        }),
        setFrame: vi.fn(function (frame: number) {
            sprite.frame = frame;
            return sprite;
        }),
        play: vi.fn().mockReturnThis(),
    };

    return sprite;
}

describe('NPCSpriteController path-following NPCs', () => {
    let createdAnimationKeys: Set<string>;
    let mockScene: any;
    let controller: NPCSpriteController;
    let interactables: any[];

    beforeEach(() => {
        createdAnimationKeys = new Set();
        interactables = [];

        mockScene = {
            add: {
                sprite: vi.fn((x: number, y: number) => createMockSprite(x, y)),
                image: vi.fn(),
            },
            events: {
                on: vi.fn(),
                off: vi.fn(),
                once: vi.fn(),
            },
            game: {
                canvas: {
                    getBoundingClientRect: () => ({ left: 0, top: 0 }),
                },
            },
            cameras: {
                main: {
                    worldView: { x: 0, y: 0 },
                    zoom: 1,
                },
            },
            anims: {
                exists: vi.fn((key: string) => createdAnimationKeys.has(key)),
                create: vi.fn((config: { key: string }) => {
                    createdAnimationKeys.add(config.key);
                    return config;
                }),
                generateFrameNumbers: vi.fn((key: string, range: { start: number; end: number }) =>
                    Array.from({ length: range.end - range.start + 1 }, (_value, index) => ({
                        key,
                        frame: range.start + index,
                    }))
                ),
            },
            textures: {
                get: vi.fn(() => ({
                    getFrameNames: () => ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
                })),
            },
        };

        controller = new NPCSpriteController(
            mockScene,
            {} as any,
            new GridToWorldMapper(32),
            undefined,
            {
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: 'paths',
                        type: 'objectgroup',
                        x: 0,
                        y: 0,
                        objects: [
                            {
                                name: 'child_run',
                                x: 0,
                                y: 0,
                                polygon: [
                                    { x: 0, y: 0 },
                                    { x: 32, y: 0 },
                                    { x: 32, y: 32 },
                                    { x: 0, y: 32 },
                                ],
                            },
                        ],
                    },
                ],
            },
            () => undefined,
            (interactable) => interactables.push(interactable),
            () => undefined,
        );

        controller.registerAnimations();
    });

    it('advances moving NPCs by speed and turns at segment boundaries', () => {
        controller.loadNPCsFromLayer({
            objects: [
                {
                    id: 1,
                    name: 'Child1',
                    x: 0,
                    y: 0,
                    properties: [
                        { name: 'appearance', value: 'Child1' },
                        { name: 'path', value: 'child_run' },
                        { name: 'speed', value: 1 },
                    ],
                },
            ],
        } as any, 'npcs');

        const sprite = controller.npcSprites.get('1') as any;
        controller.update(500, true);

        expect(sprite.x).toBe(16);
        expect(sprite.y).toBe(32);
        expect(sprite.play).toHaveBeenLastCalledWith('Townfolk-Child-F-001 dark-walk-right', true);
        expect(interactables[0]).toMatchObject({ tileX: 0, tileY: 0 });

        controller.update(500, true);

        expect(sprite.x).toBe(32);
        expect(sprite.y).toBe(32);
        expect(sprite.play).toHaveBeenLastCalledWith('Townfolk-Child-F-001 dark-walk-down', true);
        expect(interactables[0]).toMatchObject({ tileX: 1, tileY: 0 });
    });

    it('keeps zero-speed path NPCs on their authored path position and idle frame', () => {
        controller.loadNPCsFromLayer({
            objects: [
                {
                    id: 1,
                    name: 'Child1',
                    x: 5,
                    y: 0,
                    properties: [
                        { name: 'appearance', value: 'Child1' },
                        { name: 'path', value: 'child_run' },
                        { name: 'speed', value: 0 },
                    ],
                },
            ],
        } as any, 'npcs');

        const sprite = controller.npcSprites.get('1') as any;

        expect(sprite.x).toBe(5);
        expect(sprite.y).toBe(32);
        expect(sprite.play).not.toHaveBeenCalled();
        expect(sprite.setFrame).toHaveBeenLastCalledWith(10);

        controller.update(1000, true);

        expect(sprite.x).toBe(5);
        expect(sprite.y).toBe(32);
        expect(sprite.play).not.toHaveBeenCalled();
        expect(sprite.setFrame).toHaveBeenLastCalledWith(10);
    });

    it('preserves a non-grid-aligned authored start when projecting onto a path', () => {
        controller.loadNPCsFromLayer({
            objects: [
                {
                    id: 1,
                    name: 'Child1',
                    x: 11,
                    y: 0,
                    properties: [
                        { name: 'appearance', value: 'Child1' },
                        { name: 'path', value: 'child_run' },
                        { name: 'speed', value: 1 },
                    ],
                },
            ],
        } as any, 'npcs');

        const sprite = controller.npcSprites.get('1') as any;

        expect(sprite.x).toBe(11);
        expect(sprite.y).toBe(32);
        expect(interactables[0]).toMatchObject({ tileX: 0, tileY: 0 });
    });

    it('pauses path followers when the shared movement/input gate is closed', () => {
        controller.loadNPCsFromLayer({
            objects: [
                {
                    id: 1,
                    name: 'Child1',
                    x: 0,
                    y: 0,
                    properties: [
                        { name: 'appearance', value: 'Child1' },
                        { name: 'path', value: 'child_run' },
                        { name: 'speed', value: 1 },
                    ],
                },
            ],
        } as any, 'npcs');

        const sprite = controller.npcSprites.get('1') as any;
        controller.update(500, false);

        expect(sprite.x).toBe(0);
        expect(sprite.y).toBe(32);
        expect(sprite.anims.stop).toHaveBeenCalled();
        expect(sprite.setFrame).toHaveBeenLastCalledWith(10);
    });
});
