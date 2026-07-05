#!/bin/bash
# Run this script after adding photos to any images/photos/ subfolder.
# Resizes images to max 1920px and compresses to 85% quality, then updates manifests.

PHOTOS_DIR="$(dirname "$0")/images/photos"

python3 << 'PYEOF'
import os, sys
from PIL import Image, ImageOps

photos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images/photos') if '__file__' in dir() else 'images/photos'

# Find all image files recursively
exts = ('.jpg', '.jpeg', '.png', '.gif', '.webp')
for root, dirs, files in os.walk(photos_dir):
    # Skip hidden dirs
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for fname in files:
        if not fname.lower().endswith(exts):
            continue
        fpath = os.path.join(root, fname)
        try:
            img = Image.open(fpath)
            img = ImageOps.exif_transpose(img)  # fix orientation
            # Only resize if larger than 1920px
            if img.width > 1920 or img.height > 1920:
                img.thumbnail((1920, 1920), Image.LANCZOS)
                print(f"  Resized: {os.path.relpath(fpath, photos_dir)}")
            # Save with compression (convert PNG to JPG for photos)
            out_path = fpath
            if fname.lower().endswith('.png'):
                out_path = fpath[:-4] + '.jpg'
                img = img.convert('RGB')
            img.save(out_path, 'JPEG', quality=85, optimize=True)
            if out_path != fpath:
                os.remove(fpath)
                print(f"  Converted: {os.path.relpath(fpath, photos_dir)} -> jpg")
            else:
                pass  # already saved
        except Exception as e:
            print(f"  Warning: could not process {fname}: {e}")
PYEOF

generate_manifest() {
    local dir="$1"
    # Preserve the existing manifest order (the website's photo manager lets
    # photos be reordered and stores that order here). New files are appended,
    # deleted files dropped.
    python3 - "$dir" << 'PYEOF'
import json, os, sys

d = sys.argv[1]
exts = ('.jpg', '.jpeg', '.gif', '.webp')
present = sorted(f for f in os.listdir(d) if f.lower().endswith(exts))
manifest = os.path.join(d, 'manifest.json')
order = []
if os.path.exists(manifest):
    try:
        with open(manifest) as fh:
            order = json.load(fh)
    except Exception:
        order = []
kept = [f for f in order if f in present]
result = kept + [f for f in present if f not in kept]
with open(manifest, 'w') as fh:
    json.dump(result, fh, indent=2)
    fh.write('\n')
print(f"  {os.path.basename(d) or d}: {len(result)} photo(s)")
PYEOF
}

echo "Optimizing and updating manifests..."
generate_manifest "$PHOTOS_DIR"
for subdir in "$PHOTOS_DIR"/*/; do
    [ -d "$subdir" ] && generate_manifest "$subdir"
done
echo "Done."
