#!/bin/bash
# Run this script after adding photos to images/photos/
# It regenerates the manifest.json used by the gallery.

PHOTOS_DIR="$(dirname "$0")/images/photos"
MANIFEST="$PHOTOS_DIR/manifest.json"

files=()
for f in "$PHOTOS_DIR"/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}; do
    [ -f "$f" ] || continue
    files+=("\"$(basename "$f")\"")
done

echo "[" > "$MANIFEST"
for i in "${!files[@]}"; do
    if [ $i -lt $((${#files[@]} - 1)) ]; then
        echo "  ${files[$i]}," >> "$MANIFEST"
    else
        echo "  ${files[$i]}" >> "$MANIFEST"
    fi
done
echo "]" >> "$MANIFEST"

echo "Manifest updated with ${#files[@]} photo(s)."
