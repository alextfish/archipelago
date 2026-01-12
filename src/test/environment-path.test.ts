/**
 * Simple validation test that imports resolve correctly.
 * This test focuses specifically on the @helpers path mapping issue.
 */
import { describe, it, expect } from 'vitest';
import { Environment } from '@helpers/Environment';

describe('@helpers path mapping validation', () => {
    it('should successfully import Environment class', () => {
        expect(Environment).toBeDefined();
        expect(Environment.isDevelopment).toBeDefined();
        expect(Environment.isDebug).toBeDefined();
    });

    it('should handle Environment methods safely', () => {
        // These should not throw errors even in test environment
        expect(typeof Environment.isDevelopment()).toBe('boolean');
        expect(typeof Environment.isDebug()).toBe('boolean');

        const info = Environment.getInfo();
        expect(info).toBeDefined();
        expect(typeof info).toBe('object');
    });

    it('should detect test environment correctly', () => {
        const info = Environment.getInfo();
        // In Node.js test environment, should detect as 'node'
        expect(info.environment).toBe('node');
        expect(info.hostname).toBe('node');
    });
});