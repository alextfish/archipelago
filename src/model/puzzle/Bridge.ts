import type { BridgeType } from "./BridgeType";


export interface Bridge {
    id: string;
    start?: { x: number; y: number; };
    end?: { x: number; y: number; };
    type: BridgeType;
}
