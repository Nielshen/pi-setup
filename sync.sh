#!/usr/bin/env bash
set -euo pipefail

# Sync current ~/.pi/agent customizations into this repo, commit, and push.
# Usage:
#   ./sync.sh
#   ./sync.sh "Commit message"
#   ./sync.sh --no-push "Commit only"
#   ./sync.sh --dry-run

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
PUSH=1
DRY_RUN=0
MESSAGE="Update Pi setup"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push)
      PUSH=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '1,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      MESSAGE="$1"
      shift
      ;;
  esac
done

require_dir() {
  if [[ ! -d "$1" ]]; then
    echo "error: missing directory: $1" >&2
    exit 1
  fi
}

copy_dir_contents() {
  local src="$1"
  local dst="$2"
  require_dir "$src"
  mkdir -p "$dst"
  find "$dst" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -R "$src"/. "$dst"/
}

validate_json() {
  python3 - <<'PY' "$@"
import json, sys
for path in sys.argv[1:]:
    with open(path, 'r', encoding='utf-8') as f:
        json.load(f)
    print('json ok:', path)
PY
}

validate_themes() {
  python3 - <<'PY' "$ROOT"
import json, glob, sys
from pathlib import Path
root = Path(sys.argv[1])
schema = json.load(open('/opt/pi-coding-agent/theme/theme-schema.json', encoding='utf-8'))
required = set(schema['properties']['colors']['required'])
for path in sorted((root / 'themes').glob('*.json')):
    data = json.load(open(path, encoding='utf-8'))
    colors = data.get('colors', {})
    missing = required - set(colors)
    extra = set(colors) - required
    vars_ = set(data.get('vars', {}))
    bad_refs = [v for v in colors.values() if isinstance(v, str) and v and not v.startswith('#') and v not in vars_]
    if missing or extra or bad_refs:
        raise SystemExit(f'theme validation failed: {path}\nmissing={sorted(missing)}\nextra={sorted(extra)}\nbad_refs={bad_refs}')
    print('theme ok:', path.name)
PY
}

cd "$ROOT"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run: would sync from $PI_HOME into $ROOT"
  echo "Files that may change: extensions/, themes/, config/settings.example.json, config/mcp.example.json"
  exit 0
fi

copy_dir_contents "$PI_HOME/extensions" "$ROOT/extensions"
copy_dir_contents "$PI_HOME/themes" "$ROOT/themes"
mkdir -p "$ROOT/config"
cp "$PI_HOME/settings.json" "$ROOT/config/settings.example.json"
if [[ -f "$PI_HOME/mcp.json" ]]; then
  cp "$PI_HOME/mcp.json" "$ROOT/config/mcp.example.json"
fi

validate_json "$ROOT/package.json" "$ROOT/config/settings.example.json"
if [[ -f "$ROOT/config/mcp.example.json" ]]; then
  validate_json "$ROOT/config/mcp.example.json"
fi
validate_json "$ROOT"/themes/*.json
validate_themes

git add extensions themes config package.json README.md install.sh sync.sh .gitignore

if git diff --cached --quiet; then
  echo "No Pi setup changes to sync."
  exit 0
fi

git commit -m "$MESSAGE"

if [[ "$PUSH" == "1" ]]; then
  git push
else
  echo "Committed locally. Push later with: git push"
fi
