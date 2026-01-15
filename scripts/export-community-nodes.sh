#!/bin/bash
# This creates a `nodes-list.txt` file with the list of installed community nodes in n8n Docker container:
# 
#
#

docker exec n8n cat /home/node/.n8n/nodes/package.json | grep "n8n-nodes-" | sed 's/.*"n8n-nodes-/n8n-nodes-/' | sed 's/".*/:/' | sed 's/: "//' | sed 's/"$//' > nodes-list.txt
