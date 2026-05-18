export const GAME_STATE_STORAGE_KEY = 'archipelago_game_state';
export const SERIES_PROGRESS_STORAGE_KEY_PREFIX = 'archipelago_series_progress_';

type StorageReader = Pick<Storage, 'length' | 'key'>;
type StorageWriter = Pick<Storage, 'removeItem'>;
type StorageView = StorageReader & StorageWriter;

export function getSeriesProgressStorageKey(seriesId: string): string {
    return `${SERIES_PROGRESS_STORAGE_KEY_PREFIX}${seriesId}`;
}

export function clearSeriesProgressStorage(storage: StorageView = localStorage): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(SERIES_PROGRESS_STORAGE_KEY_PREFIX)) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => storage.removeItem(key));
}

export function clearArchipelagoPersistentState(storage: StorageView = localStorage): void {
    storage.removeItem(GAME_STATE_STORAGE_KEY);
    clearSeriesProgressStorage(storage);
}