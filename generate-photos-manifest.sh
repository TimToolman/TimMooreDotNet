#!/bin/bash
# Run this script after adding photos to images/photos/ or any subfolder.
# It regenerates manifest.json files for the root and each subdirectory.

PHOTOS_DIR="$(dirname "$0")/images/photos"

generate_manifest() {
    local dir="$1"
    local manifest="$dir/manifest.json"
    local files=()

    for f in "$dir"/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}; do
        [ -f "$f" ] || continue
        files+=("\"$(basename "$f")\"")
    done

    echo "[" > "$manifest"
    for i in "${!files[@]}"; do
        if [ $i -lt $((${#files[@]} - 1)) ]; then
            echo "  ${files[$i]}," >> "$manifest"
        else
            echo "  ${files[$i]}" >> "$manifest"
        fi
    done
    echo "]" >> "$manifest"

    echo "  $(basename "$dir"): ${#files[@]} photo(s)"
}

echo "Updating manifests..."
generate_manifest "$PHOTOS_DIR"
for subdir in "$PHOTOS_DIR"/*/; do
    [ -d "$subdir" ] && generate_manifest "$subdir"
done
echo "Done."
