#!/bin/bash

# Load environment variables from .env
N8N_CONTAINER="n8n"
INPUT_DIR="./n8n/backup"

# Function to display help
show_help() {
    cat << EOF
Import n8n workflows from exported JSON files

USAGE:
    ./import-workflows.sh [OPTIONS] [input-directory]

OPTIONS:
    -h, --help              Show this help message
    -n, --n8n CONTAINER     N8N container name (default: n8n)

EXAMPLES:
    # Import from default backup directory
    ./import-workflows.sh

    # Import from custom directory
    ./import-workflows.sh "./my-backups"

    # Import with custom container
    ./import-workflows.sh -n "prod-n8n" "./my-backups"

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -n|--n8n)
            N8N_CONTAINER="$2"
            shift 2
            ;;
        -*)
            echo "Error: Unknown option $1"
            show_help
            exit 1
            ;;
        *)
            INPUT_DIR="$1"
            shift
            ;;
    esac
done

echo "Importing workflows"
echo "Input directory: $INPUT_DIR"
echo "N8N container: $N8N_CONTAINER"
echo ""

# Verify container exists
if ! docker exec "$N8N_CONTAINER" true 2>/dev/null; then
    echo "Error: N8N container '$N8N_CONTAINER' not found or not running"
    exit 1
fi

# Check if directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Directory '$INPUT_DIR' not found"
    exit 1
fi

# Check if there are any JSON files
JSON_COUNT=$(find "$INPUT_DIR" -maxdepth 1 -name "*.json" | wc -l)

if [ "$JSON_COUNT" -eq 0 ]; then
    echo "Error: No JSON files found in '$INPUT_DIR'"
    exit 1
fi

echo "Found $JSON_COUNT JSON file(s) to import"
echo ""

# Create temporary directory for converted files
TEMP_DIR=$(mktemp -d)
echo "Converting workflow files to import format..."

count=0
for json_file in "$INPUT_DIR"/*.json; do
    if [ -f "$json_file" ]; then
        filename=$(basename "$json_file")
        
        # Check if it's an array (exported format) or single object
        if jq -e '.[0]' "$json_file" >/dev/null 2>&1; then
            # It's an array, extract each workflow
            jq -r '.[] | {name, nodes, connections, settings, staticData, meta, pinData, tags}' "$json_file" > "$TEMP_DIR/$filename"
            echo "✓ Converted $filename (array format)"
        else
            # It's already a single object, just extract the workflow fields
            jq '{name, nodes, connections, settings, staticData, meta, pinData, tags}' "$json_file" > "$TEMP_DIR/$filename"
            echo "✓ Converted $filename (object format)"
        fi
        ((count++))
    fi
done

echo ""
echo "Copying converted files to container..."
CONTAINER_INPUT_DIR="/tmp/import-workflows"
docker exec "$N8N_CONTAINER" mkdir -p "$CONTAINER_INPUT_DIR"
docker cp "$TEMP_DIR/." "$N8N_CONTAINER:$CONTAINER_INPUT_DIR/"

echo "✓ Files copied to container"
echo ""

# Import workflows
echo "Importing workflows..."
docker exec "$N8N_CONTAINER" n8n import:workflow --separate --input="$CONTAINER_INPUT_DIR" 2>&1

# Cleanup
docker exec "$N8N_CONTAINER" rm -rf "$CONTAINER_INPUT_DIR"
rm -rf "$TEMP_DIR"

echo ""
echo "Import complete!"