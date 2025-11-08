
export interface BridgeType {
  id: string;
  length?: number; // default -1 means variable length
  colour?: string; // default black
  width?: number;
  style?: string;
  hasLength?(): boolean;
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
  };
}

