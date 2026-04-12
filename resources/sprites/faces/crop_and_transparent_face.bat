@echo off
:: crop_and_transparent_face.bat
:: Converts a face sprite from 92x240 with teal background to 96x96 with transparency.
:: Crops from y=135 (96px tall), pads width from 92px to 96px (2px each side).
:: Usage: crop_and_transparent_face.bat <image.png>
if "%~1"=="" (
    echo Usage: crop_and_transparent_face.bat ^<image.png^>
    exit /b 1
)
setlocal
set TMPSCRIPT=%TEMP%\face_crop_%RANDOM%.py
(
echo from PIL import Image
echo import sys
echo path = sys.argv[1]
echo BG = ^(0x00, 0x75, 0x75^)
echo CROP_TOP = 135
echo CROP_H = 96
echo SRC_W = 92
echo OUT_W = 96
echo PAD = ^(OUT_W - SRC_W^) // 2
echo img = Image.open^(path^).convert^('RGBA'^)
echo cropped = img.crop^(^(0, CROP_TOP, SRC_W, CROP_TOP + CROP_H^)^)
echo pixels = cropped.load^(^)
echo for y in range^(CROP_H^):
echo     for x in range^(SRC_W^):
echo         r, g, b, a = pixels[x, y]
echo         if ^(r, g, b^) == BG:
echo             pixels[x, y] = ^(0, 0, 0, 0^)
echo out = Image.new^('RGBA', ^(OUT_W, CROP_H^), ^(0, 0, 0, 0^)^)
echo out.paste^(cropped, ^(PAD, 0^)^)
echo out.save^(path^)
echo import os
echo print^(f'Done: {os.path.basename^(path^)} -^> {out.size[0]}x{out.size[1]}'^)
) > "%TMPSCRIPT%"
python "%TMPSCRIPT%" "%~f1"
del "%TMPSCRIPT%"
endlocal
