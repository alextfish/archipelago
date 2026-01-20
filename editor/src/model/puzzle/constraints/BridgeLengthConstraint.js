import { Constraint } from './Constraint';
// Ensures bridges of a specific type match their required length
export class BridgeLengthConstraint extends Constraint {
    typeId;
    expectedLength;
    constructor(typeId, expectedLength) {
        super();
        this.typeId = typeId;
        this.expectedLength = expectedLength;
    }
    static fromSpec(spec) {
        return new BridgeLengthConstraint(spec.typeId, spec.length);
    }
    check(puzzle) {
        const violations = [];
        // Check all placed bridges of this type
        const bridges = puzzle.bridges.filter(bridge => bridge.type.id === this.typeId);
        for (const bridge of bridges) {
            // Skip incomplete bridges
            if (!bridge.start || !bridge.end) {
                continue;
            }
            // Calculate actual length of the bridge
            const dx = bridge.end.x - bridge.start.x;
            const dy = bridge.end.y - bridge.start.y;
            const actualLength = Math.sqrt(dx * dx + dy * dy);
            // Check if it matches the expected length (with small tolerance for floating point)
            const tolerance = 0.01;
            if (Math.abs(actualLength - this.expectedLength) > tolerance) {
                violations.push(bridge.id);
            }
        }
        return {
            satisfied: violations.length === 0,
            affectedElements: violations,
            message: violations.length ? `Bridge length mismatch for type ${this.typeId}: ${violations.join(", ")}` : undefined
        };
    }
}
