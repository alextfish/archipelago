import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

interface TiledObjectProperty {
    readonly name: string;
    readonly value: unknown;
}

interface TiledRectangleObject {
    readonly id: number;
    readonly name?: string;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly properties?: readonly TiledObjectProperty[];
}

export interface CameraZoneBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface CameraScopeZone {
    readonly id: string;
    readonly tag: string;
    readonly priority: number;
    readonly scopeBounds: CameraZoneBounds;
    readonly focusBounds: CameraZoneBounds;
}

export interface CameraZoomZone {
    readonly id: string;
    readonly priority: number;
    readonly zoom: number;
    readonly bounds: CameraZoneBounds;
}

export interface ActiveOverworldCameraTarget {
    readonly mode: 'scope' | 'follow';
    readonly key: string;
    readonly followZoom: number;
    readonly scopeZone?: CameraScopeZone;
    readonly zoomZone?: CameraZoomZone;
    readonly focusBounds?: CameraZoneBounds;
}

/**
 * Pure parser/resolver for map-driven overworld camera rectangles.
 */
export class OverworldCameraZones {
    constructor(
        private readonly scopeZones: readonly CameraScopeZone[],
        private readonly zoomZones: readonly CameraZoomZone[]
    ) { }

    static fromTiledLayers(layers: any[]): OverworldCameraZones {
        const cameraLayers = TiledLayerUtils.findObjectLayersByName(layers, 'camera');
        const scopeObjects: TiledRectangleObject[] = [];
        const focusObjectsByTag = new Map<string, TiledRectangleObject>();
        const zoomZones: CameraZoomZone[] = [];

        for (const layerInfo of cameraLayers) {
            const objects = Array.isArray(layerInfo.data?.objects) ? layerInfo.data.objects as TiledRectangleObject[] : [];
            for (const object of objects) {
                const objectName = String(object.name ?? '').trim().toLowerCase();
                if (objectName === 'focus') {
                    const tag = OverworldCameraZones.getStringProperty(object, 'tag');
                    if (!tag) {
                        continue;
                    }
                    focusObjectsByTag.set(tag, object);
                    continue;
                }

                if (objectName === 'scope') {
                    scopeObjects.push(object);
                    continue;
                }

                if (objectName === 'zoom') {
                    const bounds = OverworldCameraZones.getBounds(object);
                    const zoom = OverworldCameraZones.getNumberProperty(object, 'zoom');
                    if (!bounds || zoom === null || zoom <= 0) {
                        continue;
                    }

                    zoomZones.push({
                        id: OverworldCameraZones.getObjectID(object, 'zoom'),
                        priority: OverworldCameraZones.getNumberProperty(object, 'priority') ?? 0,
                        zoom,
                        bounds
                    });
                }
            }
        }

        const scopeZones: CameraScopeZone[] = [];
        for (const scopeObject of scopeObjects) {
            const tag = OverworldCameraZones.getStringProperty(scopeObject, 'tag');
            if (!tag) {
                continue;
            }

            const scopeBounds = OverworldCameraZones.getBounds(scopeObject);
            const focusObject = focusObjectsByTag.get(tag);
            const focusBounds = focusObject ? OverworldCameraZones.getBounds(focusObject) : null;
            if (!scopeBounds || !focusBounds) {
                continue;
            }

            scopeZones.push({
                id: OverworldCameraZones.getObjectID(scopeObject, `scope:${tag}`),
                tag,
                priority: OverworldCameraZones.getNumberProperty(scopeObject, 'priority') ?? 0,
                scopeBounds,
                focusBounds
            });
        }

        return new OverworldCameraZones(scopeZones, zoomZones);
    }

    resolveAt(worldX: number, worldY: number, defaultZoom: number): ActiveOverworldCameraTarget {
        const activeScope = this.pickHighestPriority(
            this.scopeZones.filter((zone) => OverworldCameraZones.containsPoint(zone.scopeBounds, worldX, worldY))
        );
        if (activeScope) {
            return {
                mode: 'scope',
                key: `scope:${activeScope.tag}:${activeScope.priority}`,
                followZoom: defaultZoom,
                scopeZone: activeScope,
                focusBounds: activeScope.focusBounds
            };
        }

        const activeZoom = this.pickHighestPriority(
            this.zoomZones.filter((zone) => OverworldCameraZones.containsPoint(zone.bounds, worldX, worldY))
        );

        return {
            mode: 'follow',
            key: activeZoom
                ? `zoom:${activeZoom.id}:${activeZoom.priority}:${activeZoom.zoom}`
                : `default:${defaultZoom}`,
            followZoom: activeZoom?.zoom ?? defaultZoom,
            zoomZone: activeZoom
        };
    }

    getScopeZones(): readonly CameraScopeZone[] {
        return this.scopeZones;
    }

    getZoomZones(): readonly CameraZoomZone[] {
        return this.zoomZones;
    }

    private pickHighestPriority<T extends CameraScopeZone | CameraZoomZone>(zones: readonly T[]): T | undefined {
        return [...zones].sort((left, right) => {
            if (right.priority !== left.priority) {
                return right.priority - left.priority;
            }

            const leftArea = OverworldCameraZones.getZoneArea(left);
            const rightArea = OverworldCameraZones.getZoneArea(right);
            if (leftArea !== rightArea) {
                return leftArea - rightArea;
            }

            return left.id.localeCompare(right.id);
        })[0];
    }

    private static containsPoint(bounds: CameraZoneBounds, worldX: number, worldY: number): boolean {
        return worldX >= bounds.x
            && worldX < bounds.x + bounds.width
            && worldY >= bounds.y
            && worldY < bounds.y + bounds.height;
    }

    private static getZoneArea(zone: CameraScopeZone | CameraZoomZone): number {
        if ('bounds' in zone) {
            return zone.bounds.width * zone.bounds.height;
        }

        return zone.scopeBounds.width * zone.scopeBounds.height;
    }

    private static getBounds(object: TiledRectangleObject): CameraZoneBounds | null {
        if (typeof object.x !== 'number'
            || typeof object.y !== 'number'
            || typeof object.width !== 'number'
            || typeof object.height !== 'number'
            || object.width <= 0
            || object.height <= 0) {
            return null;
        }

        return {
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height
        };
    }

    private static getObjectID(object: TiledRectangleObject, fallbackPrefix: string): string {
        const explicitName = String(object.name ?? '').trim();
        if (explicitName.length > 0) {
            return `${fallbackPrefix}:${explicitName}:${object.id}`;
        }

        return `${fallbackPrefix}:${object.id}`;
    }

    private static getStringProperty(object: TiledRectangleObject, name: string): string | null {
        const value = object.properties?.find((property) => property.name === name)?.value;
        if (typeof value !== 'string') {
            return null;
        }

        const trimmedValue = value.trim();
        return trimmedValue.length > 0 ? trimmedValue : null;
    }

    private static getNumberProperty(object: TiledRectangleObject, name: string): number | null {
        const value = object.properties?.find((property) => property.name === name)?.value;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        return null;
    }
}