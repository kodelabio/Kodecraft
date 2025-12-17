#!/bin/bash

# generate-embeddings.sh
# Pre-generates embeddings for examples and skill docs
# Usage: ./generate-embeddings.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔄 EMBEDDING GENERATION SCRIPT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"

# Check if project root is correct
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${RED}❌ Error: Could not find package.json${NC}"
    echo -e "${RED}   Expected at: $PROJECT_ROOT/package.json${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Project root: $PROJECT_ROOT${NC}\n"

# Check if embeddings directory exists
EMBEDDINGS_DIR="$PROJECT_ROOT/data/embeddings"
if [ ! -d "$EMBEDDINGS_DIR" ]; then
    echo -e "${YELLOW}📁 Creating embeddings directory...${NC}"
    mkdir -p "$EMBEDDINGS_DIR"
    echo -e "${GREEN}✓ Created: $EMBEDDINGS_DIR${NC}\n"
else
    echo -e "${GREEN}✓ Embeddings directory exists: $EMBEDDINGS_DIR${NC}\n"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js version: $NODE_VERSION${NC}\n"

# Check if the generate script exists
GENERATE_SCRIPT="$PROJECT_ROOT/scripts/generate_embeddings.js"
if [ ! -f "$GENERATE_SCRIPT" ]; then
    echo -e "${RED}❌ Error: Generate script not found${NC}"
    echo -e "${RED}   Expected at: $GENERATE_SCRIPT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Generate script found: $GENERATE_SCRIPT${NC}\n"

# Run the embeddings generation
echo -e "${BLUE}🚀 Starting embeddings generation...${NC}\n"

cd "$PROJECT_ROOT"

if node "$GENERATE_SCRIPT"; then
    echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ EMBEDDINGS GENERATION COMPLETED SUCCESSFULLY${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"
    
    # Check if embeddings file was created
    if [ -f "$EMBEDDINGS_DIR/embeddings.json" ]; then
        FILE_SIZE=$(du -h "$EMBEDDINGS_DIR/embeddings.json" | cut -f1)
        echo -e "${GREEN}✓ Embeddings file: $EMBEDDINGS_DIR/embeddings.json${NC}"
        echo -e "${GREEN}✓ File size: $FILE_SIZE${NC}\n"
        
        echo -e "${BLUE}Next steps:${NC}"
        echo -e "  1. Update docker-compose.yml volume mount (if needed)"
        echo -e "  2. Start containers: docker-compose up"
        echo -e "  3. Workers will load embeddings from cache automatically\n"
    else
        echo -e "${YELLOW}⚠️  Warning: Embeddings file not found at expected location${NC}\n"
    fi
    
    exit 0
else
    echo -e "\n${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ EMBEDDINGS GENERATION FAILED${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}\n"
    exit 1
fi
