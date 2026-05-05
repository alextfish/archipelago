"""
Build 32x32 composite Wang tilesheets from the 16x16 road source sheets.

The source TSX defines the four exposed edges for each 16x16 tile. This script
uses those masks to assemble 2x2 composites whose outer edges match each of the
16 possible road/empty combinations. Empty quadrants are rendered as fully
transparent 16x16 squares.

Usage:
  python generate_wang_composites.py
  python generate_wang_composites.py Road1.png --seed 7 --variants 5
  python generate_wang_composites.py --all --seed 42 --output-dir output
"""

from __future__ import annotations

import argparse
import os
import random
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass

from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TSX = os.path.join(SCRIPT_DIR, 'Road1.tsx')
OUTPUT_SUFFIX = '_32x32_wang.png'
TSX_OUTPUT_SUFFIX = '_32x32_wang.tsx'
EMPTY_MASK = '0000'
DEFAULT_VARIANTS = 5
DEFAULT_RETRY_COUNT = 24


@dataclass(frozen=True)
class TilesetMeta:
    columns: int
    tile_count: int
    tile_width: int
    tile_height: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        'images',
        nargs='*',
        help='Input PNGs to process. Defaults to every PNG in this directory.',
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Process every source PNG in this directory.',
    )
    parser.add_argument(
        '--tsx',
        default=DEFAULT_TSX,
        help='TSX file that contains the Wang metadata. Defaults to Road1.tsx.',
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
        help='How many 32x32 variants to generate for each macro mask.',
    )
    parser.add_argument(
        '--output-dir',
        default=SCRIPT_DIR,
        help='Directory for the generated tilesheets.',
    )
    return parser.parse_args()


def discover_images(explicit_images: list[str], process_all: bool) -> list[str]:
    if explicit_images:
        return [resolve_image_path(name) for name in explicit_images]

    if not process_all:
        process_all = True

    if process_all:
        paths: list[str] = []
        for entry in sorted(os.listdir(SCRIPT_DIR)):
            lower_name = entry.lower()
            if not lower_name.endswith('.png'):
                continue
            if lower_name.endswith(OUTPUT_SUFFIX.lower()):
                continue
            paths.append(os.path.join(SCRIPT_DIR, entry))
        return paths

    return []


def resolve_image_path(name: str) -> str:
    if os.path.isabs(name):
        return name
    return os.path.join(SCRIPT_DIR, name)


def parse_tileset_meta(tsx_path: str) -> TilesetMeta:
    root = ET.parse(tsx_path).getroot()
    return TilesetMeta(
        columns=int(root.attrib['columns']),
        tile_count=int(root.attrib['tilecount']),
        tile_width=int(root.attrib['tilewidth']),
        tile_height=int(root.attrib['tileheight']),
    )


def parse_wang_lookup(tsx_path: str) -> dict[str, list[int]]:
    root = ET.parse(tsx_path).getroot()
    candidates: dict[str, list[int]] = defaultdict(list)
    for wangtile in root.findall('.//wangtile'):
        tile_id = int(wangtile.attrib['tileid'])
        wang_values = [int(value) for value in wangtile.attrib['wangid'].split(',')]
        mask = ''.join(str(wang_values[index]) for index in (0, 2, 4, 6))
        candidates[mask].append(tile_id)

    for tile_ids in candidates.values():
        tile_ids.sort()

    return dict(candidates)


def iter_macro_masks() -> list[str]:
    masks: list[str] = []
    for up in (0, 1):
        for right in (0, 1):
            for down in (0, 1):
                for left in (0, 1):
                    masks.append(f'{up}{right}{down}{left}')
    return masks


EXPLICIT_MACRO_RECIPES: dict[str, tuple[str, str, str, str]] = {
    '1010': ('1110', '1011', '1110', '1011'),
    '0101': ('0111', '0111', '1101', '1101'),
}


def choose_internal_seams(mask: str) -> tuple[int, int, int, int]:
    up, right, down, left = (int(value) for value in mask)
    exit_count = up + right + down + left

    if exit_count == 0:
        return 0, 0, 0, 0

    if exit_count in (1, 3, 4):
        return 1, 1, 1, 1

    if up and down:
        return 0, 0, 1, 1

    if right and left:
        return 1, 1, 0, 0

    return up, down, left, right


def expand_macro_mask(mask: str) -> tuple[str, str, str, str]:
    explicit_recipe = EXPLICIT_MACRO_RECIPES.get(mask)
    if explicit_recipe is not None:
        return explicit_recipe

    up, right, down, left = (int(value) for value in mask)
    seam_top, seam_bottom, seam_left, seam_right = choose_internal_seams(mask)

    return (
        f'{up}{seam_top}{seam_left}{left}',
        f'{up}{right}{seam_right}{seam_top}',
        f'{seam_left}{seam_bottom}{down}{left}',
        f'{seam_right}{right}{down}{seam_bottom}',
    )


