#!/bin/zsh
# Renders the PNGs in this folder from icon.svg and social-preview.html with headless Chrome.
set -e
cd "${0:A:h}"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

shot() { # page url, width, height, png
  "$chrome" --headless --hide-scrollbars --no-first-run --user-data-dir="$tmp/profile" --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=$2,$3 --screenshot="$PWD/$4" "$1" 2>/dev/null
}

for n in 16 32 48 128; do
  pad=$(( n == 128 ? 16 : 0 )) # the Chrome Web Store wants 96 px artwork with 16 px transparent padding at 128 px
  print "<style>body{margin:${pad}px}</style><img src='file://$PWD/icon.svg' width=$((n - 2 * pad)) style='display:block'>" > "$tmp/icon.html"
  shot "file://$tmp/icon.html" $n $n icon-$n.png
done
shot "file://$PWD/social-preview.html" 1280 640 social-preview.png
