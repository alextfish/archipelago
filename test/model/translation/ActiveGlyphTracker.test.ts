/**
 * Unit tests for ActiveGlyphTracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';
import type { GlyphRegistration, GlyphScreenBounds } from '@model/translation/ActiveGlyphTracker';

describe('ActiveGlyphTracker', () => {
    let tracker: ActiveGlyphTracker;

    const makeBounds = (frames: number[]): GlyphScreenBounds[] =>
        frames.map((f, i) => ({
            frameIndex: f,
            indexInBubble: i,
            screenX: i * 64,
            screenY: 100,
            tileSize: 64,
        }));

    const makeRegistration = (
        id: string,
        frames: number[] = [30, 31],
        language = 'grass'
    ): GlyphRegistration => ({
        id,
        language,
        glyphs: frames.map((f, i) => ({ frameIndex: f, indexInBubble: i })),
        getBounds: () => makeBounds(frames),
    });

    beforeEach(() => {
        tracker = new ActiveGlyphTracker();
    });

    describe('registerGlyphSet', () => {
        it('should add a new registration', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1'));
            expect(tracker.hasRegistration('bubble-1')).toBe(true);
        });

        it('should replace an existing registration with the same id', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1', [30]));
            tracker.registerGlyphSet(makeRegistration('bubble-1', [31, 32]));
            const reg = tracker.getRegistrations().get('bubble-1');
            expect(reg?.glyphs).toHaveLength(2);
            expect(reg?.glyphs[0].frameIndex).toBe(31);
        });
    });

    describe('unregisterGlyphSet', () => {
        it('should remove a registration', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1'));
            tracker.unregisterGlyphSet('bubble-1');
            expect(tracker.hasRegistration('bubble-1')).toBe(false);
        });

        it('should be a no-op for unknown id', () => {
            expect(() => tracker.unregisterGlyphSet('nonexistent')).not.toThrow();
        });
    });

    describe('hasRegistration', () => {
        it('should return false when empty', () => {
            expect(tracker.hasRegistration('bubble-1')).toBe(false);
        });

        it('should return true after registering', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1'));
            expect(tracker.hasRegistration('bubble-1')).toBe(true);
        });
    });

    describe('getRegistrations', () => {
        it('should return all registrations', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1'));
            tracker.registerGlyphSet(makeRegistration('bubble-2', [32, 33]));
            expect(tracker.getRegistrations().size).toBe(2);
        });

        it('should return an empty map when no registrations exist', () => {
            expect(tracker.getRegistrations().size).toBe(0);
        });
    });

    describe('getAllGlyphBounds', () => {
        it('should return bounds from all registrations', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1', [30, 31]));
            tracker.registerGlyphSet(makeRegistration('bubble-2', [32]));
            const bounds = tracker.getAllGlyphBounds();
            expect(bounds).toHaveLength(3);
        });

        it('should return an empty array when there are no registrations', () => {
            expect(tracker.getAllGlyphBounds()).toHaveLength(0);
        });

        it('should skip registrations whose getBounds() returns null', () => {
            const nullReg: GlyphRegistration = {
                id: 'bubble-null',
                language: 'grass',
                glyphs: [{ frameIndex: 30, indexInBubble: 0 }],
                getBounds: () => null,
            };
            tracker.registerGlyphSet(nullReg);
            tracker.registerGlyphSet(makeRegistration('bubble-valid', [31]));
            const bounds = tracker.getAllGlyphBounds();
            expect(bounds).toHaveLength(1);
            expect(bounds[0].frameIndex).toBe(31);
        });
    });

    describe('clearAll', () => {
        it('should remove all registrations', () => {
            tracker.registerGlyphSet(makeRegistration('bubble-1'));
            tracker.registerGlyphSet(makeRegistration('bubble-2'));
            tracker.clearAll();
            expect(tracker.getRegistrations().size).toBe(0);
        });
    });
});
