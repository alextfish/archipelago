"""
Build 32x32 edge-Wang composite tiles from a 16x16 corner-Wang source tileset.

This script reads a corner-Wang TSX, finds valid 2x2 composite arrangements of
the source 16x16 tiles, and writes:
  - a 32x32 composite PNG tileset
  - a matching edge-Wang TSX

The output edge signature is defined by the four side midpoints of a 3x3 corner
grid. This allows a corner-Wang source set to drive an edge-Wang output set.

This version intentionally constrains each run to terrain-vs-nothing binaries.
For each selected terrain, every 3x3 corner point in the composite is forced to
either that terrain or 0, which avoids leaking other terrain colours or leaving
underconstrained gaps in the middle.

Usage:
  python generate_corner_wang_edge_composites.py
  python generate_corner_wang_edge_composites.py --tsx CraftpixGrass.tsx
  python generate_corner_wang_edge_composites.py --tsx CraftpixGrass.tsx --variants 5 --seed 7
    python generate_corner_wang_edge_composites.py --tsx CraftpixGrass.tsx --terrain-ids 1 3
    python generate_corner_wang_edge_composites.py --tsx CraftpixGrass.tsx other_image.png
"""

from __future__ import annotations

import argparse
import os
import random
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from itertools import product

from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TSX = os.path.join(SCRIPT_DIR, 'CraftpixGrass.tsx')
OUTPUT_SUFFIX = '_32x32_edge_wang.png'
TSX_OUTPUT_SUFFIX = '_32x32_edge_wang.tsx'
DEFAULT_VARIANTS = 5
DEFAULT_RETRY_COUNT = 24

CornerSignature = tuple[int, int, int, int]
EdgeSignature = tuple[int, int, int, int]
TileChoice = tuple[int | None, int | None, int | None, int | None]
QuadrantSignatureChoice = tuple[CornerSignature, CornerSignature, CornerSignature, CornerSignature]


@dataclass(frozen=True)
class TilesetMeta:
    columns: int
    tile_count: int
    tile_width: int
    tile_height: int
    image_source: str


@dataclass(frozen=True)
class WangColour:
    wang_id: int
    name: str
    colour: str
    probability: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        'images',
        nargs='*',
        help='Optional source PNGs to process. Defaults to the image referenced by the TSX.',
    )
    parser.add_argument(
        '--tsx',
        default=DEFAULT_TSX,
        help='Corner-Wang TSX to use as the source of truth.',
    )
    parser.add_argument(
        '--seed',
        type=int,
        default=0,
        help='Base seed used for repeatable random selection.',
    )
    parser.add_argument(
        '--variants',
        type=int,
        default=DEFAULT_VARIANTS,
        help='How many 32x32 variants to generate for each edge signature.',
    )
    parser.add_argument(
        '--output-dir',
        default=SCRIPT_DIR,
        help='Directory for the generated PNG and TSX output.',
    )
    parser.add_argument(
        '--terrain-ids',
        nargs='*',
        type=int,
        default=[1, 3],
        help='Source Wang colour IDs to generate as terrain-vs-nothing outputs. Defaults to rock and mud in CraftpixGrass.',
    )
    parser.add_argument(
        '--include-unsolved',
        action='store_true',
        help='Include unsolved binary edge signatures as blank rows. By default only solved rows are emitted to save space.',
    )
    return parser.parse_args()


def resolve_image_path(base_dir: str, image_name: str) -> str:
    if os.path.isabs(image_name):
        return image_name
    return os.path.normpath(os.path.join(base_dir, image_name))


