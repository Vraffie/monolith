"""Generates the image fixtures used by tests/js/images.test.mjs (needs: pip install pillow piexif).

Each file hides known metadata so the tests can check it is found and removed without touching the pixels.
Run:  python tests/js/fixtures/make_fixtures.py
"""
import hashlib, io, json, struct, zlib
from pathlib import Path
import piexif
from PIL import Image, PngImagePlugin

here = Path(__file__).parent

def gradient(w, h):
    img = Image.new("RGB", (w, h))
    img.putdata([((x * 255) // w, (y * 255) // h, ((x + y) * 255) // (w + h)) for y in range(h) for x in range(w)])
    return img

def rational(num, den=1): return (num, den)
def dms(deg):
    d = int(deg); m = int((deg - d) * 60); s = round(((deg - d) * 60 - m) * 60 * 10000)
    return ((d, 1), (m, 1), (s, 10000))

exif = piexif.dump({
    "0th": {piexif.ImageIFD.Make: b"ACME", piexif.ImageIFD.Model: b"Cam 9", piexif.ImageIFD.Software: b"Editor 1.2", piexif.ImageIFD.Orientation: 6},
    "Exif": {piexif.ExifIFD.DateTimeOriginal: b"2024:05:17 14:03:22"},
    "GPS": {piexif.GPSIFD.GPSLatitudeRef: b"N", piexif.GPSIFD.GPSLatitude: dms(59.9139), piexif.GPSIFD.GPSLongitudeRef: b"E", piexif.GPSIFD.GPSLongitude: dms(10.7522)},
})

def segment(marker, payload): return b"\xff" + bytes([marker]) + struct.pack(">H", len(payload) + 2) + payload

# --- JPEG with EXIF (GPS, camera, orientation), XMP, an Adobe-style APP13 and a comment ---
buf = io.BytesIO(); gradient(64, 48).save(buf, "JPEG", quality=85, exif=exif); jpg = buf.getvalue()
soi, rest = jpg[:2], jpg[2:]
extra = segment(0xE1, b"http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta><creator>Jane Doe</creator></x:xmpmeta>") + segment(0xED, b"Photoshop 3.0\x008BIM") + segment(0xFE, b"secret note: meeting at 9")
(here / "photo-gps.jpg").write_bytes(soi + extra + rest)
buf = io.BytesIO(); gradient(64, 48).save(buf, "JPEG", quality=85); (here / "plain.jpg").write_bytes(buf.getvalue())

# --- PNG with tEXt, iTXt, eXIf and tIME ---
info = PngImagePlugin.PngInfo(); info.add_text("Author", "Jane Doe"); info.add_itxt("Description", "private holiday photo", lang="en", tkey="Description")
buf = io.BytesIO(); gradient(40, 30).save(buf, "PNG", pnginfo=info, exif=exif); png = buf.getvalue()
def chunk(kind, data): return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
iend = png.rindex(b"\x00\x00\x00\x00IEND")
png = png[:iend] + chunk(b"tIME", struct.pack(">HBBBBB", 2024, 5, 17, 14, 3, 22)) + png[iend:]
(here / "meta.png").write_bytes(png)

# --- WebP with EXIF and XMP ---
buf = io.BytesIO(); gradient(48, 32).save(buf, "WEBP", quality=80, lossless=False, exif=exif, xmp=b"<x:xmpmeta><creator>Jane Doe</creator></x:xmpmeta>"); (here / "meta.webp").write_bytes(buf.getvalue())

def pixels(path): return hashlib.sha256(Image.open(path).convert("RGB").tobytes()).hexdigest()
manifest = {n: {"bytes": (here / n).stat().st_size, "pixels": pixels(here / n), "size": list(Image.open(here / n).size)} for n in ["photo-gps.jpg", "plain.jpg", "meta.png", "meta.webp"]}
(here / "fixtures.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
