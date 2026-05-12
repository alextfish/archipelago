"""
process_npc_sprites.py

Processes NPC sprite sheets that contain:
  - A 3×4 grid of 24×32 walk-cycle frames (top-left, on teal background)
  - A single face portrait on teal background (right section, position varies)
  - Optional label text on grey (#6b8a8b) background (discarded)

Outputs:
  - Overwrites source file with a 96×128 sprite sheet of 32×32 transparent frames
    (each 24px frame padded 4px left and right)
  - Saves a 64×64 transparent-background face PNG to the faces/ subdirectory

Usage:
  python process_npc_sprites.py                 # processes all NAMES listed below
  python process_npc_sprites.py MySprite.png    # processes a single file
"""

import sys
import os
from PIL import Image

SPRITES_DIR = os.path.dirname(os.path.abspath(__file__))
FACES_DIR = os.path.join(SPRITES_DIR, 'faces')

# TEAL is detected dynamically per-image from the top-left pixel.
# Known variants: #007575, #007475.

# Sprite sheet constants
FRAME_W = 24
FRAME_H = 32
COLS = 3
ROWS = 4
PADDED_W = 32           # target frame width
PAD_LEFT = (PADDED_W - FRAME_W) // 2   # 4px each side

# Face output size
FACE_SIZE = 64

# Minimum x where the face section starts (past the sprite columns)
FACE_SECTION_X = COLS * FRAME_W  # 72

NAMES = [
    'Townfolk-Child-F-001 light.png',
    'Townfolk-Adult-F-003 light.png',
    'Townfolk-Child-M-002 light.png',
    'Townfolk-Old-F-001 light.png',
    'Bard-M-01 light.png',
    'Cultist-02.png',
    'Cultist-03.png',
    'Aristocrate-F-01 dark blonde.png',
    'Aristocrate-F-01 dark.png',
    'Aristocrate-F-03 dark.png',
    'Aristocrat-M-02 light.png',
    'Dancer-F-01 dark.png',
    'Townfolk-Adult-F-001 dark.png',
    'Townfolk-Adult-F-006 dark.png',
    'Townfolk-Adult-M-006 dark.png',
    'Townfolk-Adult-M-009 dark.png',
    'Townfolk-Child-F-001 dark.png',
    'Townfolk-Child-F-002 dark.png',
    'Townfolk-Child-M-001 dark.png',
    'Townfolk-Old-M-001 dark.png',
    'Townfolk-Old-M-002 dark.png',
    'Ranger-M-01 dark.png',
    'Cultist-01.png',
    'Aristocrate-F-01 light.png',
    'Aristocrate-F-02 light.png',
    'Aristocrate-F-03 light.png',
    'Dancer-F-01 light.png',
    'Townfolk-Adult-F-002 light.png',
    'Townfolk-Adult-F-005 light.png',
    'Townfolk-Adult-F-004 light.png',
    'Townfolk-Adult-M-007 light.png',
    'Townfolk-Adult-M-008 light.png',
]


def make_transparent(img: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Return a copy of img with all bg-coloured pixels replaced by transparency."""
    result = img.copy().convert('RGBA')
    px = result.load()
    for y in range(result.height):
        for x in range(result.width):
            if px[x, y][:3] == bg:
                px[x, y] = (0, 0, 0, 0)
    return result


def process_sprites(img: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Extract the 3×4 walk-cycle grid, make transparent, pad to 32px-wide frames."""
    src = img.crop((0, 0, COLS * FRAME_W, ROWS * FRAME_H))
    src = make_transparent(src, bg)
    out = Image.new('RGBA', (COLS * PADDED_W, ROWS * FRAME_H), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            frame = src.crop((col * FRAME_W, row * FRAME_H,
                              col * FRAME_W + FRAME_W, row * FRAME_H + FRAME_H))
            out.paste(frame, (col * PADDED_W + PAD_LEFT, row * FRAME_H))
    return out


def process_face(img: Image.Image, bg: tuple[int, int, int]) -> tuple[Image.Image, bool]:
    """
    Locate the teal-background face in the right section, remove teal,
    find the tight content bounding box, and centre-pad to FACE_SIZE × FACE_SIZE.
    Returns (face_image, clipped) where clipped is True if content was larger than FACE_SIZE.
    """
    # Find bounding box of all bg-coloured pixels right of the sprite columns
    min_x = img.width
    max_x = 0
    min_y = img.height
    max_y = 0
    found = False
    for y in range(img.height):
        for x in range(FACE_SECTION_X, img.width):
            if img.getpixel((x, y))[:3] == bg:
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
                found = True

    if not found:
        raise ValueError(f'No background-coloured face region found in right section (bg=#{bg[0]:02x}{bg[1]:02x}{bg[2]:02x})')

    # Crop bg rectangle, remove bg → only face-art pixels remain
    teal_region = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    teal_region = make_transparent(teal_region, bg)

    # Tight bounding box of actual face content
    content_box = teal_region.getbbox()
    if content_box is None:
        raise ValueError('Face region is empty after removing background')
    content = teal_region.crop(content_box)
    cw, ch = content.size

    # Centre content in FACE_SIZE × FACE_SIZE (center-crop if larger, no scaling)
    clipped = cw > FACE_SIZE or ch > FACE_SIZE
    out = Image.new('RGBA', (FACE_SIZE, FACE_SIZE), (0, 0, 0, 0))

    paste_x = (FACE_SIZE - cw) // 2
    paste_y = (FACE_SIZE - ch) // 2

    # Source region to copy (handles content larger than FACE_SIZE)
    src_x = max(0, -paste_x)
    src_y = max(0, -paste_y)
    dst_x = max(0, paste_x)
    dst_y = max(0, paste_y)
    copy_w = min(cw - src_x, FACE_SIZE - dst_x)
    copy_h = min(ch - src_y, FACE_SIZE - dst_y)

    region = content.crop((src_x, src_y, src_x + copy_w, src_y + copy_h))
    out.paste(region, (dst_x, dst_y))
    return out, clipped


def process_file(filename: str) -> None:
    src_path = os.path.join(SPRITES_DIR, filename)
    if not os.path.exists(src_path):
        print(f'  SKIP (not found): {filename}')
        return

    img = Image.open(src_path).convert('RGBA')
    # Detect background colour from top-left pixel of sprite section
    bg = img.getpixel((0, 0))[:3]

    sprite_sheet = process_sprites(img, bg)
    sprite_sheet.save(src_path)

    face_img, clipped = process_face(img, bg)
    face_name = os.path.splitext(filename)[0] + '.png'
    face_path = os.path.join(FACES_DIR, face_name)
    face_img.save(face_path)

    clip_note = ' [face center-cropped, content > 64px]' if clipped else ''
    print(f'  OK: {filename} → sprite {sprite_sheet.size}, face {face_img.size}{clip_note}')


if __name__ == '__main__':
    targets = sys.argv[1:] if len(sys.argv) > 1 else NAMES
    print(f'Processing {len(targets)} file(s)...')
    for name in targets:
        process_file(name)
    print('Done.')
