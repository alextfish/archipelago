

export interface Island {
  id: string;
  x: number;
  y: number;
  constraints?: string[];
}

/**
 * Parse an island's constraints and return the numeric value of a
 * "num_bridges=N" constraint when present. Returns null when no such
 * constraint exists or when the value is not a valid number.
 */
export function parseNumBridgesConstraint(island: Island): number | null {
  const rule = island.constraints?.find(c => c.startsWith("num_bridges="));
  if (!rule) return null;
  const parts = rule.split("=");
  if (parts.length < 2) return null;
  const n = Number(parts[1]);
  return Number.isFinite(n) ? n : null;
}