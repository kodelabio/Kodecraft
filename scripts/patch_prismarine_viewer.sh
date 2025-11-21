#!/bin/bash

# This script patches prismarine-viewer to suppress "Unknown entity" errors
# These are harmless errors that occur when the viewer encounters entity types 
# it doesn't have 3D models for (like trader_llama, item, etc.)

ENTITY_FILE="node_modules/prismarine-viewer/viewer/lib/entity/Entity.js"

if [ ! -f "$ENTITY_FILE" ]; then
    echo "Error: Entity.js not found at $ENTITY_FILE"
    exit 1
fi

echo "Patching $ENTITY_FILE..."

# Find the line with "Unknown entity" and comment it out or wrap in try-catch
# The original code throws an error, we'll change it to log a warning instead

# Create a backup
cp "$ENTITY_FILE" "$ENTITY_FILE.backup"

# Use sed to replace the throw statement with a console.warn (non-breaking)
# This is a conservative patch that still logs but doesn't throw
sed -i "s/throw new Error(\`Unknown entity \${type}\`)/console.warn(\`Unknown entity: \${type} (rendering as box)\`)/g" "$ENTITY_FILE"

echo "✓ Patched successfully!"
echo "Backup created at $ENTITY_FILE.backup"
echo ""
echo "To revert the patch:"
echo "  cp $ENTITY_FILE.backup $ENTITY_FILE"