def parse_source_tileset(tsx_path: str) -> tuple[TilesetMeta, list[WangColour], dict[CornerSignature, list[int]]]:
    root = ET.parse(tsx_path).getroot()
    image = root.find('image')
    if image is None:
        raise ValueError('TSX is missing an <image> element.')

    wangset = root.find('./wangsets/wangset')
    if wangset is None:
        raise ValueError('TSX is missing a <wangset>.')
    if wangset.attrib.get('type') != 'corner':
        raise ValueError('This script expects a corner-Wang source tileset.')

    colours: list[WangColour] = []
    for index, wangcolour in enumerate(wangset.findall('wangcolor'), start=1):
        colours.append(
            WangColour(
                wang_id=index,
                name=wangcolour.attrib.get('name', f'colour{index}'),
                colour=wangcolour.attrib.get('color', '#ffffff'),
                probability=wangcolour.attrib.get('probability', '1'),
            )
        )

    lookup: dict[CornerSignature, list[int]] = defaultdict(list)
    for wangtile in wangset.findall('wangtile'):
        tile_id = int(wangtile.attrib['tileid'])
        values = [int(value) for value in wangtile.attrib['wangid'].split(',')]

        # Corner Wang IDs are stored at positions 1,3,5,7 in the order
        # top-right, bottom-right, bottom-left, top-left.
        signature = (values[7], values[1], values[3], values[5])
        lookup[signature].append(tile_id)

    for tile_ids in lookup.values():
        tile_ids.sort()

    return (
        TilesetMeta(
            columns=int(root.attrib['columns']),
            tile_count=int(root.attrib['tilecount']),
            tile_width=int(root.attrib['tilewidth']),
            tile_height=int(root.attrib['tileheight']),
            image_source=image.attrib['source'],
        ),
        colours,
        dict(lookup),
    )


def discover_images(explicit_images: list[str], tsx_path: str, meta: TilesetMeta) -> list[str]:
    tsx_dir = os.path.dirname(os.path.abspath(tsx_path))
    if explicit_images:
        return [resolve_image_path(tsx_dir, image_name) for image_name in explicit_images]
    return [resolve_image_path(tsx_dir, meta.image_source)]


