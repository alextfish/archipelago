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

    it('defines cave multi-tile passability masks with blocked wall edges', () => {
        const mapping = getDoorSpriteMapping('caveDoorClosed');
        expect(mapping).not.toBeNull();

        expect(mapping!.variantsByWidth?.[3].passableWhenOpen).toEqual([false, true, false]);
        expect(mapping!.variantsByWidth?.[4].passableWhenOpen).toEqual([false, true, true, false]);
        expect(mapping!.variantsByWidth?.[5].passableWhenOpen).toEqual([false, true, true, true, false]);
        expect(mapping!.variantsByWidth?.[3].renderAsGroundWhenOpen).toBe(true);
        expect(mapping!.variantsByWidth?.[4].renderAsGroundWhenOpen).toBe(true);
        expect(mapping!.variantsByWidth?.[5].renderAsGroundWhenOpen).toBe(true);
    });
});