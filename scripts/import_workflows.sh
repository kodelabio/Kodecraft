#!/bin/bash

# Default values
CONTAINER_NAME="n8n_postgres-1"
BASE_DIR="./n8n"
SUBDIR=""

# Help function
show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS] [CONTAINER_NAME] [BASE_DIR] [SUBDIR]

Import n8n workflows from JSON files into n8n.

Arguments:
  CONTAINER_NAME    Docker container running n8n (default: n8n_postgres-1)
  BASE_DIR          Base directory containing export subdirectories (default: ./n8n)
  SUBDIR            Timestamped subdirectory to import from (e.g., 20250101_120000)
                    If not specified, lists available subdirectories

Options:
  -h, --help        Show this help message and exit

Examples:
  $(basename "$0")                                            # List available exports
  $(basename "$0") my-n8n ./n8n                               # List available exports
  $(basename "$0") my-n8n ./n8n 20250101_120000               # Import specific export
EOF
  exit 0
}

# Parse options
case "$1" in
  -h|--help)
    show_help
    ;;
esac

# Set parameters from arguments (or use defaults)
CONTAINER_NAME="${1:-$CONTAINER_NAME}"
BASE_DIR="${2:-$BASE_DIR}"
SUBDIR="${3:-}"

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
      count=$(find "$dir" -maxdepth 1 -name "*.json" | wc -l)
      echo "  $dirname ($count workflow(s))"
    done
  fi
  
  echo ""
  echo "Usage: $(basename "$0") [CONTAINER_NAME] [BASE_DIR] [SUBDIR]"
  exit 0
fi

INPUT_DIR="$BASE_DIR/$SUBDIR"

# Check if input directory exists
if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Error: Input directory '$INPUT_DIR' does not exist"
  exit 1
fi

# Check if there are any JSON files to import
shopt -s nullglob
json_files=("$INPUT_DIR"/*.json)
shopt -u nullglob

if [[ ${#json_files[@]} -eq 0 ]]; then
  echo "Error: No JSON files found in '$INPUT_DIR'"
  exit 1
fi

echo "Using container: $CONTAINER_NAME"
echo "Import directory: $INPUT_DIR"
echo "Found ${#json_files[@]} workflow file(s)"
echo ""

# Get the container's working directory for n8n
CONTAINER_INPUT_DIR="/tmp/n8n-import"

# Create temporary directory in container
docker exec "$CONTAINER_NAME" mkdir -p "$CONTAINER_INPUT_DIR"

# Copy workflow files to container
echo "Copying workflow files to container..."
for file in "${json_files[@]}"; do
  filename=$(basename "$file")
  docker cp "$file" "$CONTAINER_NAME:$CONTAINER_INPUT_DIR/$filename"
  echo "  Copied: $filename"
done
echo ""

# Import all workflows
echo "Importing workflows..."
docker exec "$CONTAINER_NAME" n8n import:workflow --separate --input="$CONTAINER_INPUT_DIR"

# Clean up temporary files in container
echo ""
echo "Cleaning up temporary files..."
docker exec "$CONTAINER_NAME" rm -rf "$CONTAINER_INPUT_DIR"

echo ""
echo "Done! Imported ${#json_files[@]} workflow(s) from $SUBDIR"