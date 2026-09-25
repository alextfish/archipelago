import { describe, expect, it } from 'vitest';

import { getDoorSpriteFrame, getDoorSpriteMapping } from '@view/DoorSpriteRegistry';

describe('DoorSpriteRegistry', () => {
    it('maps general horizontal door tiles from terrains.png', () => {
        const mapping = getDoorSpriteMapping('doorHClosed');

        expect(mapping).toEqual({
            textureKey: 'terrains-door-tiles',
            closedFrame: 30,
            openFrame: 31,
            animationKey: 'terrains-door-tiles',
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 2,
            animationStartFrame: 30,
        });
    });

    it('returns the correct frames for locked and unlocked general doors', () => {
        expect(getDoorSpriteFrame('doorHClosed', true)).toBe(30);
        expect(getDoorSpriteFrame('doorHClosed', false)).toBe(31);
    });
});