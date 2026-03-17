#!/bin/bash

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] <schematic_file|directory>

Convert Minecraft schematic files to blueprint JSON format.

Supports: .schem (Sponge v2+) and .schematic (WorldEdit) formats

OPTIONS:
    -h, --help      Show this help message and exit
    -d, --directory Process all schematic files in a directory

ARGUMENTS:
    schematic_file  Path to the .schem or .schematic file
    directory       Path to directory (with -d flag)

EXAMPLES:
    $(basename "$0") my_build.schem
    $(basename "$0") my_build.schematic
    $(basename "$0") -d ./schematics/

EOF
}

if [[ $# -eq 0 || "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

process_schematic() {
    local SCHEMATIC_FILE=$1
    local FILENAME=$(basename "$SCHEMATIC_FILE")
    local NAME="${FILENAME%.*}"
    local EXT="${FILENAME##*.}"

    echo "Processing: $NAME ($EXT)..."
    echo "🔍 Extracting metadata from $SCHEMATIC_FILE..."
    METADATA=$(node scripts/extract_schematic_metadata.js "$SCHEMATIC_FILE" 2>/dev/null)
    if [[ -z "$METADATA" ]]; then
        echo "⚠️  Warning: Could not extract metadata for $NAME"
        METADATA="{}"
    fi
    
    
    if [[ "$EXT" == "schem" ]]; then
        node scripts/schem2json.js "$SCHEMATIC_FILE" "${NAME}_temp.json"
    elif [[ "$EXT" == "schematic" ]]; then
        # First convert old .schematic to .schem format
        # Try converting to .schem first
        echo "🔄 Attempting conversion to .schem format..."
        node scripts/schematic2schem.js "$SCHEMATIC_FILE" "${NAME}_converted.schem" 2>/dev/null
        
        if [[ -f "${NAME}_converted.schem" ]]; then
            node scripts/schem2json.js "${NAME}_converted.schem" "${NAME}_temp.json"
            rm -f "${NAME}_converted.schem"
        else
            echo "⚠️  Conversion failed, using direct .schematic parser"
            # ← Use schematic2json.js directly on the old format
            node scripts/schematic2json.js "$SCHEMATIC_FILE" "${NAME}_temp.json"
        fi
    else
        echo "❌ Unknown format: $EXT (expected .schem or .schematic)"
        return 1
    fi
    
    if [[ ! -f "${NAME}_temp.json" ]]; then
        echo "❌ Conversion failed for $NAME"
        return 1
    fi
    
    node scripts/schem_to_blueprint.js "${NAME}_temp.json" "$NAME" "$METADATA"
    
    rm -f "${NAME}_temp.json"
    
    if [[ -f "${NAME}_blueprint.json" ]]; then
        mv "${NAME}_blueprint.json" "n8n/datatables/blueprints/${NAME}.json"
        echo "✅ Complete: $NAME"
    else
        echo "❌ Blueprint creation failed for $NAME"
        return 1
    fi
}

if [[ "$1" == "-d" || "$1" == "--directory" ]]; then
    if [[ -z "$2" ]]; then
        echo "Error: directory path required with -d flag"
        exit 1
    fi
    
    DIRECTORY=$2
    
    if [[ ! -d "$DIRECTORY" ]]; then
        echo "Error: directory '$DIRECTORY' not found"
        exit 1
    fi
    
    COUNT=0
    for FILE in "$DIRECTORY"/*.{schem,schematic}; do
        if [[ -f "$FILE" ]]; then
            process_schematic "$FILE"
            ((COUNT++))
        fi
    done
    
    if [[ $COUNT -eq 0 ]]; then
        echo "No .schem or .schematic files found in $DIRECTORY"
        exit 1
    fi
    
    echo "✅ Processed $COUNT files"
else
    SCHEMATIC_FILE=$1
    
    if [[ ! -f "$SCHEMATIC_FILE" ]]; then
        echo "Error: file '$SCHEMATIC_FILE' not found"
        exit 1
    fi
    
    process_schematic "$SCHEMATIC_FILE"
fi