def build_tile_cache(source_image: Image.Image, meta: TilesetMeta) -> dict[int, Image.Image]:
    cache: dict[int, Image.Image] = {}
    for tile_id in range(meta.tile_count):
        x = (tile_id % meta.columns) * meta.tile_width
        y = (tile_id // meta.columns) * meta.tile_height
        cache[tile_id] = source_image.crop((x, y, x + meta.tile_width, y + meta.tile_height))
    return cache


def iter_edge_signatures(palette: list[int]) -> list[EdgeSignature]:
    return list(product(palette, repeat=4))


def build_strict_binary_points(edge_signature: EdgeSignature, terrain_id: int) -> tuple[int, int, int, int, int, int, int, int, int]:
    top, right, bottom, left = edge_signature

    def is_terrain(value: int) -> bool:
        return value == terrain_id

    return (
        terrain_id if is_terrain(top) and is_terrain(left) else 0,
        top,
        terrain_id if is_terrain(top) and is_terrain(right) else 0,
        left,
        terrain_id if any(is_terrain(value) for value in edge_signature) else 0,
        right,
        terrain_id if is_terrain(bottom) and is_terrain(left) else 0,
        bottom,
        terrain_id if is_terrain(bottom) and is_terrain(right) else 0,
    )


def build_strict_binary_signature_set(edge_signature: EdgeSignature, terrain_id: int) -> QuadrantSignatureChoice:
    top_left, top_centre, top_right, centre_left, centre_centre, centre_right, bottom_left, bottom_centre, bottom_right = build_strict_binary_points(edge_signature, terrain_id)
    return (
        (top_left, top_centre, centre_centre, centre_left),
        (top_centre, top_right, centre_right, centre_centre),
        (centre_left, centre_centre, bottom_centre, bottom_left),
        (centre_centre, centre_right, bottom_right, bottom_centre),
    )


def choose_tile_ids(
    signature_set: QuadrantSignatureChoice,
    lookup: dict[CornerSignature, list[int]],
    rng: random.Random,
) -> TileChoice:
    chosen: list[int | None] = [None, None, None, None]
    positions_by_signature: dict[CornerSignature, list[int]] = defaultdict(list)

    for index, signature in enumerate(signature_set):
        positions_by_signature[signature].append(index)

    for signature, positions in positions_by_signature.items():
        source_tiles = lookup[signature]
        if len(source_tiles) >= len(positions):
            selected = rng.sample(source_tiles, len(positions))
        else:
            selected = source_tiles[:]
            rng.shuffle(selected)
            while len(selected) < len(positions):
                selected.append(rng.choice(source_tiles))

        for position, tile_id in zip(positions, selected):
            chosen[position] = tile_id

    return tuple(chosen)


def generate_variants_for_edge_signature(
    edge_signature: EdgeSignature,
    variant_count: int,
    terrain_id: int,
    lookup: dict[CornerSignature, list[int]],
    rng: random.Random,
) -> list[TileChoice]:
    if edge_signature == (0, 0, 0, 0):
        return [(None, None, None, None) for _ in range(variant_count)]

    signature_set = build_strict_binary_signature_set(edge_signature, terrain_id)
    if not all(signature in lookup for signature in signature_set):
        return []

    variants: list[TileChoice] = []
    seen: set[TileChoice] = set()

    for _ in range(variant_count):
        chosen = choose_tile_ids(signature_set, lookup, rng)
        for _retry in range(DEFAULT_RETRY_COUNT):
            if chosen not in seen:
                break
            chosen = choose_tile_ids(signature_set, lookup, rng)
        variants.append(chosen)
        seen.add(chosen)

    return variants


def create_composite(
    tile_ids: TileChoice,
    cache: dict[int, Image.Image],
    tile_width: int,
    tile_height: int,
) -> Image.Image:
    composite = Image.new('RGBA', (tile_width * 2, tile_height * 2), (0, 0, 0, 0))
    positions = ((0, 0), (tile_width, 0), (0, tile_height), (tile_width, tile_height))

    for tile_id, (x, y) in zip(tile_ids, positions):
        if tile_id is None:
            continue
        composite.paste(cache[tile_id], (x, y))

    return composite


def edge_signature_to_wangid(edge_signature: EdgeSignature) -> str:
    top, right, bottom, left = edge_signature
    return f'{top},0,{right},0,{bottom},0,{left},0'


def output_png_path_for_image(image_path: str, output_dir: str, terrain_name: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}_{terrain_name}{OUTPUT_SUFFIX}')


def output_tsx_path_for_image(image_path: str, output_dir: str, terrain_name: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}_{terrain_name}{TSX_OUTPUT_SUFFIX}')


def build_output_sheet(
    source_image_path: str,
    output_path: str,
    edge_signatures: list[EdgeSignature],
    variants_by_signature: dict[EdgeSignature, list[TileChoice]],
    meta: TilesetMeta,
    cache: dict[int, Image.Image],
    variant_count: int,
) -> None:
    sheet = Image.new(
        'RGBA',
        (meta.tile_width * 2 * variant_count, meta.tile_height * 2 * len(edge_signatures)),
        (0, 0, 0, 0),
    )

    for row_index, edge_signature in enumerate(edge_signatures):
        for column_index, tile_ids in enumerate(variants_by_signature.get(edge_signature, [])):
            composite = create_composite(tile_ids, cache, meta.tile_width, meta.tile_height)
            sheet.paste(
                composite,
                (column_index * meta.tile_width * 2, row_index * meta.tile_height * 2),
            )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sheet.save(output_path)


def build_output_tsx(
    tsx_path: str,
    png_path: str,
    edge_signatures: list[EdgeSignature],
    variants_by_signature: dict[EdgeSignature, list[TileChoice]],
    colours: list[WangColour],
    meta: TilesetMeta,
    variant_count: int,
    wangset_name: str,
) -> None:
    tile_width = meta.tile_width * 2
    tile_height = meta.tile_height * 2
    tile_count = len(edge_signatures) * variant_count
    image_width = tile_width * variant_count
    image_height = tile_height * len(edge_signatures)

    root = ET.Element(
        'tileset',
        {
            'version': '1.10',
            'tiledversion': '1.11.2',
            'name': os.path.splitext(os.path.basename(tsx_path))[0],
            'tilewidth': str(tile_width),
            'tileheight': str(tile_height),
            'tilecount': str(tile_count),
            'columns': str(variant_count),
        },
    )
    ET.SubElement(
        root,
        'image',
        {
            'source': os.path.basename(png_path),
            'width': str(image_width),
            'height': str(image_height),
        },
    )

    wangsets = ET.SubElement(root, 'wangsets')
    wangset = ET.SubElement(
        wangsets,
        'wangset',
        {
            'name': wangset_name,
            'type': 'edge',
            'tile': '-1',
        },
    )
    for colour in colours:
        ET.SubElement(
            wangset,
            'wangcolor',
            {
                'name': colour.name,
                'color': colour.colour,
                'tile': '-1',
                'probability': colour.probability,
            },
        )

    for row_index, edge_signature in enumerate(edge_signatures):
        if edge_signature == (0, 0, 0, 0):
            continue
        variants = variants_by_signature.get(edge_signature, [])
        for column_index, _tile_ids in enumerate(variants):
            tile_id = row_index * variant_count + column_index
            ET.SubElement(
                wangset,
                'wangtile',
                {
                    'tileid': str(tile_id),
                    'wangid': edge_signature_to_wangid(edge_signature),
                },
            )

    tree = ET.ElementTree(root)
    ET.indent(tree, space=' ', level=0)
    tree.write(tsx_path, encoding='UTF-8', xml_declaration=True)


def main() -> None:
    args = parse_args()
    tsx_path = os.path.abspath(args.tsx)
    meta, colours, lookup = parse_source_tileset(tsx_path)
    image_paths = discover_images(args.images, tsx_path, meta)
    wangset_name = os.path.splitext(os.path.basename(tsx_path))[0]
    colour_by_id = {colour.wang_id: colour for colour in colours}
    terrain_ids: list[int] = []
    for terrain_id in args.terrain_ids:
        if terrain_id not in colour_by_id:
            raise ValueError(f'Unknown terrain ID {terrain_id}. Available IDs: {sorted(colour_by_id)}')
        if terrain_id not in terrain_ids:
            terrain_ids.append(terrain_id)

    print(f'Using corner-Wang TSX metadata from: {tsx_path}')
    print('Output edge signatures are strict binary terrain-vs-nothing masks in URDL order.')

    for image_path in image_paths:
        source_image = Image.open(image_path).convert('RGBA')
        cache = build_tile_cache(source_image, meta)
        for terrain_id in terrain_ids:
            terrain = colour_by_id[terrain_id]
            rng = random.Random(
                f'{args.seed}:{os.path.basename(image_path)}:{os.path.basename(tsx_path)}:{terrain_id}'
            )
            terrain_edge_signatures = iter_edge_signatures([0, terrain_id])
            variants_by_signature: dict[EdgeSignature, list[TileChoice]] = {}

            for edge_signature in terrain_edge_signatures:
                variants = generate_variants_for_edge_signature(
                    edge_signature=edge_signature,
                    variant_count=args.variants,
                    terrain_id=terrain_id,
                    lookup=lookup,
                    rng=rng,
                )
                if variants:
                    variants_by_signature[edge_signature] = variants

            edge_signatures = terrain_edge_signatures
            if not args.include_unsolved:
                edge_signatures = [
                    edge_signature for edge_signature in terrain_edge_signatures
                    if edge_signature in variants_by_signature
                ]

            png_path = output_png_path_for_image(image_path, args.output_dir, terrain.name)
            tsx_output_path = output_tsx_path_for_image(image_path, args.output_dir, terrain.name)
            build_output_sheet(
                source_image_path=image_path,
                output_path=png_path,
                edge_signatures=edge_signatures,
                variants_by_signature=variants_by_signature,
                meta=meta,
                cache=cache,
                variant_count=args.variants,
            )
            build_output_tsx(
                tsx_path=tsx_output_path,
                png_path=png_path,
                edge_signatures=edge_signatures,
                variants_by_signature=variants_by_signature,
                colours=colours,
                meta=meta,
                variant_count=args.variants,
                wangset_name=wangset_name,
            )

            solvable_count = sum(1 for edge_signature in terrain_edge_signatures if edge_signature in variants_by_signature)
            print(
                f'  OK: {os.path.basename(image_path)} [{terrain.name}] -> {png_path} and {tsx_output_path} '
                f'({solvable_count}/{len(terrain_edge_signatures)} binary edge signatures solvable)'
            )


if __name__ == '__main__':
    main()