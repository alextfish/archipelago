
export interface BridgeType {
  id: string;
  length?: number; // default -1 means variable length
  colour?: string; // default black
  width?: number;
  style?: string;
  hasLength?(): boolean;
  /** Returns true when this bridge type allows a span between the two grid coordinates. */
  allowsSpan?(start: { x: number; y: number }, end: { x: number; y: number }): boolean;
}

/**
 * Helper to create a BridgeType with defaults and methods.
 */
export function createBridgeType(params: Partial<BridgeType>): BridgeType {
  const id = params.id ?? "default";
  const length = params.length ?? -1;
  const colour = params.colour ?? "black";
  const width = params.width ?? 1.0;
  const style = params.style ?? "normal";
  return {
    id,
    length,
    colour,
    width,
    style,
    hasLength: () => length !== -1,
    allowsSpan: (start: { x: number; y: number }, end: { x: number; y: number }) => {
      if (length === -1) return true;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return Math.abs(dist - length) <= 0.01;
    }
  };
}

