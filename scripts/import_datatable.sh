#!/bin/bash

# Default values
WEBHOOK_URL="https://svdev-avatar.kodelab.io/webhook/kodecraft/update-datatable"
BASE_DIR="./n8n/datatables"
TABLE_NAME="datatable"
SUBDIR=""

# Help function
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Import JSON file to n8n data table via webhook.

Options:
  -t, --table       Name of the file to import (default: datatable)
  -d, --dir         Base directory containing exports (default: ./n8n-datatables)
  -s, --subdir      Timestamped subdirectory to import from (required for import)
  -w, --webhook     Webhook URL for import (default: https://svdev-avatar.kodelab.io/webhook/tools/import-datatable)
  -h, --help        Show this help message and exit

Examples:
  $(basename "$0")                                              # List available exports
  $(basename "$0") -t KodecraftPrompts -s 20250101_120000       # Import specific export
  $(basename "$0") --table KodecraftPrompts --subdir 20250101_120000 --webhook https://custom-url.com
EOF
  exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--table)
      TABLE_NAME="$2"
      shift 2
      ;;
    -d|--dir)
      BASE_DIR="$2"
      shift 2
      ;;
    -s|--subdir)
      SUBDIR="$2"
      shift 2
      ;;
    -w|--webhook)
      WEBHOOK_URL="$2"
      shift 2
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

# Check if base directory exists
if [[ ! -d "$BASE_DIR" ]]; then
  echo "Error: Base directory '$BASE_DIR' does not exist"
  exit 1
fi

# If no subdir specified, list available ones
if [[ -z "$SUBDIR" ]]; then
  echo "Available exports in '$BASE_DIR':"
  echo ""
  
  shopt -s nullglob
  subdirs=("$BASE_DIR"/*/)
  shopt -u nullglob
  
  if [[ ${#subdirs[@]} -eq 0 ]]; then
    echo "  No export subdirectories found"
  else
    for dir in "${subdirs[@]}"; do
      dirname=$(basename "$dir")
      files=$(ls -1 "$dir"/*.json 2>/dev/null | wc -l)
      # List files in subdirectory
      file_list=$(ls -1 "$dir"/*.json 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
      echo "  $dirname: $file_list"
    done
  fi
  
  echo ""
  echo "Usage: $(basename "$0") -t TABLE_NAME -s SUBDIR"
  exit 0
fi

# Find the JSON file
clean_name=$(echo "$TABLE_NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')
INPUT_FILE="$BASE_DIR/$SUBDIR/${clean_name}.json"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: File not found: $INPUT_FILE"
  exit 1
fi

row_count=$(jq 'length' "$INPUT_FILE" 2>/dev/null || echo "unknown")

echo "Importing data table: $TABLE_NAME"
echo "From file: $INPUT_FILE ($row_count rows)"
echo "Webhook URL: $WEBHOOK_URL"
echo ""

# Call webhook with JSON data
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/import_response.json \
  -X POST \
  --location "$WEBHOOK_URL" \
  --header "Content-Type: application/json" \
  --data @"$INPUT_FILE")

if [[ "$HTTP_CODE" -eq 200 ]]; then
  echo "Success!"
  cat /tmp/import_response.json 2>/dev/null
  echo ""
else
  echo "Error: HTTP $HTTP_CODE"
  cat /tmp/import_response.json 2>/dev/null
  exit 1
fi

rm -f /tmp/import_response.json

echo ""
echo "Done!"