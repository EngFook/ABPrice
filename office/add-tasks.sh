#!/usr/bin/env bash
# Adds this project's task cards (office/tasks/*.json) to the local AI Office task board.
# Run it on the Mac where AI Office is running (npm start).
#
#   office/add-tasks.sh [path-to-ai-office]     # default: ~/ai-office
#
# Each card's projectPath is set to this checkout. Cards that were already added
# are recorded in office/.added and skipped next time.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OFFICE_DIR="${1:-$HOME/ai-office}"
BOARD="$OFFICE_DIR/scripts/office-board.mjs"
ADDED="$PROJECT_DIR/office/.added"

if [ ! -f "$BOARD" ]; then
  echo "找不到 AI Office：$OFFICE_DIR"
  echo "用法：office/add-tasks.sh /path/to/ai-office"
  exit 1
fi
touch "$ADDED"

for task in "$PROJECT_DIR"/office/tasks/*.json; do
  name="$(basename "$task")"
  if grep -qxF "$name" "$ADDED"; then
    echo "已加过，跳过：$name"
    continue
  fi
  PROJECT_DIR="$PROJECT_DIR" node -e '
    const fs = require("fs");
    const card = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    card.projectPath = process.env.PROJECT_DIR;
    process.stdout.write(JSON.stringify(card));
  ' "$task" | node "$BOARD" add-task > /dev/null
  echo "$name" >> "$ADDED"
  echo "已加入 AI Office：$name"
done