def build_tile_cache(source_image: Image.Image, meta: TilesetMeta) -> dict[int, Image.Image]:
    cache: dict[int, Image.Image] = {}
    for tile_id in range(meta.tile_count):
        x = (tile_id % meta.columns) * meta.tile_width
        y = (tile_id // meta.columns) * meta.tile_height
        cache[tile_id] = source_image.crop((x, y, x + meta.tile_width, y + meta.tile_height))
    return cache


def choose_tile_ids(
    quadrant_masks: tuple[str, str, str, str],
    lookup: dict[str, list[int]],
    rng: random.Random,
) -> tuple[int | None, int | None, int | None, int | None]:
    chosen: list[int | None] = [None, None, None, None]
    positions_by_mask: dict[str, list[int]] = defaultdict(list)

    for index, mask in enumerate(quadrant_masks):
        if mask == EMPTY_MASK:
            continue
        positions_by_mask[mask].append(index)

    for mask, positions in positions_by_mask.items():
        candidates = lookup.get(mask, [])
        if not candidates:
            raise ValueError(f'No 16x16 source tiles found for Wang mask {mask}.')

        if len(candidates) >= len(positions):
            selected = rng.sample(candidates, len(positions))
        else:
            selected = candidates[:]
            rng.shuffle(selected)
            while len(selected) < len(positions):
                selected.append(rng.choice(candidates))

        for position, tile_id in zip(positions, selected):
            chosen[position] = tile_id

    return tuple(chosen)


def create_composite(
    tile_ids: tuple[int | None, int | None, int | None, int | None],
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


def generate_variants_for_mask(
    mask: str,
    variant_count: int,
    lookup: dict[str, list[int]],
    rng: random.Random,
) -> list[tuple[int | None, int | None, int | None, int | None]]:
    quadrant_masks = expand_macro_mask(mask)
    variants: list[tuple[int | None, int | None, int | None, int | None]] = []
    seen: set[tuple[int | None, int | None, int | None, int | None]] = set()

    for _ in range(variant_count):
        chosen = choose_tile_ids(quadrant_masks, lookup, rng)
        for _retry in range(DEFAULT_RETRY_COUNT):
            if chosen not in seen:
                break
            chosen = choose_tile_ids(quadrant_masks, lookup, rng)
        variants.append(chosen)
        seen.add(chosen)

    return variants


def build_output_sheet(
    source_image_path: str,
    output_path: str,
    meta: TilesetMeta,
    lookup: dict[str, list[int]],
    seed: int,
    variant_count: int,
) -> None:
    source_image = Image.open(source_image_path).convert('RGBA')
    cache = build_tile_cache(source_image, meta)
    sheet = Image.new('RGBA', (meta.tile_width * 2 * variant_count, meta.tile_height * 2 * 16), (0, 0, 0, 0))

    image_name = os.path.basename(source_image_path)
    rng = random.Random(f'{seed}:{image_name}')

    for row_index, macro_mask in enumerate(iter_macro_masks()):
        variants = generate_variants_for_mask(macro_mask, variant_count, lookup, rng)
        for column_index, tile_ids in enumerate(variants):
            composite = create_composite(tile_ids, cache, meta.tile_width, meta.tile_height)
            sheet.paste(
                composite,
                (column_index * meta.tile_width * 2, row_index * meta.tile_height * 2),
            )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sheet.save(output_path)


def mask_to_wangid(mask: str) -> str:
    return f'{mask[0]},0,{mask[1]},0,{mask[2]},0,{mask[3]},0'


def build_output_tsx(
    tsx_path: str,
    image_path: str,
    variant_count: int,
    meta: TilesetMeta,
) -> None:
    tile_width = meta.tile_width * 2
    tile_height = meta.tile_height * 2
    tile_count = len(iter_macro_masks()) * variant_count
    image_width = tile_width * variant_count
    image_height = tile_height * len(iter_macro_masks())

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
            'source': os.path.basename(image_path),
            'width': str(image_width),
            'height': str(image_height),
        },
    )
    wangsets = ET.SubElement(root, 'wangsets')
    wangset = ET.SubElement(
        wangsets,
        'wangset',
        {
            'name': 'Unnamed Set',
            'type': 'edge',
            'tile': '-1',
        },
    )
    ET.SubElement(
        wangset,
        'wangcolor',
        {
            'name': '',
            'color': '#ff0000',
            'tile': '-1',
            'probability': '1',
        },
    )

    for row_index, macro_mask in enumerate(iter_macro_masks()):
        if macro_mask == EMPTY_MASK:
            continue
        for column_index in range(variant_count):
            tile_id = row_index * variant_count + column_index
            ET.SubElement(
                wangset,
                'wangtile',
                {
                    'tileid': str(tile_id),
                    'wangid': mask_to_wangid(macro_mask),
                },
            )

    tree = ET.ElementTree(root)
    ET.indent(tree, space=' ', level=0)
    tree.write(tsx_path, encoding='UTF-8', xml_declaration=True)


def output_path_for_image(image_path: str, output_dir: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}{OUTPUT_SUFFIX}')


def tsx_output_path_for_image(image_path: str, output_dir: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}{TSX_OUTPUT_SUFFIX}')


def main() -> None:
    args = parse_args()
    image_paths = discover_images(args.images, args.all)
    if not image_paths:
        raise SystemExit('No input PNGs found to process.')

    meta = parse_tileset_meta(args.tsx)
    lookup = parse_wang_lookup(args.tsx)

    print(f'Using TSX metadata from: {args.tsx}')
    print('Row order is binary URDL from 0000 to 1111.')

    for image_path in image_paths:
        output_path = output_path_for_image(image_path, args.output_dir)
        tsx_output_path = tsx_output_path_for_image(image_path, args.output_dir)
        build_output_sheet(
            source_image_path=image_path,
            output_path=output_path,
            meta=meta,
            lookup=lookup,
            seed=args.seed,
            variant_count=args.variants,
        )
        build_output_tsx(
            tsx_path=tsx_output_path,
            image_path=output_path,
            variant_count=args.variants,
            meta=meta,
        )
        print(
            f'  OK: {os.path.basename(image_path)} -> {output_path} and {tsx_output_path}'
        )


if __name__ == '__main__':
    main()