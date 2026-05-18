import { beforeEach, describe, expect, it } from 'vitest';
import {
    GAME_STATE_STORAGE_KEY,
    clearArchipelagoPersistentState,
    getSeriesProgressStorageKey,
} from '@model/persistence/PersistenceUtils';

describe('PersistenceUtils', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should clear both saved game state and series progress while preserving unrelated keys', () => {
        localStorage.setItem(GAME_STATE_STORAGE_KEY, '{"foo":"bar"}');
        localStorage.setItem(getSeriesProgressStorageKey('forest-series'), '{"done":true}');
        localStorage.setItem(getSeriesProgressStorageKey('cave-series'), '{"done":false}');
        localStorage.setItem('unrelated-key', 'keep-me');

        clearArchipelagoPersistentState(localStorage);

        expect(localStorage.getItem(GAME_STATE_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(getSeriesProgressStorageKey('forest-series'))).toBeNull();
        expect(localStorage.getItem(getSeriesProgressStorageKey('cave-series'))).toBeNull();
        expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
    });
});