#!/bin/sh
# Rebuild the committed Noto Sans SC subsets. Dev-only: needs pyftsubset
# (fonttools). The app loads the woff2 files and does not run this script.
#
# Usage, from anywhere:
#   tools/subset-font.sh NotoSansSC-Regular.otf NotoSansSC-Bold.otf
#
# Source fonts are Noto Sans SC Regular and Bold (SIL OFL). The text file is
# Basic Latin, U+2212, and the 3,500 Level-1 characters of the Table of
# General Standard Chinese Characters.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
REGULAR=${1:?path to NotoSansSC-Regular.otf}
BOLD=${2:?path to NotoSansSC-Bold.otf}
TEXT="$ROOT/tools/subset-text.txt"
COMMON="--text-file=$TEXT --flavor=woff2 --layout-features=* --no-hinting --desubroutinize --name-IDs=* --name-legacy --name-languages=*"
# shellcheck disable=SC2086
pyftsubset "$REGULAR" $COMMON --output-file="$ROOT/fonts/NotoSansSC-subset-400.woff2"
# shellcheck disable=SC2086
pyftsubset "$BOLD" $COMMON --output-file="$ROOT/fonts/NotoSansSC-subset-700.woff2"
