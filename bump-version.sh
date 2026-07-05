#!/bin/bash
# Stamp a new site version: updates the ?v= cache-buster on every local
# CSS/JS reference, the <meta name="site-version"> tag in each page, and
# version.json. Run automatically by the pre-commit hook whenever site
# files change; safe to run by hand too.
cd "$(dirname "$0")" || exit 1

STAMP=$(date +%Y%m%d%H%M%S)

for f in *.html; do
    sed -i '' -E \
        -e "s|(href=\"styles/[^\"?]+\.css)(\?v=[^\"]*)?\"|\1?v=$STAMP\"|g" \
        -e "s|(src=\"js/[^\"?]+\.js)(\?v=[^\"]*)?\"|\1?v=$STAMP\"|g" \
        -e "s|(<meta name=\"site-version\" content=\")[^\"]*(\")|\1$STAMP\2|" \
        "$f"
done

printf '{ "v": "%s" }\n' "$STAMP" > version.json
echo "$STAMP"
