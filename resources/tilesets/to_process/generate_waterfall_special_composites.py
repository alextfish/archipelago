"""
Assemble specific 32x32 waterfall composites from Waterfall 16x16.tsx and Rocks.tsx.

Outputs:
  - waterfall_special_32x32.png
  - waterfall_special_32x32.tsx
  - waterfall_special_32x32_manifest.json
    - waterfall_special_preview.html

The manifest records the source tile ID plus x/y pixel coordinates for every
16x16 source tile used in each 32x32 composite, including the exact waterfall
image coordinates when waterfall tiles are selected.
"""

from __future__ import annotations

import json
import os
import random
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_WATERFALL_TSX = os.path.join(SCRIPT_DIR, 'Waterfall 16x16.tsx')
DEFAULT_ROCKS_TSX = os.path.join(SCRIPT_DIR, 'Rocks.tsx')
OUTPUT_PNG = os.path.join(SCRIPT_DIR, 'waterfall_special_32x32.png')
OUTPUT_TSX = os.path.join(SCRIPT_DIR, 'waterfall_special_32x32.tsx')
OUTPUT_MANIFEST = os.path.join(SCRIPT_DIR, 'waterfall_special_32x32_manifest.json')
OUTPUT_PREVIEW_HTML = os.path.join(SCRIPT_DIR, 'waterfall_special_preview.html')

CANONICAL_EMPTY = 'nothing'
FRAME_COUNT = 6
SOURCE_FRAME_HEIGHT_TILES = 5
FRAME_DURATION_MS = 200
FIXED_TILE_OVERRIDES = {
    'centre_waterfall': {
        'top_left': 16,
        'top_right': 16,
        'bottom_left': 25,
        'bottom_right': 25,
    },
}
DUPLICATE_TILE_SOURCES = {
    'lower_centre_waterfall': 'bottom_centre_waterfall',
}
ATLAS_LAYOUT = [
    'top_left_waterfall',
    'top_centre_waterfall',
    'top_right_waterfall',
    'left_side_waterfall',
    'centre_waterfall',
    'right_side_waterfall',
    'bottom_left_waterfall',
    'bottom_centre_waterfall',
    'bottom_right_waterfall',
    'lower_left_waterfall',
    'lower_centre_waterfall',
    'lower_right_waterfall',
]
ATLAS_COLUMNS = 3


@dataclass(frozen=True)
class SourceTile:
    signature: tuple[str, str, str, str]
    tile_id: int
    x: int
    y: int
    source_tsx: str
    source_image: str
    image_path: str


@dataclass(frozen=True)
class TilesetGeometry:
    columns: int
    rows: int
    tile_width: int
    tile_height: int
    image_path: str
    source_image: str


def normalise_tiled_xml(text: str) -> str:
    return re.sub(
        r'<\?\s*xml\s+version\s*=\s*"([^"]+)"\s+encoding\s*=\s*"([^"]+)"\s*\?>',
        r'<?xml version="\1" encoding="\2"?>',
        text,
        count=1,
    )


