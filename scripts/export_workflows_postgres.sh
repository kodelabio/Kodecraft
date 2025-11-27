#!/bin/bash

# Default values
CONTAINER_NAME="a-team-postgres-1"
OUTPUT_DIR="./n8n/workflows"
DB_NAME="n8n"
ACTIVE_ONLY=false

# Help function
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Export n8n workflows from the Minecraft folder to JSON files (PostgreSQL version).
Creates a timestamped subdirectory for each export.

Options:
  -c, --container   Docker container running PostgreSQL (default: a-team-postgres-1)
  -o, --output      Base directory for exports (default: ./n8n)
  -d, --database    PostgreSQL database name (default: n8n)
  -a, --active      Export only active workflows (default: false, exports all)
  -h, --help        Show this help message and exit

Examples:
  $(basename "$0")                                        # Export all workflows
  $(basename "$0") -a                                     # Export only active workflows
  $(basename "$0") --active --output ./backups            # Active only to custom dir
  $(basename "$0") -c my-postgres -d mydb -a              # Custom container, db, active only

Output:
  Workflows are exported to: OUTPUT_DIR/YYYYMMDD_HHMMSS/
EOF
  exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--container)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -d|--database)
      DB_NAME="$2"
      shift 2
      ;;
    -a|--active)
      ACTIVE_ONLY=true
      shift
      ;;
    -h|--help)
      show_help
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      ;;
  esac
done

# Create timestamped subdirectory
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXPORT_DIR="$OUTPUT_DIR/$TIMESTAMP"

# Create output directory if it doesn't exist
mkdir -p "$EXPORT_DIR"

echo "Using container: $CONTAINER_NAME"
echo "Database name: $DB_NAME"
echo "Export directory: $EXPORT_DIR"
if [[ "$ACTIVE_ONLY" == true ]]; then
  echo "Filter: Active workflows only"
else
  echo "Filter: All workflows"
fi
echo ""

# Build the WHERE clause
if [[ "$ACTIVE_ONLY" == true ]]; then
  ACTIVE_FILTER="AND active = true"
else
  ACTIVE_FILTER=""
fi

# Get the workflow IDs
workflow_ids=$(docker exec "$CONTAINER_NAME" psql -U root -d "$DB_NAME" -t -A -c \
  "SELECT id FROM workflow_entity WHERE \"parentFolderId\" = (SELECT id FROM folder WHERE name='Minecraft') $ACTIVE_FILTER;")

if [[ -z "$workflow_ids" ]]; then
  if [[ "$ACTIVE_ONLY" == true ]]; then
    echo "No active workflows found in 'Minecraft' folder"
  else
    echo "No workflows found in 'Minecraft' folder"
  fi
  exit 0
fi

# Count workflows
workflow_count=$(echo "$workflow_ids" | wc -w)
echo "Found $workflow_count workflow(s) to export"
echo ""

# Extract each workflow to its own file
for id in $workflow_ids; do
  if [[ -n "$id" && "$id" != " " ]]; then
    # Get workflow name and active status for display
    workflow_info=$(docker exec "$CONTAINER_NAME" psql -U root -d "$DB_NAME" -t -A -c \
      "SELECT name || '|' || active FROM workflow_entity WHERE id = '$id';")
    name=$(echo "$workflow_info" | cut -d'|' -f1)
    active=$(echo "$workflow_info" | cut -d'|' -f2)
    clean_name=$(echo "$name" | tr ' ' '_' | tr -cd '[:alnum:]_-')
    
    # Show active status in output
    if [[ "$active" == "t" ]]; then
      status_icon="✓"
    else
      status_icon="○"
    fi
    
    # Extract the complete workflow JSON
    docker exec "$CONTAINER_NAME" psql -U root -d "$DB_NAME" -t -A -c "
      SELECT jsonb_pretty(
        jsonb_build_object(
          'id', id,
          'name', name,
          'nodes', nodes,
          'connections', connections,
          'active', active,
          'settings', settings,
          'staticData', \"staticData\",
          'pinData', \"pinData\",
          'versionId', \"versionId\",
          'meta', meta
        )
      ) FROM workflow_entity WHERE id = '$id';
    " > "$EXPORT_DIR/workflow_${id}_${clean_name}.json"
    
    echo "[$status_icon] Exported: workflow_${id}_${clean_name}.json"
  fi
done

echo ""
echo "Done! Exported $workflow_count workflow(s) to $EXPORT_DIR"