/**
 * Unit tests for PlayerTranslationDictionary
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerTranslationDictionary } from '@model/translation/PlayerTranslationDictionary';

describe('PlayerTranslationDictionary', () => {
    let dict: PlayerTranslationDictionary;

    beforeEach(() => {
        dict = new PlayerTranslationDictionary();
    });

    describe('setTranslation and getTranslation', () => {
        it('should store and retrieve a translation', () => {
            dict.setTranslation(30, 'you');
            expect(dict.getTranslation(30)).toBe('you');
        });

        it('should return undefined for an unknown frame', () => {
            expect(dict.getTranslation(999)).toBeUndefined();
        });

        it('should overwrite an existing translation', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(30, 'me');
            expect(dict.getTranslation(30)).toBe('me');
        });

        it('should trim whitespace from the translation text', () => {
            dict.setTranslation(30, '  you  ');
            expect(dict.getTranslation(30)).toBe('you');
        });

        it('should delete an entry when given an empty string', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(30, '');
            expect(dict.getTranslation(30)).toBeUndefined();
        });

        it('should delete an entry when given a whitespace-only string', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(30, '   ');
            expect(dict.getTranslation(30)).toBeUndefined();
        });
    });

    describe('hasTranslation', () => {
        it('should return false when no translation is stored', () => {
            expect(dict.hasTranslation(30)).toBe(false);
        });

        it('should return true after setting a translation', () => {
            dict.setTranslation(30, 'you');
            expect(dict.hasTranslation(30)).toBe(true);
        });

        it('should return false after clearing a translation with empty string', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(30, '');
            expect(dict.hasTranslation(30)).toBe(false);
        });
    });

    describe('getAllTranslations', () => {
        it('should return an empty map initially', () => {
            expect(dict.getAllTranslations().size).toBe(0);
        });

        it('should return all stored translations', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(31, 'me');
            const all = dict.getAllTranslations();
            expect(all.size).toBe(2);
            expect(all.get(30)).toBe('you');
            expect(all.get(31)).toBe('me');
        });
    });

    describe('deleteTranslation', () => {
        it('should remove a specific translation', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(31, 'me');
            dict.deleteTranslation(30);
            expect(dict.getTranslation(30)).toBeUndefined();
            expect(dict.getTranslation(31)).toBe('me');
        });

        it('should be a no-op for an unknown frame', () => {
            expect(() => dict.deleteTranslation(999)).not.toThrow();
        });
    });

    describe('clearAll', () => {
        it('should remove all translations', () => {
            dict.setTranslation(30, 'you');
            dict.setTranslation(31, 'me');
            dict.clearAll();
            expect(dict.getAllTranslations().size).toBe(0);
        });
    });
});
