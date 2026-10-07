from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


TARGET_SIZE: int = 64


def find_top_non_transparent_row(image: Image.Image) -> int:
    """Return the first row that contains at least one non-transparent pixel."""
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        return 0
    return bounds[1]


def compute_crop_box(width: int, height: int, top_non_transparent_row: int) -> tuple[int, int, int, int]:
    if width < TARGET_SIZE or height < TARGET_SIZE:
        raise ValueError(f"Image is too small ({width}x{height}); expected at least {TARGET_SIZE}x{TARGET_SIZE}")

    left = (width - TARGET_SIZE) // 2
    if height == TARGET_SIZE:
        top = 0
    else:
        top = min(max(top_non_transparent_row, 0), height - TARGET_SIZE)

    return (left, top, left + TARGET_SIZE, top + TARGET_SIZE)


def process_image(path: Path, output_dir: Path | None, overwrite: bool) -> str:
    with Image.open(path) as source:
        image = source.convert("RGBA")

    top_non_transparent_row = find_top_non_transparent_row(image)
    crop_box = compute_crop_box(image.width, image.height, top_non_transparent_row)
    cropped = image.crop(crop_box)

    destination = (output_dir / path.name) if output_dir is not None else path
    if destination.exists() and destination != path and not overwrite:
        return f"SKIP {path.name}: destination exists ({destination})"

    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(destination)

    left, top, right, bottom = crop_box
    return (
        f"OK   {path.name}: {image.width}x{image.height} -> {cropped.width}x{cropped.height} "
        f"(x={left}:{right}, y={top}:{bottom})"
    )


def gather_pngs(directory: Path) -> list[Path]:
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".png")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Crop face sprites to 64x64. "
            "Horizontal crop is centred; vertical crop starts at the first non-transparent row."
        )
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Directory containing PNG faces (default: current directory)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Optional output directory. If omitted, files are overwritten in place.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwrite when --output-dir already contains target files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    directory = Path(args.directory).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else None

    if not directory.exists() or not directory.is_dir():
        print(f"ERROR: directory not found: {directory}")
        return 1

    image_paths = gather_pngs(directory)
    if not image_paths:
        print(f"No PNG files found in {directory}")
        return 0

    processed = 0
    skipped = 0
    failed = 0

    for path in image_paths:
        try:
            result = process_image(path, output_dir, args.overwrite)
            print(result)
            if result.startswith("SKIP"):
                skipped += 1
            else:
                processed += 1
        except Exception as exc:  # noqa: BLE001 - per-file failure should not stop batch.
            print(f"FAIL {path.name}: {exc}")
            failed += 1

    print(f"\nDone. processed={processed}, skipped={skipped}, failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())