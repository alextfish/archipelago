/**
 * Unit tests for LanguageGlyphRegistry
 */

import { describe, it, expect } from 'vitest';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';

describe('LanguageGlyphRegistry', () => {
    describe('initialization', () => {
        it('should initialize with grass and fire languages', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.hasLanguage('grass')).toBe(true);
            expect(registry.hasLanguage('fire')).toBe(true);
        });

        it('should return correct tileset path', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getTilesetPath()).toBe('resources/tilesets/language.png');
        });
    });

    describe('getSpeechBubbleFrames', () => {
        it('should return correct frames for grass language', () => {
            const registry = new LanguageGlyphRegistry();
            const frames = registry.getSpeechBubbleFrames('grass');

            expect(frames.topLeft).toBe(0);
            expect(frames.topEdge).toBe(1);
            expect(frames.topRight).toBe(2);
            expect(frames.leftEdge).toBe(10);
            expect(frames.centre).toBe(11);
            expect(frames.rightEdge).toBe(12);
            expect(frames.bottomLeft).toBe(20);
            expect(frames.bottomEdge).toBe(21);
            expect(frames.bottomRight).toBe(22);
        });

        it('should return correct frames for fire language', () => {
            const registry = new LanguageGlyphRegistry();
            const frames = registry.getSpeechBubbleFrames('fire');

            expect(frames.topLeft).toBe(3);
            expect(frames.topEdge).toBe(4);
            expect(frames.topRight).toBe(5);
            expect(frames.leftEdge).toBe(13);
            expect(frames.centre).toBe(14);
            expect(frames.rightEdge).toBe(15);
            expect(frames.bottomLeft).toBe(23);
            expect(frames.bottomEdge).toBe(24);
            expect(frames.bottomRight).toBe(25);
        });

        it('should throw error for unknown language', () => {
            const registry = new LanguageGlyphRegistry();

            expect(() => registry.getSpeechBubbleFrames('unknown')).toThrow('Unknown language: unknown');
        });
    });

    describe('getGlyphFrame', () => {
        it('should return correct frame for known grass words', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'you')).toBe(30);
            expect(registry.getGlyphFrame('grass', 'me')).toBe(31);
            expect(registry.getGlyphFrame('grass', 'bridge')).toBe(32);
            expect(registry.getGlyphFrame('grass', 'want')).toBe(33);
            expect(registry.getGlyphFrame('grass', 'build')).toBe(34);
            expect(registry.getGlyphFrame('grass', 'adjacent')).toBe(35);
            expect(registry.getGlyphFrame('grass', 'not')).toBe(36);
            expect(registry.getGlyphFrame('grass', 'vertical')).toBe(37);
            expect(registry.getGlyphFrame('grass', 'horizontal')).toBe(38);
        });

        it('should be case-insensitive', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'BRIDGE')).toBe(32);
            expect(registry.getGlyphFrame('grass', 'BrIdGe')).toBe(32);
        });

        it('should return missing glyph frame for unknown grass words', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'unknown')).toBe(6);
            expect(registry.getGlyphFrame('grass', 'invalid')).toBe(6);
        });

        it('should return missing glyph frame for unknown fire words', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('fire', 'unknown')).toBe(7);
        });

        it('should throw error for unknown language', () => {
            const registry = new LanguageGlyphRegistry();

            expect(() => registry.getGlyphFrame('unknown', 'word')).toThrow('Unknown language: unknown');
        });
    });

    describe('parseGlyphs', () => {
        it('should parse space-separated glyphs into frame indices', () => {
            const registry = new LanguageGlyphRegistry();
            const frames = registry.parseGlyphs('grass', 'me want adjacent vertical bridge');

            expect(frames).toEqual([31, 33, 35, 37, 32]);
        });

        it('should handle extra whitespace', () => {
            const registry = new LanguageGlyphRegistry();
            const frames = registry.parseGlyphs('grass', '  me   want  bridge  ');

            expect(frames).toEqual([31, 33, 32]);
        });

        it('should use missing glyph frame for unknown words', () => {
            const registry = new LanguageGlyphRegistry();
            const frames = registry.parseGlyphs('grass', 'me unknown bridge');

            expect(frames).toEqual([31, 6, 32]);
        });
    });

    describe('calculateBubbleSize', () => {
        it('should calculate width based on word count', () => {
            const registry = new LanguageGlyphRegistry();
            const size = registry.calculateBubbleSize('me want adjacent vertical bridge');

            expect(size.width).toBe(5);
            expect(size.rows).toBe(1);
        });

        it('should handle single word', () => {
            const registry = new LanguageGlyphRegistry();
            const size = registry.calculateBubbleSize('bridge');

            expect(size.width).toBe(1);
            expect(size.rows).toBe(1);
        });

        it('should handle extra whitespace', () => {
            const registry = new LanguageGlyphRegistry();
            const size = registry.calculateBubbleSize('  me   want  ');

            expect(size.width).toBe(2);
            expect(size.rows).toBe(1);
        });
    });

    describe('addGlyph', () => {
        it('should allow adding new glyphs to a language', () => {
            const registry = new LanguageGlyphRegistry();

            registry.addGlyph('grass', 'question', 40);

            expect(registry.getGlyphFrame('grass', 'question')).toBe(40);
        });

        it('should allow overwriting existing glyphs', () => {
            const registry = new LanguageGlyphRegistry();

            registry.addGlyph('grass', 'bridge', 99);

            expect(registry.getGlyphFrame('grass', 'bridge')).toBe(99);
        });

        it('should throw error for unknown language', () => {
            const registry = new LanguageGlyphRegistry();

            expect(() => registry.addGlyph('unknown', 'word', 50)).toThrow('Unknown language: unknown');
        });
    });

    describe('constraint validation glyphs', () => {
        it('should have constraint validation glyphs registered', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'no')).toBe(40);
            expect(registry.getGlyphFrame('grass', 'not-enough')).toBe(41);
            expect(registry.getGlyphFrame('grass', 'too-many')).toBe(42);
            expect(registry.getGlyphFrame('grass', 'must-not')).toBe(43);
            expect(registry.getGlyphFrame('grass', 'area')).toBe(44);
            expect(registry.getGlyphFrame('grass', 'enclosed')).toBe(45);
            expect(registry.getGlyphFrame('grass', 'island')).toBe(46);
            expect(registry.getGlyphFrame('grass', 'connected')).toBe(47);
            expect(registry.getGlyphFrame('grass', 'over')).toBe(48);
            expect(registry.getGlyphFrame('grass', 'under')).toBe(49);
        });

        it('should have directional glyphs registered', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'left-of')).toBe(50);
            expect(registry.getGlyphFrame('grass', 'right-of')).toBe(51);
            expect(registry.getGlyphFrame('grass', 'above')).toBe(52);
            expect(registry.getGlyphFrame('grass', 'below')).toBe(53);
        });

        it('should have color glyphs registered', () => {
            const registry = new LanguageGlyphRegistry();

            expect(registry.getGlyphFrame('grass', 'red')).toBe(60);
            expect(registry.getGlyphFrame('grass', 'blue')).toBe(61);
            expect(registry.getGlyphFrame('grass', 'green')).toBe(62);
            expect(registry.getGlyphFrame('grass', 'yellow')).toBe(63);
        });

        it('should parse constraint validation glyph messages', () => {
            const registry = new LanguageGlyphRegistry();

            const frames1 = registry.parseGlyphs('grass', 'not-enough bridge');
            expect(frames1).toEqual([41, 32]);

            const frames2 = registry.parseGlyphs('grass', 'red island must-not connected blue island');
            expect(frames2).toEqual([60, 46, 43, 47, 61, 46]);

            const frames3 = registry.parseGlyphs('grass', 'no adjacent bridge');
            expect(frames3).toEqual([40, 35, 32]);
        });
    });
});
