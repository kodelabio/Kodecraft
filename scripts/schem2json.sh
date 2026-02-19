#!/bin/bash
SCHEM_FILE=$1
FILENAME=$(basename "$SCHEM_FILE" .schem)

node scripts/schem2json.js "$SCHEM_FILE" "${FILENAME}_temp.json"
node scripts/schem_to_blueprint.js "${FILENAME}_temp.json" "$FILENAME"

rm "${FILENAME}_temp.json"
mv "${FILENAME}_blueprint.json" "n8n/datatables/blueprints/${FILENAME}.json"

echo "✅ Complete: $FILENAME"