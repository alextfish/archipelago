// Returns the available viewport rectangle for puzzle rendering, accounting for the
// sidebar area on the right. The sidebar is assumed to begin at x = 650 by default.
// We keep the signature intentionally lightweight to avoid pulling Phaser types
// into test-only code paths. The caller may pass the Phaser scene or any object
// with a `scale.width/height` shape.
// The functionality previously in this file has moved to `ui/viewport.ts`.
// Keep a thin re-export for compatibility during migration.
export { getAvailableViewport, type ViewportRect } from './viewport';
