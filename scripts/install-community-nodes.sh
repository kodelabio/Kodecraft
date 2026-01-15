#!/bin/bash
# This script installs community nodes for n8n.

# Check if nodes-list.txt exists
if [ ! -f "nodes-list.txt" ]; then
    echo "Error: nodes-list.txt not found!"
    exit 1
fi

echo "Installing n8n community nodes from nodes-list.txt..."

# Read each line and install
while IFS= read -r node; do
    # Skip empty lines
    [ -z "$node" ] && continue
    
    echo "Installing $node..."
    docker exec n8n n8n npm --install "$node"
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully installed $node"
    else
        echo "✗ Failed to install $node"
    fi
done < nodes-list.txt

echo "Installation complete!"


