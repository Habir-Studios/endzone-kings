#!/bin/sh
# Build the downloadable Endzone Kings apps (Windows, Mac, Linux) into desktop/out/.
# Needs Node. Run from the repo root: sh desktop/build.sh
set -e
cd "$(dirname "$0")"
rm -rf game out && mkdir -p game
cp -r ../index.html ../manifest.webmanifest ../css ../js ../assets ../vendor game/
# version stamp for the in-app "update available" check. ../desktop-latest.json is what the website serves:
# commit it only AFTER the new zips are on itch, so nobody gets told to update before the update exists
V=$(date +%s); echo "{\"v\":$V}" > game/build.json; echo "{\"v\":$V}" > ../desktop-latest.json
npm install --no-save electron@44.9.0 @electron/packager@20.3.0 >/dev/null
for t in win32:x64 darwin:arm64 darwin:x64 linux:x64; do
  npx electron-packager . "Endzone Kings" --platform=${t%%:*} --arch=${t##*:} --out=out --overwrite --electron-version=44.9.0 --ignore="^/out" --ignore="^/node_modules" --ignore="build.sh" --ignore="^/\.gitignore" >/dev/null
done
cd out && for d in */; do (zip -qry "${d%/}.zip" "$d"); done && ls -la *.zip