def resolve_source_image(tsx_path: str, image_source: str) -> str:
    tsx_dir = os.path.dirname(os.path.abspath(tsx_path))
    candidates = [
        os.path.normpath(os.path.join(tsx_dir, image_source)),
        os.path.join(tsx_dir, os.path.basename(image_source)),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    raise FileNotFoundError(f'Could not resolve image source {image_source!r} for {tsx_path!r}.')


def parse_corner_wang_tileset(tsx_path: str, normalise_xml: bool = False) -> tuple[dict[tuple[str, str, str, str], list[SourceTile]], TilesetGeometry]:
    text = open(tsx_path, 'r', encoding='utf-8').read()
    if normalise_xml:
        text = normalise_tiled_xml(text)
    root = ET.fromstring(text)

    image_element = root.find('image')
    if image_element is None:
        raise ValueError(f'{tsx_path} is missing an image element.')

    image_source = image_element.attrib['source']
    image_path = resolve_source_image(tsx_path, image_source)
    image = Image.open(image_path)
    columns = int(root.attrib['columns'])
    tile_width = int(root.attrib['tilewidth'])
    tile_height = int(root.attrib['tileheight'])
    if tile_width != 16 or tile_height != 16:
        raise ValueError(f'{tsx_path} is expected to be a 16x16 source tileset.')
    rows = image.height // tile_height

    colour_names = [CANONICAL_EMPTY]
    for wang_color in root.findall('.//wangcolor'):
        colour_names.append(wang_color.attrib['name'])

    lookup: dict[tuple[str, str, str, str], list[SourceTile]] = {}
    for wang_tile in root.findall('.//wangtile'):
        tile_id = int(wang_tile.attrib['tileid'])
        values = [int(value) for value in wang_tile.attrib['wangid'].split(',')]
        signature = tuple(colour_names[index] for index in (values[7], values[1], values[3], values[5]))
        source_tile = SourceTile(
            signature=signature,
            tile_id=tile_id,
            x=(tile_id % columns) * tile_width,
            y=(tile_id // columns) * tile_height,
            source_tsx=os.path.basename(tsx_path),
            source_image=os.path.basename(image_path),
            image_path=image_path,
        )
        lookup.setdefault(signature, []).append(source_tile)

    for tiles in lookup.values():
        tiles.sort(key=lambda tile: tile.tile_id)

    geometry = TilesetGeometry(
        columns=columns,
        rows=rows,
        tile_width=tile_width,
        tile_height=tile_height,
        image_path=image_path,
        source_image=os.path.basename(image_path),
    )

    return lookup, geometry


def build_base_recipes() -> dict[str, list[list[str]]]:
    recipes = {
        'top_left_waterfall': [
            ['flat rock', 'flat rock', 'flat water'],
            ['flat rock', 'flat rock', 'flat water'],
            ['side rock', 'side rock', 'side water'],
        ],
        'top_centre_waterfall': [
            ['flat water', 'flat water', 'flat water'],
            ['flat water', 'flat water', 'flat water'],
            ['side water', 'side water', 'side water'],
        ],
        'left_side_waterfall': [
            ['side rock', 'side rock', 'side water'],
            ['side rock', 'side rock', 'side water'],
            ['side rock', 'side rock', 'side water'],
        ],
        'centre_waterfall': [
            ['side water', 'side water', 'side water'],
            ['side water', 'side water', 'side water'],
            ['side water', 'side water', 'side water'],
        ],
        'bottom_left_waterfall': [
            ['side rock', 'side rock', 'side water'],
            ['flat rock', 'flat rock', 'flat water'],
            ['flat rock', 'flat rock', 'flat water'],
        ],
        'bottom_centre_waterfall': [
            ['side water', 'side water', 'side water'],
            ['flat water', 'flat water', 'flat water'],
            ['flat water', 'flat water', 'flat water'],
        ],
        'lower_left_waterfall': [
            ['side rock', 'side rock', 'side water'],
            ['flat water', 'flat water', 'flat water'],
            ['flat water', 'flat water', 'flat water'],
        ],
        'lower_centre_waterfall': [
            ['side water', 'side water', 'side water'],
            ['flat water', 'flat water', 'flat water'],
            ['flat water', 'flat water', 'flat water'],
        ],
    }

    for name, grid in list(recipes.items()):
        if 'left' in name:
            recipes[name.replace('left', 'right')] = [list(reversed(row)) for row in grid]

    return recipes


def quadrant_signatures(grid: list[list[str]]) -> dict[str, tuple[str, str, str, str]]:
    return {
        'top_left': (grid[0][0], grid[0][1], grid[1][1], grid[1][0]),
        'top_right': (grid[0][1], grid[0][2], grid[1][2], grid[1][1]),
        'bottom_left': (grid[1][0], grid[1][1], grid[2][1], grid[2][0]),
        'bottom_right': (grid[1][1], grid[1][2], grid[2][2], grid[2][1]),
    }


class SignaturePicker:
    def __init__(self) -> None:
        self._pools: dict[tuple[str, str, str, str, str], list[SourceTile]] = {}

    def pick(self, source_name: str, signature: tuple[str, str, str, str], candidates: list[SourceTile]) -> SourceTile:
        if not candidates:
            raise ValueError(f'No candidates available for {source_name} signature {signature}.')

        pool_key = (source_name, *signature)
        pool = self._pools.get(pool_key)
        if not pool:
            pool = candidates.copy()
            random.shuffle(pool)
            self._pools[pool_key] = pool

        return pool.pop()


def pick_source_tile(signature: tuple[str, str, str, str], waterfall_lookup: dict[tuple[str, str, str, str], list[SourceTile]], rocks_lookup: dict[tuple[str, str, str, str], list[SourceTile]], picker: SignaturePicker) -> SourceTile:
    waterfall_tiles = waterfall_lookup.get(signature, [])
    rocks_tiles = rocks_lookup.get(signature, [])
    has_water = any('water' in label for label in signature)

    if has_water and waterfall_tiles:
        return picker.pick('waterfall', signature, waterfall_tiles)
    if not has_water and rocks_tiles:
        return picker.pick('rocks', signature, rocks_tiles)
    if waterfall_tiles:
        return picker.pick('waterfall', signature, waterfall_tiles)
    if rocks_tiles:
        return picker.pick('rocks', signature, rocks_tiles)

    raise ValueError(f'No source tile available for signature {signature}.')


def build_waterfall_tile_index(waterfall_lookup: dict[tuple[str, str, str, str], list[SourceTile]]) -> dict[int, SourceTile]:
    return {
        tile.tile_id: tile
        for tiles in waterfall_lookup.values()
        for tile in tiles
    }


def pick_overridden_tile(tile_name: str, quadrant_name: str, signature: tuple[str, str, str, str], waterfall_tiles_by_id: dict[int, SourceTile]) -> SourceTile | None:
    override_tile_id = FIXED_TILE_OVERRIDES.get(tile_name, {}).get(quadrant_name)
    if override_tile_id is None:
        return None

    tile = waterfall_tiles_by_id.get(override_tile_id)
    if tile is None:
        raise ValueError(f'Override tile {override_tile_id} for {tile_name} {quadrant_name} does not exist in the waterfall tileset.')
    if tile.signature != signature:
        raise ValueError(
            f'Override tile {override_tile_id} for {tile_name} {quadrant_name} has signature {tile.signature}, expected {signature}.'
        )

    return tile


def crop_source_tile(tile: SourceTile, tile_width: int, tile_height: int) -> Image.Image:
    image = Image.open(tile.image_path).convert('RGBA')
    return image.crop((tile.x, tile.y, tile.x + tile_width, tile.y + tile_height))


def offset_waterfall_tile(tile: SourceTile, frame_index: int, geometry: TilesetGeometry) -> SourceTile:
    if tile.source_tsx != os.path.basename(DEFAULT_WATERFALL_TSX):
        return tile

    source_row = tile.y // geometry.tile_height
    offset_row = (source_row + frame_index * SOURCE_FRAME_HEIGHT_TILES) % geometry.rows
    offset_tile_id = offset_row * geometry.columns + (tile.x // geometry.tile_width)

    return SourceTile(
        signature=tile.signature,
        tile_id=offset_tile_id,
        x=tile.x,
        y=offset_row * geometry.tile_height,
        source_tsx=tile.source_tsx,
        source_image=tile.source_image,
        image_path=tile.image_path,
    )


def build_composite(tile_map: dict[str, SourceTile], tile_width: int, tile_height: int) -> Image.Image:
    composite = Image.new('RGBA', (tile_width * 2, tile_height * 2), (0, 0, 0, 0))
    positions = {
        'top_left': (0, 0),
        'top_right': (tile_width, 0),
        'bottom_left': (0, tile_height),
        'bottom_right': (tile_width, tile_height),
    }
    for quadrant_name, tile in tile_map.items():
        composite.paste(crop_source_tile(tile, tile_width, tile_height), positions[quadrant_name])
    return composite


def build_atlas(recipes: dict[str, list[list[str]]], waterfall_lookup: dict[tuple[str, str, str, str], list[SourceTile]], rocks_lookup: dict[tuple[str, str, str, str], list[SourceTile]], waterfall_geometry: TilesetGeometry, tile_width: int, tile_height: int) -> tuple[Image.Image, list[dict[str, object]]]:
    tiles_per_frame_row_count = (len(ATLAS_LAYOUT) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas_rows = tiles_per_frame_row_count * FRAME_COUNT
    atlas = Image.new('RGBA', (tile_width * 2 * ATLAS_COLUMNS, tile_height * 2 * atlas_rows), (0, 0, 0, 0))
    manifest_tiles: list[dict[str, object]] = []
    picker = SignaturePicker()
    waterfall_tiles_by_id = build_waterfall_tile_index(waterfall_lookup)
    selected_tiles_by_name: dict[str, dict[str, SourceTile]] = {}

    base_tile_maps: list[tuple[str, dict[str, tuple[str, str, str, str]], dict[str, SourceTile], list[list[str]]]] = []
    for tile_name in ATLAS_LAYOUT:
        grid = recipes[tile_name]
        signatures = quadrant_signatures(grid)
        duplicate_source_name = DUPLICATE_TILE_SOURCES.get(tile_name)
        if duplicate_source_name is not None:
            selected_tiles = selected_tiles_by_name[duplicate_source_name].copy()
        else:
            selected_tiles = {
                quadrant_name: (
                    pick_overridden_tile(tile_name, quadrant_name, signature, waterfall_tiles_by_id)
                    or pick_source_tile(signature, waterfall_lookup, rocks_lookup, picker)
                )
                for quadrant_name, signature in signatures.items()
            }

        selected_tiles_by_name[tile_name] = selected_tiles.copy()
        base_tile_maps.append((tile_name, signatures, selected_tiles, grid))

    for frame_index in range(FRAME_COUNT):
        for tile_index, (tile_name, signatures, base_selected_tiles, grid) in enumerate(base_tile_maps):
            selected_tiles = {
                quadrant_name: offset_waterfall_tile(tile, frame_index, waterfall_geometry)
                for quadrant_name, tile in base_selected_tiles.items()
            }
            composite = build_composite(selected_tiles, tile_width, tile_height)

            atlas_index = frame_index * len(ATLAS_LAYOUT) + tile_index
            atlas_column = tile_index % ATLAS_COLUMNS
            atlas_row = frame_index * tiles_per_frame_row_count + (tile_index // ATLAS_COLUMNS)
            atlas_x = atlas_column * tile_width * 2
            atlas_y = atlas_row * tile_height * 2
            atlas.paste(composite, (atlas_x, atlas_y))

            manifest_tiles.append(
                {
                    'name': tile_name,
                    'frameIndex': frame_index,
                    'atlasIndex': atlas_index,
                    'atlasPosition': {'x': atlas_x, 'y': atlas_y},
                    'grid3x3': grid,
                    'quadrants': {
                        quadrant_name: {
                            'signature': list(signatures[quadrant_name]),
                            'sourceTsx': tile.source_tsx,
                            'sourceImage': tile.source_image,
                            'tileId': tile.tile_id,
                            'x': tile.x,
                            'y': tile.y,
                        }
                        for quadrant_name, tile in selected_tiles.items()
                    },
                    'waterfallQuadrants': [
                        {
                            'quadrant': quadrant_name,
                            'tileId': tile.tile_id,
                            'x': tile.x,
                            'y': tile.y,
                        }
                        for quadrant_name, tile in selected_tiles.items()
                        if tile.source_tsx == os.path.basename(DEFAULT_WATERFALL_TSX)
                    ],
                }
            )

    return atlas, manifest_tiles


def write_tsx(tile_count: int, atlas_width: int, atlas_height: int) -> None:
    root = ET.Element(
        'tileset',
        {
            'version': '1.10',
            'tiledversion': '1.11.2',
            'name': 'waterfall_special_32x32',
            'tilewidth': '32',
            'tileheight': '32',
            'tilecount': str(tile_count),
            'columns': str(ATLAS_COLUMNS),
        },
    )
    ET.SubElement(
        root,
        'image',
        {
            'source': os.path.basename(OUTPUT_PNG),
            'width': str(atlas_width),
            'height': str(atlas_height),
        },
    )

    for frame_index in range(FRAME_COUNT):
        for tile_index, tile_name in enumerate(ATLAS_LAYOUT):
            atlas_index = frame_index * len(ATLAS_LAYOUT) + tile_index
            tile_element = ET.SubElement(root, 'tile', {'id': str(atlas_index)})
            properties = ET.SubElement(tile_element, 'properties')
            ET.SubElement(properties, 'property', {'name': 'name', 'value': tile_name})
            ET.SubElement(properties, 'property', {'name': 'frameIndex', 'value': str(frame_index)})
            ET.SubElement(properties, 'property', {'name': 'manifest', 'value': os.path.basename(OUTPUT_MANIFEST)})

            if frame_index == 0:
                animation = ET.SubElement(tile_element, 'animation')
                for animation_frame_index in range(FRAME_COUNT):
                    ET.SubElement(
                        animation,
                        'frame',
                        {
                            'tileid': str(animation_frame_index * len(ATLAS_LAYOUT) + tile_index),
                            'duration': str(FRAME_DURATION_MS),
                        },
                    )

    tree = ET.ElementTree(root)
    ET.indent(tree, space=' ', level=0)
    tree.write(OUTPUT_TSX, encoding='UTF-8', xml_declaration=True)


def write_preview_html(frame_width: int, frame_height: int) -> None:
    preview_html = f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>Waterfall Preview</title>
    <style>
        :root {{
            color-scheme: light;
            --paper: #f3efe4;
            --ink: #1d2a2f;
            --accent: #2a8db8;
            --panel: #fffaf0;
        }}

        body {{
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
                radial-gradient(circle at top, rgba(42, 141, 184, 0.18), transparent 35%),
                linear-gradient(180deg, #e4dfd2 0%, var(--paper) 100%);
            color: var(--ink);
            font-family: Georgia, 'Times New Roman', serif;
        }}

        main {{
            display: grid;
            gap: 12px;
            justify-items: center;
            padding: 24px;
            border: 1px solid rgba(29, 42, 47, 0.12);
            background: rgba(255, 250, 240, 0.9);
            box-shadow: 0 16px 40px rgba(29, 42, 47, 0.14);
        }}

        canvas {{
            width: {frame_width * 4}px;
            height: {frame_height * 4}px;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            border: 2px solid rgba(29, 42, 47, 0.18);
            background: #000;
        }}

        p {{
            margin: 0;
            font-size: 14px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }}
    </style>
</head>
<body>
    <main>
        <canvas id=\"preview\" width=\"{frame_width}\" height=\"{frame_height}\"></canvas>
        <p id=\"label\">Frame 1 / {FRAME_COUNT}</p>
    </main>
    <script>
        const frameCount = {FRAME_COUNT};
        const frameDurationMs = {FRAME_DURATION_MS};
        const frameWidth = {frame_width};
        const frameHeight = {frame_height};
        const image = new Image();
        const canvas = document.getElementById('preview');
        const label = document.getElementById('label');
        const context = canvas.getContext('2d');
        let frameIndex = 0;

        function drawFrame() {{
            context.clearRect(0, 0, frameWidth, frameHeight);
            context.drawImage(image, 0, frameIndex * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            label.textContent = `Frame ${'{'}frameIndex + 1{'}'} / {FRAME_COUNT}`;
        }}

        image.addEventListener('load', () => {{
            drawFrame();
            window.setInterval(() => {{
                frameIndex = (frameIndex + 1) % frameCount;
                drawFrame();
            }}, frameDurationMs);
        }});

        image.src = '{os.path.basename(OUTPUT_PNG)}';
    </script>
</body>
</html>
"""

    with open(OUTPUT_PREVIEW_HTML, 'w', encoding='utf-8') as preview_file:
        preview_file.write(preview_html)


def main() -> None:
    waterfall_lookup, waterfall_geometry = parse_corner_wang_tileset(DEFAULT_WATERFALL_TSX)
    rocks_lookup, rocks_geometry = parse_corner_wang_tileset(DEFAULT_ROCKS_TSX, normalise_xml=True)
    if (waterfall_geometry.tile_width, waterfall_geometry.tile_height) != (rocks_geometry.tile_width, rocks_geometry.tile_height):
        raise ValueError('Waterfall and Rocks tilesets must use the same source tile size.')
    if waterfall_geometry.rows % SOURCE_FRAME_HEIGHT_TILES != 0:
        raise ValueError('Waterfall source image height must be an exact multiple of the frame height.')
    available_frame_count = waterfall_geometry.rows // SOURCE_FRAME_HEIGHT_TILES
    if available_frame_count < FRAME_COUNT:
        raise ValueError(f'Waterfall source image only contains {available_frame_count} animation frames, but {FRAME_COUNT} are required.')

    recipes = build_base_recipes()
    atlas, manifest_tiles = build_atlas(
        recipes,
        waterfall_lookup,
        rocks_lookup,
        waterfall_geometry,
        waterfall_geometry.tile_width,
        waterfall_geometry.tile_height,
    )
    atlas.save(OUTPUT_PNG)

    with open(OUTPUT_MANIFEST, 'w', encoding='utf-8') as manifest_file:
        json.dump(
            {
                'waterfallTsx': os.path.basename(DEFAULT_WATERFALL_TSX),
                'rocksTsx': os.path.basename(DEFAULT_ROCKS_TSX),
                'atlasImage': os.path.basename(OUTPUT_PNG),
                'previewHtml': os.path.basename(OUTPUT_PREVIEW_HTML),
                'frameCount': FRAME_COUNT,
                'sourceFrameHeightTiles': SOURCE_FRAME_HEIGHT_TILES,
                'frameDurationMs': FRAME_DURATION_MS,
                'tiles': manifest_tiles,
            },
            manifest_file,
            indent=2,
        )

    write_tsx(len(ATLAS_LAYOUT) * FRAME_COUNT, atlas.width, atlas.height)
    write_preview_html(atlas.width, atlas.height // FRAME_COUNT)

    print(f'Wrote {OUTPUT_PNG}')
    print(f'Wrote {OUTPUT_TSX}')
    print(f'Wrote {OUTPUT_MANIFEST}')
    print(f'Wrote {OUTPUT_PREVIEW_HTML}')


if __name__ == '__main__':
    main()