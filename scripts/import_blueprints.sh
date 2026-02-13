#!/bin/bash

# Default values
WEBHOOK_URL="https://svdev-avatar.kodelab.io/webhook/kodecraft/update-blueprints"
BASE_DIR="./n8n/datatables"
SUBDIR=""
DATATABLE_NAME=""

# Help function
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Import JSON files to n8n data table via webhook.

Options:
  -d, --dir         Base directory containing exports (default: ./n8n/datatables)
  -s, --subdir      Timestamped subdirectory to import from (required for import)
  -n, --name        Name of the datatable to import to (required for import)
  -w, --webhook     Webhook URL for import (default: https://svdev-avatar.kodelab.io/webhook/kodecraft/update-datatable)
  -h, --help        Show this help message and exit

Examples:
  $(basename "$0")                                                    # List available exports
  $(basename "$0") -s 20250101_120000 -n Blueprints                 # Import all files to datatable
  $(basename "$0") -s 20250101_120000 -n Blueprints -w https://custom-url.com
EOF
  exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir)
      BASE_DIR="$2"
      shift 2
      ;;
    -s|--subdir)
      SUBDIR="$2"
      shift 2
      ;;
    -n|--name)
      DATATABLE_NAME="$2"
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
      file_list=$(ls -1 "$dir"/*.json 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
      echo "  $dirname: $file_list"
    done
  fi
  
  echo ""
  echo "Usage: $(basename "$0") -s SUBDIR -n DATATABLE_NAME"
  exit 0
fi

# Check if subdir exists
SUBDIR_PATH="$BASE_DIR/$SUBDIR"
if [[ ! -d "$SUBDIR_PATH" ]]; then
  echo "Error: Subdirectory not found: $SUBDIR_PATH"
  exit 1
fi

# If no datatable name specified, show error
if [[ -z "$DATATABLE_NAME" ]]; then
  echo "Error: Datatable name required (-n or --name)"
  echo ""
  show_help
fi

# Find all JSON files
shopt -s nullglob
json_files=("$SUBDIR_PATH"/*.json)
shopt -u nullglob

if [[ ${#json_files[@]} -eq 0 ]]; then
  echo "Error: No JSON files found in $SUBDIR_PATH"
  exit 1
fi

echo "Importing ${#json_files[@]} file(s) to datatable: $DATATABLE_NAME"
echo "Source directory: $SUBDIR_PATH"
echo "Webhook URL: $WEBHOOK_URL"
echo ""

success_count=0
fail_count=0

# Import each JSON file
for INPUT_FILE in "${json_files[@]}"; do
  filename=$(basename "$INPUT_FILE")
  row_count=$(jq 'length' "$INPUT_FILE" 2>/dev/null || echo "unknown")
  
  echo -n "Importing $filename ($row_count rows)... "
  
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/import_response.json \
    -X POST \
    --location "$WEBHOOK_URL" \
    --header "Content-Type: application/json" \
    --data-raw "{\"tableName\": \"$DATATABLE_NAME\", \"data\": $(cat "$INPUT_FILE")}")
  
  if [[ "$HTTP_CODE" -eq 200 ]]; then
    echo "✓ Success"
    ((success_count++))
  else
    echo "✗ Error (HTTP $HTTP_CODE)"
    cat /tmp/import_response.json 2>/dev/null
    ((fail_count++))
  fi
done

echo ""
echo "Completed: $success_count successful, $fail_count failed"

rm -f /tmp/import_response.json

if [[ $fail_count -gt 0 ]]; then
  exit 1
fi

exit 0