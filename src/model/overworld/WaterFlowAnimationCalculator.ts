import type { Direction } from '@model/puzzle/FlowTypes';

/**
 * Calculates flow animation asset keys from incoming and outgoing directions.
 */
export class WaterFlowAnimationCalculator {
    private static readonly ORDER: readonly Direction[] = ['N', 'S', 'E', 'W'];

    static calculateAnimationKey(incoming: Direction[], outgoing: Direction[]): string | undefined {
        const outgoingToken = this.toToken(outgoing);
        if (!outgoingToken) return undefined;

        const incomingToken = this.toToken(incoming) ?? this.inferFallbackIncoming(outgoingToken);
        if (!incomingToken) return undefined;

        return `flow_${incomingToken}-to-${outgoingToken}`;
    }

    private static inferFallbackIncoming(outgoingToken: string): string | undefined {
        const first = outgoingToken[0];
        switch (first) {
            case 'N': return 'S';
            case 'S': return 'N';
            case 'E': return 'W';
            case 'W': return 'E';
            default: return undefined;
        }
    }

    private static toToken(directions: Direction[]): string | undefined {
        if (!Array.isArray(directions) || directions.length === 0) return undefined;
        const unique = new Set<Direction>(directions);
        const ordered = this.ORDER.filter(dir => unique.has(dir));
        return ordered.length > 0 ? ordered.join('') : undefined;
    }
}
