#docker exec n8n n8n export:workflow --all --pretty --separate --output=./n8n/workflows.json

# Get the workflow IDs first
workflow_ids=$(docker exec a-team-postgres-1 psql -U root -d n8n -t -A -c "SELECT id FROM workflow_entity WHERE parentFolderId = (SELECT id FROM folder WHERE name='Minecraft')")

# Extract each workflow to its own file
for id in $workflow_ids; do
  if [[ -n "$id" && "$id" != " " ]]; then
    # Get workflow name for filename
    name=$(docker exec a-team-postgres-1 psql -U root -d n8n -t -A -c "SELECT name FROM workflow_entity WHERE id = '$id';")
    clean_name=$(echo "$name" | tr ' ' '_' | tr -cd '[:alnum:]_-')
    
    # Extract the complete workflow JSON
    docker exec a-team-postgres-1 psql -U root -d n8n -t -A -c "
    SELECT jsonb_pretty(
      jsonb_build_object(
        'id', id,
        'name', name,
        'nodes', nodes,
        'connections', connections,
        'active', active,
        'settings', settings,
        'staticData', \"staticData\",
        'pinData', \"pinData\",
        'versionId', \"versionId\",
        'meta', meta
      )
    ) FROM workflow_entity WHERE id = '$id';
    " > "./n8n/workflow_${id}_${clean_name}.json"
    
    echo "Exported: workflow_${id}_${clean_name}.json"
  fi
done
