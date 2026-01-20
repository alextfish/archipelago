/**
 * Helper to create a BridgeType with defaults and methods.
 */
export function createBridgeType(params) {
    const id = params.id ?? "default";
    const length = params.length ?? -1;
    const colour = params.colour ?? "black";
    const width = params.width ?? 1.0;
    const style = params.style ?? "normal";
    const canCoverIsland = params.canCoverIsland ?? false;
    const mustCoverIsland = params.mustCoverIsland ?? false;
    return {
        id,
        length,
        colour,
        width,
        style,
        canCoverIsland,
        mustCoverIsland,
        hasLength: () => length !== -1,
        allowsSpan: (start, end) => {
            if (length === -1)
                return true;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return Math.abs(dist - length) <= 0.01;
        }
    };
}
