#!/bin/bash
set -e

echo "🔧 Applying patches to mindcraft submodule..."

cd mindcraft

if [ ! -f ../patches/mindcraft.patch ]; then
    echo "⚠️  No patches found at ../patches/mindcraft.patch"
    cd ..
    exit 0
fi

echo "📋 Applying mindcraft.patch..."
git apply ../patches/mindcraft.patch

if [ $? -eq 0 ]; then
    echo "✓ Patches applied successfully"
else
    echo "❌ Failed to apply patches"
    cd ..
    exit 1
fi

cd ..
echo "✓ Done"