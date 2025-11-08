// Helper: compute the available viewport rectangle for puzzle rendering.
// Keeps UI helpers separate from Phaser types so tests remain lightweight.
export function getAvailableViewport(scene: { scale?: { width?: number; height?: number } } | null, sidebarLeft = 650) {
  const width = scene?.scale?.width ?? 800;
  const height = scene?.scale?.height ?? 600;
  return {
    minX: 0,
    maxX: Math.min(sidebarLeft, width),
    minY: 0,
    maxY: height,
  };
}

export type ViewportRect = ReturnType<typeof getAvailableViewport>;
