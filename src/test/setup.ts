import { vi } from 'vitest';

// Mock Phaser globally
vi.mock('phaser', () => {
    return {
        default: {
            Scene: class MockScene { },
            Input: {
                Keyboard: {
                    KeyCodes: {
                        ESCAPE: 27,
                        ENTER: 13,
                        SPACE: 32,
                    }
                }
            },
            Geom: {
                Rectangle: class MockRectangle {
                    constructor(public x: number, public y: number, public width: number, public height: number) { }
                }
            },
            Game: class MockGame { },
            AUTO: 'AUTO',
            Scale: {
                FIT: 'FIT',
                CENTER_BOTH: 'CENTER_BOTH'
            }
        }
    };
});