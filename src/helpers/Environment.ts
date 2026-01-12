/**
 * Global environment configuration for the application.
 * Provides access to environment-specific settings and debug modes.
 */
export class Environment {
    private static _isDevelopment: boolean | null = null;

    /**
     * Returns true if running in development mode.
     * Checks for common development environment indicators.
     */
    static isDevelopment(): boolean {
        if (this._isDevelopment !== null) {
            return this._isDevelopment;
        }

        // Check various development mode indicators
        this._isDevelopment =
            // Vite development mode
            import.meta.env?.DEV === true ||
            // Node environment
            (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
            // Development server detection (only in browser)
            (typeof window !== 'undefined' && (
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.port !== '' ||
                // URL parameter override
                new URLSearchParams(window.location.search).has('debug')
            ));

        return this._isDevelopment;
    }

    /**
     * Returns true if debug features should be enabled.
     * Can be overridden via URL parameter or development mode.
     */
    static isDebug(): boolean {
        return this.isDevelopment() ||
            (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'));
    }

    /**
     * Force set development mode (useful for testing).
     */
    static setDevelopmentMode(isDev: boolean): void {
        this._isDevelopment = isDev;
    }

    /**
     * Get environment info for debugging.
     */
    static getInfo(): Record<string, any> {
        // Check if we're in a browser environment
        const inBrowser = typeof window !== 'undefined';
        const inNode = typeof process !== 'undefined';

        return {
            isDevelopment: this.isDevelopment(),
            isDebug: this.isDebug(),
            hostname: inBrowser ? window.location.hostname : 'node',
            port: inBrowser ? window.location.port : 'node',
            search: inBrowser ? window.location.search : '',
            userAgent: inBrowser ? navigator.userAgent : 'node',
            viteEnv: import.meta.env || null,
            nodeEnv: inNode ? process.env?.NODE_ENV : null,
            environment: inBrowser ? 'browser' : (inNode ? 'node' : 'unknown')
        };
    }
}