#!/bin/bash

# Default values
WEBHOOK_BASE_URL="http://localhost/webhook/Kodecraft"
EXPORT_DIR="./n8n/datatables"
TABLE_NAME="KodecraftPrompts"

# Help function
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Export n8n data table via webhook to JSON file.
Creates a timestamped subdirectory for each export.

Options:
  --table-name TABLE_NAME      Name of the data table to export (required)
  --output-dir OUTPUT_DIR      Base directory for exports (default: ./n8n/datatables)
  --webhook-url WEBHOOK_URL    Base URL for webhooks (default: http://localhost/webhook/tools)
  -h, --help                   Show this help message and exit

Examples:
  $(basename "$0") --table-name KodecraftPrompts
  $(basename "$0") --table-name KodecraftPrompts --output-dir ./exports
  $(basename "$0") --table-name KodecraftPrompts --output-dir ./exports --webhook-url https://my-n8n.example.com/webhook/tools

Output:
  Data is exported to: OUTPUT_DIR/YYYYMMDD_HHMMSS/TABLE_NAME.json
EOF
  exit 0
}

# Parse keyword arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      show_help
      ;;
    --table-name)
      TABLE_NAME="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --webhook-url)
      WEBHOOK_BASE_URL="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown option '$1'"
      echo ""
      show_help
      ;;
  esac
done

# Validate table name
if [[ -z "$TABLE_NAME" ]]; then
  echo "Error: --table-name is required"
  echo ""
  show_help
fi

# Create timestamped subdirectory
#TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
#EXPORT_DIR="$OUTPUT_DIR/$TIMESTAMP"
#mkdir -p "$EXPORT_DIR"

# Clean table name for filename
clean_name=$(echo "$TABLE_NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')

echo "Exporting data table: $TABLE_NAME"
echo "Webhook URL: $WEBHOOK_BASE_URL/get-datatable"
echo "Output directory: $EXPORT_DIR"
echo ""

# Call webhook and save response
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$EXPORT_DIR/${clean_name}.json" \
  --location "$WEBHOOK_BASE_URL/get-datatable?table=$TABLE_NAME")

if [[ "$HTTP_CODE" -eq 200 ]]; then
  # Check if file has content
  if [[ -s "$EXPORT_DIR/${clean_name}.json" ]]; then
    row_count=$(jq 'length' "$EXPORT_DIR/${clean_name}.json" 2>/dev/null || echo "unknown")
    echo "Success! Exported $row_count row(s)"
    echo "Saved to: $EXPORT_DIR/${clean_name}.json"
  else
    echo "Warning: Response was empty"
    rm -f "$EXPORT_DIR/${clean_name}.json"
  fi
else
  echo "Error: HTTP $HTTP_CODE"
  cat "$EXPORT_DIR/${clean_name}.json" 2>/dev/null
  rm -f "$EXPORT_DIR/${clean_name}.json"
  exit 1
fi

echo ""
echo "Done!"