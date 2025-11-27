#!/bin/bash

# Export n8n workflows from a local SQLite database
# - Uses sqlite3 on the host
# - Exports ALL workflows by default
# - Optional: export only workflows from a specific folder name

DB_FILE="${DB_FILE:-./database.sqlite}"  # local DB path (default: ./database.sqlite)
OUTPUT_DIR="./n8n/workflows"
FOLDER_NAME="$1"   # optional folder filter

show_help() {
  cat << EOF
Usage: $(basename "$0") [FOLDER_NAME]

Export n8n workflows from a local SQLite database to JSON files.
Before running, copy the DB out of the container:

  docker cp n8n-server-n8n-1:/home/node/.n8n/database.sqlite ./database.sqlite

Env vars:
  DB_FILE   Path to local SQLite DB (default: ./database.sqlite)

Examples:
  $(basename "$0")               # export ALL workflows
  $(basename "$0") MyFolder      # export workflows only from folder "MyFolder"

Output:
  Workflows are exported to: $OUTPUT_DIR/YYYYMMDD_HHMMSS/
EOF
  exit 0
}

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  show_help
fi

if ! command -v sqlite3 > /dev/null 2>&1; then
  echo "Error: sqlite3 is not installed on the host. Install it with: sudo apt install sqlite3"
  exit 1
fi

if [[ ! -f "$DB_FILE" ]]; then
  echo "Error: Database file not found at: $DB_FILE"
  echo "Tip: copy it from the container with:"
  echo "  docker cp n8n-server-n8n-1:/home/node/.n8n/database.sqlite ./database.sqlite"
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXPORT_DIR="$OUTPUT_DIR/$TIMESTAMP"
mkdir -p "$EXPORT_DIR"

echo "Using local DB file: $DB_FILE"
echo "Export directory: $EXPORT_DIR"
[[ -n "$FOLDER_NAME" ]] && echo "Folder filter: $FOLDER_NAME" || echo "Folder filter: (ALL workflows)"
echo ""

# Build workflow ID list
if [[ -n "$FOLDER_NAME" ]]; then
  folder_id=$(sqlite3 "$DB_FILE" "SELECT id FROM folder WHERE name='$FOLDER_NAME';")

  if [[ -z "$folder_id" ]]; then
    echo "Error: Could not find folder '$FOLDER_NAME' in n8n."
    exit 1
  fi

  echo "Found folder '$FOLDER_NAME' with ID: $folder_id"
  echo ""

  workflow_ids=$(sqlite3 "$DB_FILE" "SELECT id FROM workflow_entity WHERE parentFolderId = '$folder_id';")
else
  workflow_ids=$(sqlite3 "$DB_FILE" "SELECT id FROM workflow_entity;")
fi

if [[ -z "$workflow_ids" ]]; then
  echo "No workflows found for the selected scope."
  exit 0
fi

# Export each workflow
for id in $workflow_ids; do
  if [[ -n "$id" && "$id" != " " ]]; then
    name=$(sqlite3 "$DB_FILE" "SELECT name FROM workflow_entity WHERE id = '$id';")
    clean_name=$(echo "$name" | tr ' ' '_' | tr -cd '[:alnum:]_-')

    sqlite3 "$DB_FILE" "
      SELECT json_object(
        'id', id,
        'name', name,
        'nodes', json(nodes),
        'connections', json(connections),
        'active', active,
        'settings', json(settings),
        'staticData', json(COALESCE(staticData, 'null')),
        'pinData', json(COALESCE(pinData, 'null')),
        'versionId', versionId,
        'meta', json(COALESCE(meta, 'null'))
      )
      FROM workflow_entity WHERE id = '$id';
    " > "$EXPORT_DIR/workflow_${id}_${clean_name}.json"

    echo "Exported: workflow_${id}_${clean_name}.json"
  fi
done

echo ""
echo "Done! Exported workflows to $EXPORT_DIR"

