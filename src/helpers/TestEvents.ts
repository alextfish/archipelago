/**
 * Test event utilities for emitting game events that can be observed by test scripts
 * These events are emitted to window for browser automation tools to listen to
 * 
 * Only enabled when in test mode - zero overhead in production
 */

import { isTestMode } from './TestMarkers';

export interface GameEvent {
    type: string;
    timestamp: number;
    data?: any;
}

/**
 * Emit a game event to the window object for test scripts to observe
 * Only emits when in test mode
 * 
 * @param type - Event type (e.g., 'conversation_started', 'puzzle_completed')
 * @param data - Optional event data
 */
export function emitTestEvent(type: string, data?: any): void {
    if (!isTestMode()) {
        return;
    }

    const event: GameEvent = {
        type,
        timestamp: Date.now(),
        data
    };

    // Initialize event log if it doesn't exist
    if (typeof window !== 'undefined') {
        if (!(window as any).__GAME_EVENTS__) {
            (window as any).__GAME_EVENTS__ = [];
        }

        // Add to event log
        (window as any).__GAME_EVENTS__.push(event);

        // Also dispatch as a custom DOM event for event-driven listening
        window.dispatchEvent(new CustomEvent('game-event', { detail: event }));

        // Log to console for visibility
        console.log(`[TEST EVENT] ${type}`, data || '');
    }
}

/**
 * Check if a specific event has occurred (for test scripts)
 * 
 * @param type - Event type to check for
 * @returns True if the event has occurred
 */
export function hasEventOccurred(type: string): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const events = (window as any).__GAME_EVENTS__ || [];
    return events.some((event: GameEvent) => event.type === type);
}

/**
 * Get all events of a specific type (for test scripts)
 * 
 * @param type - Event type to filter by
 * @returns Array of matching events
 */
export function getEvents(type: string): GameEvent[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const events = (window as any).__GAME_EVENTS__ || [];
    return events.filter((event: GameEvent) => event.type === type);
}

/**
 * Clear all test events (useful for test setup/teardown)
 */
export function clearTestEvents(): void {
    if (typeof window !== 'undefined') {
        (window as any).__GAME_EVENTS__ = [];
    }
}
