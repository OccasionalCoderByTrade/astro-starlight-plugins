#!/bin/bash

# tree-depth.sh - Print tree with specified depth, filtered to index.md files
# Usage: ./scripts/tree-depth.sh 3

DEPTH=${1:-3}
tree -L "$DEPTH" -P "index.md" src/content/docs
