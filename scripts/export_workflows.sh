#!/bin/bash

# Load environment variables from .env
POSTGRES_USER=${POSTGRES_USER:-root}
POSTGRES_DB=${POSTGRES_DB:-n8n}

# Default container names
PG_CONTAINER="a-team-postgres-1"
N8N_CONTAINER="n8n"
OUTPUT_DIR="./n8n/workflows"

# Function to display help
show_help() {
    cat << EOF
Export n8n workflows by tag

USAGE:
    ./export_workflowssh [OPTIONS] <tag-name>

OPTIONS:
    -h, --help              Show this help message
    -o, --output DIR        Output directory (default: ./n8n/backup)
    -p, --postgres CONTAINER
                            PostgreSQL container name (default: a-team-postgres-1)
    -n, --n8n CONTAINER     N8N container name (default: n8n)
    -l, --list              List available tags and exit

EXAMPLES:
    # Export to default location
    ./export_workflows.sh "#agent"

    # Custom output directory
    ./export_workflows.sh -o "./my-backups" "#agent"

    # Custom containers
    ./export_workflows.sh -p "prod-postgres-1" -n "prod-n8n" "#agent"

    # All options
    ./export_workflows.sh -o "./backups" -p "a-team-postgres-1" -n "n8n" "#agent"

    # List available tags
    ./export_workflows.sh --list

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -p|--postgres)
            PG_CONTAINER="$2"
            shift 2
            ;;
        -n|--n8n)
            N8N_CONTAINER="$2"
            shift 2
            ;;
        -l|--list)
            echo "Available tags:"
            docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT DISTINCT name FROM tag_entity;"
            exit 0
            ;;
        -*)
            echo "Error: Unknown option $1"
            show_help
            exit 1
            ;;
        *)
            TAG="$1"
            shift
            ;;
    esac
done


# Generate timestamp directory
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="${OUTPUT_DIR}/${TIMESTAMP}"


# Check if tag was provided
if [ -z "$TAG" ]; then
    echo "Error: Tag name not provided"
    echo ""
    show_help
    exit 1
fi

echo "Exporting workflows with tag: $TAG"
echo "Output directory: $OUTPUT_DIR"
echo "PostgreSQL container: $PG_CONTAINER"
echo "N8N container: $N8N_CONTAINER"
echo ""

# Verify containers exist
if ! docker exec "$PG_CONTAINER" true 2>/dev/null; then
    echo "Error: PostgreSQL container '$PG_CONTAINER' not found or not running"
    exit 1
fi

if ! docker exec "$N8N_CONTAINER" true 2>/dev/null; then
    echo "Error: N8N container '$N8N_CONTAINER' not found or not running"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Get workflow IDs with the specified tag
WORKFLOWS=$(docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
SELECT we.id 
FROM workflow_entity we 
LEFT JOIN workflows_tags wt ON we.id = wt.\"workflowId\" 
LEFT JOIN tag_entity t ON wt.\"tagId\" = t.id 
WHERE t.name = '$TAG' OR we.name ILIKE '%$TAG%'
ORDER BY we.name;
")

if [ -z "$WORKFLOWS" ]; then
    echo "No workflows found with tag: $TAG"
    exit 1
fi

# Create temporary directory in container for exports
TEMP_DIR="/tmp/exports-$$"
docker exec "$N8N_CONTAINER" mkdir -p "$TEMP_DIR"

# Export each workflow
count=0
while IFS= read -r workflow_id; do
    workflow_id=$(echo "$workflow_id" | xargs)  # Trim whitespace
    
    if [ -z "$workflow_id" ]; then
        continue
    fi
    
    # Get workflow name for filename
    WORKFLOW_NAME=$(docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT name FROM workflow_entity WHERE id = '$workflow_id';")
    WORKFLOW_NAME=$(echo "$WORKFLOW_NAME" | xargs)  # Trim whitespace
    
    # Sanitize filename
    SAFE_NAME=$(echo "$WORKFLOW_NAME" | sed 's/[^a-zA-Z0-9_-]/-/g')
    
    echo "Exporting: $WORKFLOW_NAME (ID: $workflow_id)"
    
    # Export the workflow to temporary directory
    docker exec "$N8N_CONTAINER" n8n export:workflow --id="$workflow_id" --output="$TEMP_DIR/${SAFE_NAME}-${workflow_id}.json"
    
    if [ $? -eq 0 ]; then
        echo "✓ Exported $WORKFLOW_NAME"
        ((count++))
    else
        echo "✗ Failed to export $WORKFLOW_NAME"
    fi
    
    echo ""
done <<< "$WORKFLOWS"

# Copy files from container to host
echo "Copying files from container to host..."
docker cp "$N8N_CONTAINER:$TEMP_DIR/." "$OUTPUT_DIR/"

# Cleanup temporary directory in container
docker exec "$N8N_CONTAINER" rm -rf "$TEMP_DIR"

echo ""
echo "Export complete! Exported $count workflows."
echo "Files are in $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/*.json 2>/dev/null | tail -n $count