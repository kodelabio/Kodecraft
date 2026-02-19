#!/bin/bash
# convert_and_validate.sh
# Converts Grabcraft JSON to blueprint format and validates block names

set -e  # Exit on error

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <grabcraft_json> <structure_name> [start_coords]"
    echo ""
    echo "Arguments:"
    echo "  grabcraft_json  - Input Grabcraft parsed JSON file"
    echo "  structure_name  - Name for the structure (used as output filename)"
    echo "  start_coords    - Starting coordinates (default: 0,-60,0)"
    echo ""
    echo "Example: $0 feudal-japanese-tower.json japanese_house"
    echo "Example: $0 feudal-japanese-tower.json japanese_house 0,-50,0"
    exit 1
fi

GRABCRAFT_JSON=$1
STRUCTURE_NAME=$2
OUTPUT_NAME=$2  # Use same name as structure_name
START_COORDS=${3:-"0,-60,0"}  # Default to 0,-60,0 if not provided

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "GRABCRAFT TO BLUEPRINT CONVERTER"
echo "========================================"
echo ""

# Step 1: Convert Grabcraft to blueprint
echo "Step 1: Converting Grabcraft format..."
python3 scripts/grabcraft2json.py "$GRABCRAFT_JSON" "${OUTPUT_NAME}.json" "$STRUCTURE_NAME" "$START_COORDS"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Conversion failed!${NC}"
    exit 1
fi

OUTPUT_FILE="${OUTPUT_NAME}.json"

if [ ! -f "$OUTPUT_FILE" ]; then
    echo -e "${RED}✗ Output file not found: $OUTPUT_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Conversion complete: $OUTPUT_FILE${NC}"
echo ""

# Step 2: Validate block names
echo "Step 2: Validating block names against Minecraft registry..."
node scripts/validate_blocks.js "$OUTPUT_FILE"

VALIDATE_EXIT=$?

echo ""
echo "========================================"
echo "CONVERSION COMPLETE"
echo "========================================"
echo ""

if [ $VALIDATE_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ All block names are valid!${NC}"
    echo -e "${GREEN}✓ Blueprint ready: $OUTPUT_FILE${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Import to database: ./scripts/import_blueprints.sh $OUTPUT_FILE"
    echo "  2. Or trigger via n8n webhook"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some block names are invalid!${NC}"
    echo -e "${YELLOW}⚠️  Check the validation output above${NC}"
    echo ""
    echo "The blueprint was created but contains invalid block names."
    echo "Update MATERIAL_MAPPING in grabcraft_to_construction.py to fix."
    echo ""
    echo "Blueprint location: $OUTPUT_FILE"
    exit 1
fi