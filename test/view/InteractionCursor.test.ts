import { describe, expect, it, vi } from 'vitest';
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';

type MockSprite = {
    x: number;
    y: number;
    setVisible: ReturnType<typeof vi.fn>;
    setDepth: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
};

function createMockSprite(): MockSprite {
    const sprite: MockSprite = {
        x: 0,
        y: 0,
        setVisible: vi.fn(() => sprite),
        setDepth: vi.fn(() => sprite),
        setPosition: vi.fn((x: number, y: number) => {
            sprite.x = x;
            sprite.y = y;
            return sprite;
        }),
        destroy: vi.fn(),
    };
    return sprite;
}

function createMockScene() {
    const spriteA = createMockSprite();
    const spriteB = createMockSprite();

    return {
        spriteA,
        spriteB,
        scene: {
            textures: {
                exists: vi.fn(() => true),
            },
            load: {
                image: vi.fn(),
                once: vi.fn(),
                start: vi.fn(),
                isLoading: vi.fn(() => false),
            },
            add: {
                sprite: vi.fn()
                    .mockReturnValueOnce(spriteA)
                    .mockReturnValueOnce(spriteB),
            },
            time: {
                addEvent: vi.fn(),
            },
        },
    };
}

describe('InteractionCursor', () => {
    it('repositions cursor when the same target object moves tiles', () => {
        const { scene, spriteA, spriteB } = createMockScene();
        const cursor = new InteractionCursor(scene as any, 32, 32);

        const movingNPCInteractable: Interactable = {
            type: 'npc',
            tileX: 10,
            tileY: 10,
            data: { id: 'npc-1' },
        };

        // Player remains stationary and target starts in range.
        cursor.update(10, 9, [movingNPCInteractable]);
        expect(spriteA.x).toBe(10 * 32 + 16);
        expect(spriteA.y).toBe(10 * 32 + 16);
        expect(spriteB.x).toBe(10 * 32 + 16);
        expect(spriteB.y).toBe(10 * 32 + 16);

        // NPC moves while still in range; cursor should follow without player movement.
        movingNPCInteractable.tileX = 11;
        movingNPCInteractable.tileY = 10;
        cursor.update(10, 9, [movingNPCInteractable]);

        expect(spriteA.x).toBe(11 * 32 + 16);
        expect(spriteA.y).toBe(10 * 32 + 16);
        expect(spriteB.x).toBe(11 * 32 + 16);
        expect(spriteB.y).toBe(10 * 32 + 16);
    });
});
