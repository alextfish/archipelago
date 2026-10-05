import type { Interactable } from '@view/InteractionCursor';

/**
 * True when a tile is within immediate interaction range of the player.
 */
export function isWithinInteractionRange(
    playerTileX: number,
    playerTileY: number,
    targetTileX: number,
    targetTileY: number
): boolean {
    const tileDx = Math.abs(targetTileX - playerTileX);
    const tileDy = Math.abs(targetTileY - playerTileY);
    return tileDx <= 1 && tileDy <= 1;
}

/**
 * Finds an interactable exactly at a tile coordinate.
 */
export function findInteractableAtTile(
    interactables: readonly Interactable[],
    tileX: number,
    tileY: number
): Interactable | undefined {
    return interactables.find((interactable) => interactable.tileX === tileX && interactable.tileY === tileY);
}

/**
 * Finds an interactable on a target tile only if that tile is in interaction range.
 */
export function findInteractableInRangeAtTile(
    interactables: readonly Interactable[],
    playerTileX: number,
    playerTileY: number,
    targetTileX: number,
    targetTileY: number
): Interactable | undefined {
    if (!isWithinInteractionRange(playerTileX, playerTileY, targetTileX, targetTileY)) {
        return undefined;
    }

    return findInteractableAtTile(interactables, targetTileX, targetTileY);
}
