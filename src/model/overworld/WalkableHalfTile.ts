import { CollisionType, type CollisionType as CollisionTypeValue } from '@model/overworld/CollisionTypes';

export type WalkableHalfDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const TILE_EDGE_EPSILON = 0.001;

const DIRECTION_TO_COLLISION_TYPE: Record<WalkableHalfDirection, CollisionTypeValue> = {
    n: CollisionType.WALKABLE_HALF_N,
    s: CollisionType.WALKABLE_HALF_S,
    e: CollisionType.WALKABLE_HALF_E,
    w: CollisionType.WALKABLE_HALF_W,
    ne: CollisionType.WALKABLE_HALF_NE,
    nw: CollisionType.WALKABLE_HALF_NW,
    se: CollisionType.WALKABLE_HALF_SE,
    sw: CollisionType.WALKABLE_HALF_SW,
};

const COLLISION_TYPE_TO_DIRECTION = new Map<CollisionTypeValue, WalkableHalfDirection>(
    Object.entries(DIRECTION_TO_COLLISION_TYPE).map(([direction, collisionType]) => [
        collisionType,
        direction as WalkableHalfDirection,
    ])
);

export function walkableHalfDirectionFromCollisionType(
    collisionType: CollisionTypeValue
): WalkableHalfDirection | undefined {
    return COLLISION_TYPE_TO_DIRECTION.get(collisionType);
}

export function collisionTypeFromWalkableHalfDirection(direction: string): CollisionTypeValue | undefined {
    const normalised = direction.trim().toLowerCase();
    if (!normalised) {
        return undefined;
    }
    return DIRECTION_TO_COLLISION_TYPE[normalised as WalkableHalfDirection];
}

export function isWalkableHalfCollisionType(collisionType: CollisionTypeValue): boolean {
    return walkableHalfDirectionFromCollisionType(collisionType) !== undefined;
}

export function isWalkableHalfDirectionAtLocalPosition(
    direction: WalkableHalfDirection,
    localX: number,
    localY: number,
    tileSize: number = 32
): boolean {
    switch (direction) {
        case 'n':
            return localY < tileSize / 2;
        case 's':
            return localY >= tileSize / 2;
        case 'e':
            return localX >= tileSize / 2;
        case 'w':
            return localX < tileSize / 2;
        case 'sw':
            return localY > localX;
        case 'se':
            return localY + localX > tileSize;
        case 'ne':
            return localY < localX;
        case 'nw':
            return localY + localX < tileSize;
    }
}

export function isPositionWalkableInTile(
    collisionType: CollisionTypeValue,
    worldX: number,
    worldY: number,
    tileX: number,
    tileY: number,
    tileSize: number = 32
): boolean {
    const direction = walkableHalfDirectionFromCollisionType(collisionType);
    if (!direction) {
        return true;
    }

    const localX = worldX - tileX * tileSize;
    const localY = worldY - tileY * tileSize;
    return isWalkableHalfDirectionAtLocalPosition(direction, localX, localY, tileSize);
}

export function isBoundaryCrossingWalkable(
    fromType: CollisionTypeValue,
    toType: CollisionTypeValue,
    axis: 'x' | 'y',
    coordinateOnOtherAxis: number,
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number,
    tileSize: number = 32
): boolean {
    if (!isWalkableHalfCollisionType(fromType) && !isWalkableHalfCollisionType(toType)) {
        return true;
    }

    if (axis === 'x') {
        const movingEast = toTileX > fromTileX;
        const edgeX = movingEast
            ? fromTileX * tileSize + tileSize
            : fromTileX * tileSize;

        const fromSampleX = movingEast ? edgeX - TILE_EDGE_EPSILON : edgeX + TILE_EDGE_EPSILON;
        const toSampleX = movingEast ? edgeX + TILE_EDGE_EPSILON : edgeX - TILE_EDGE_EPSILON;

        return isPositionWalkableInTile(fromType, fromSampleX, coordinateOnOtherAxis, fromTileX, fromTileY, tileSize) &&
            isPositionWalkableInTile(toType, toSampleX, coordinateOnOtherAxis, toTileX, toTileY, tileSize);
    }

    const movingSouth = toTileY > fromTileY;
    const edgeY = movingSouth
        ? fromTileY * tileSize + tileSize
        : fromTileY * tileSize;

    const fromSampleY = movingSouth ? edgeY - TILE_EDGE_EPSILON : edgeY + TILE_EDGE_EPSILON;
    const toSampleY = movingSouth ? edgeY + TILE_EDGE_EPSILON : edgeY - TILE_EDGE_EPSILON;

    return isPositionWalkableInTile(fromType, coordinateOnOtherAxis, fromSampleY, fromTileX, fromTileY, tileSize) &&
        isPositionWalkableInTile(toType, coordinateOnOtherAxis, toSampleY, toTileX, toTileY, tileSize);
}
