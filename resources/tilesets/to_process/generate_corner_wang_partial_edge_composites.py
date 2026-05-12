"""
Build 32x32 edge-Wang composite tiles from a 16x16 corner-Wang source tileset
using a constrained multi-label solver.

This sits between the two existing approaches:
  - stricter than the fully free corner solver, because internal corner labels are
        limited to 0 plus labels already present on the output edge signature, and
        the four outer composite corners and centre corner are fixed from adjacent edge labels
  - looser than the strict binary terrain-vs-nothing solver, because it allows
    multiple non-zero labels in the same composite when the source art uses them

By default this script emits only the solvable output rows. It is intended for
tilesets such as Rocks.tsx where the source corner palette has semantic ordering
constraints and cannot realise the full cartesian product.
"""

from __future__ import annotations

import argparse
import os
import random
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from itertools import product

from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TSX = os.path.join(SCRIPT_DIR, 'Rocks.tsx')
OUTPUT_SUFFIX = '_32x32_partial_edge_wang.png'
TSX_OUTPUT_SUFFIX = '_32x32_partial_edge_wang.tsx'
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
        help='How many 32x32 variants to generate for each solvable edge signature.',
    )
    parser.add_argument(
        '--output-dir',
        default=SCRIPT_DIR,
        help='Directory for the generated PNG and TSX output.',
    )
    parser.add_argument(
        '--include-unsolved',
        action='store_true',
        help='Include unsolved rows as blanks. By default only solvable rows are emitted.',
    )
    return parser.parse_args()


def normalise_tiled_xml(text: str) -> str:
    return re.sub(r'<\?\s*xml\s+version\s*=\s*"([^"]+)"\s+encoding\s*=\s*"([^"]+)"\s*\?>', r'<?xml version="\1" encoding="\2"?>', text, count=1)


def resolve_image_path(base_dir: str, image_name: str) -> str:
    if os.path.isabs(image_name):
        return image_name
    return os.path.normpath(os.path.join(base_dir, image_name))


def parse_source_tileset(tsx_path: str) -> tuple[TilesetMeta, list[WangColour], dict[CornerSignature, list[int]]]:
    text = normalise_tiled_xml(open(tsx_path, 'r', encoding='utf-8').read())
    root = ET.fromstring(text)
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


def is_allowed_edge_signature(edge_signature: EdgeSignature) -> bool:
    top, _right, bottom, _left = edge_signature

    # Domain-specific ordering for Rocks.tsx-style top/side cliffs:
    # side is never above top, and top is never directly above nothing.
    if top == 2 and bottom == 1:
        return False
    if top == 1 and bottom == 0:
        return False
    return True


def build_quadrant_signatures(
    edge_signature: EdgeSignature,
    free_corners: tuple[int, int, int, int, int],
) -> QuadrantSignatureChoice:
    top, right, bottom, left = edge_signature
    top_left_corner, top_right_corner, centre_corner, bottom_left_corner, bottom_right_corner = free_corners

    return (
        (top_left_corner, top, centre_corner, left),
        (top, top_right_corner, right, centre_corner),
        (left, centre_corner, bottom, bottom_left_corner),
        (centre_corner, right, bottom_right_corner, bottom),
    )


def compute_candidate_signature_sets(
    edge_signature: EdgeSignature,
    lookup: dict[CornerSignature, list[int]],
) -> list[QuadrantSignatureChoice]:
    candidates: list[QuadrantSignatureChoice] = []
    seen: set[QuadrantSignatureChoice] = set()

    top, right, bottom, left = edge_signature
    fixed_top_left = min(top, left)
    fixed_top_right = min(top, right)
    fixed_bottom_left = min(bottom, left)
    fixed_bottom_right = min(bottom, right)

    centre_neighbours = [value for value in (bottom, right, left) if value > 0]
    fixed_centre = min(centre_neighbours) if centre_neighbours else 0

    free_corners = (
        fixed_top_left,
        fixed_top_right,
        fixed_centre,
        fixed_bottom_left,
        fixed_bottom_right,
    )
    signature_set = build_quadrant_signatures(edge_signature, free_corners)
    if all(signature in lookup for signature in signature_set) and signature_set not in seen:
        seen.add(signature_set)
        candidates.append(signature_set)

    return candidates


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
    lookup: dict[CornerSignature, list[int]],
    rng: random.Random,
) -> list[TileChoice]:
    candidate_signature_sets = compute_candidate_signature_sets(edge_signature, lookup)
    if not candidate_signature_sets:
        return []

    variants: list[TileChoice] = []
    seen: set[TileChoice] = set()

    for _ in range(variant_count):
        signature_set = rng.choice(candidate_signature_sets)
        chosen = choose_tile_ids(signature_set, lookup, rng)
        for _retry in range(DEFAULT_RETRY_COUNT):
            if chosen not in seen:
                break
            signature_set = rng.choice(candidate_signature_sets)
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


def output_png_path_for_image(image_path: str, output_dir: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}{OUTPUT_SUFFIX}')


def output_tsx_path_for_image(image_path: str, output_dir: str) -> str:
    stem, _ = os.path.splitext(os.path.basename(image_path))
    return os.path.join(output_dir, f'{stem}{TSX_OUTPUT_SUFFIX}')


def build_output_sheet(
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
            sheet.paste(composite, (column_index * meta.tile_width * 2, row_index * meta.tile_height * 2))

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
    palette = [0] + [colour.wang_id for colour in colours]
    all_edge_signatures = [edge_signature for edge_signature in iter_edge_signatures(palette) if is_allowed_edge_signature(edge_signature)]

    print(f'Using corner-Wang TSX metadata from: {tsx_path}')
    print('Output edge signatures use constrained exact-label solving with only edge labels plus 0 allowed internally.')

    for image_path in image_paths:
        source_image = Image.open(image_path).convert('RGBA')
        cache = build_tile_cache(source_image, meta)
        rng = random.Random(f'{args.seed}:{os.path.basename(image_path)}:{os.path.basename(tsx_path)}')
        variants_by_signature: dict[EdgeSignature, list[TileChoice]] = {}

        for edge_signature in all_edge_signatures:
            variants = generate_variants_for_edge_signature(
                edge_signature=edge_signature,
                variant_count=args.variants,
                lookup=lookup,
                rng=rng,
            )
            if variants:
                variants_by_signature[edge_signature] = variants

        edge_signatures = all_edge_signatures
        if not args.include_unsolved:
            edge_signatures = [edge_signature for edge_signature in all_edge_signatures if edge_signature in variants_by_signature]

        png_path = output_png_path_for_image(image_path, args.output_dir)
        tsx_output_path = output_tsx_path_for_image(image_path, args.output_dir)
        build_output_sheet(
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

        print(
            f'  OK: {os.path.basename(image_path)} -> {png_path} and {tsx_output_path} '
            f'({len(variants_by_signature)}/{len(all_edge_signatures)} constrained edge signatures solvable)'
        )


if __name__ == '__main__':
    main()