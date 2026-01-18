/**
 * Unit tests for NPCAppearanceRegistry
 */

import { describe, it, expect } from 'vitest';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';

describe('NPCAppearanceRegistry', () => {
    describe('initialization', () => {
        it('should initialize with sailorNS and sailorEW appearances', () => {
            const registry = new NPCAppearanceRegistry();

            expect(registry.hasAppearance('sailorNS')).toBe(true);
            expect(registry.hasAppearance('sailorEW')).toBe(true);
        });

        it('should not have unknown appearances', () => {
            const registry = new NPCAppearanceRegistry();

            expect(registry.hasAppearance('unknown')).toBe(false);
        });
    });

    describe('getAppearance', () => {
        it('should return correct appearance data for sailorNS', () => {
            const registry = new NPCAppearanceRegistry();
            const appearance = registry.getAppearance('sailorNS');

            expect(appearance.spriteKey).toBe('sailorNS');
            expect(appearance.expressions.neutral).toBe(0);
            expect(appearance.expressions.happy).toBe(1);
            expect(appearance.expressions.sad).toBe(2);
        });

        it('should return correct appearance data for sailorEW', () => {
            const registry = new NPCAppearanceRegistry();
            const appearance = registry.getAppearance('sailorEW');

            expect(appearance.spriteKey).toBe('sailorEW');
            expect(appearance.expressions.neutral).toBe(0);
            expect(appearance.expressions.happy).toBe(1);
            expect(appearance.expressions.sad).toBe(2);
        });

        it('should throw error for unknown appearance', () => {
            const registry = new NPCAppearanceRegistry();

            expect(() => registry.getAppearance('unknown')).toThrow('Unknown NPC appearance: unknown');
        });
    });

    describe('getSpritePath', () => {
        it('should return correct sprite path', () => {
            const registry = new NPCAppearanceRegistry();

            expect(registry.getSpritePath('sailorNS')).toBe('resources/sprites/sailorNS.png');
            expect(registry.getSpritePath('sailorEW')).toBe('resources/sprites/sailorEW.png');
        });

        it('should throw error for unknown appearance', () => {
            const registry = new NPCAppearanceRegistry();

            expect(() => registry.getSpritePath('unknown')).toThrow('Unknown NPC appearance: unknown');
        });
    });

    describe('registerAppearance', () => {
        it('should allow registering new appearances', () => {
            const registry = new NPCAppearanceRegistry();

            registry.registerAppearance('customNPC', {
                spriteKey: 'custom',
                expressions: {
                    neutral: 'neutral_frame',
                    happy: 'happy_frame',
                    sad: 'sad_frame',
                },
            });

            expect(registry.hasAppearance('customNPC')).toBe(true);

            const appearance = registry.getAppearance('customNPC');
            expect(appearance.spriteKey).toBe('custom');
            expect(appearance.expressions.neutral).toBe('neutral_frame');
        });

        it('should allow overwriting existing appearances', () => {
            const registry = new NPCAppearanceRegistry();

            registry.registerAppearance('sailorNS', {
                spriteKey: 'newSailor',
                expressions: {
                    neutral: 10,
                    happy: 11,
                    sad: 12,
                },
            });

            const appearance = registry.getAppearance('sailorNS');
            expect(appearance.spriteKey).toBe('newSailor');
            expect(appearance.expressions.neutral).toBe(10);
        });
    });
});
