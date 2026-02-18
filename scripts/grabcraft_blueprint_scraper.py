import json
import re
import sys
import requests
from pathlib import Path
from urllib.parse import urljoin

def fetch_webpage(url):
    """
    Fetch the webpage content or read local file.
    """
    # Check if it's a local file
    if url.startswith('/') or url.startswith('.') or '://' not in url:
        try:
            with open(url, 'r', encoding='utf-8') as f:
                return f.read()
        except IOError as e:
            raise ValueError(f"Failed to read local file {url}: {e}")
    
    # Otherwise fetch from URL
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        raise ValueError(f"Failed to fetch {url}: {e}")

def find_layermap_script(html_content):
    """
    Find and extract the layerMap JavaScript from the HTML.
    Looks for patterns like LayerMap_<numbers>.js
    """
    # Find all script tags with src attributes
    script_src_pattern = r'<script\s+[^>]*src=["\']([^"\']*LayerMap_\d+\.js)["\'][^>]*>'
    matches = re.findall(script_src_pattern, html_content, re.IGNORECASE)
    
    if matches:
        return matches[0]
    
    # If not found as src, look for inline layerMap variable
    inline_pattern = r'var\s+layerMap\s*=\s*(\{.*?\});'
    match = re.search(inline_pattern, html_content, re.DOTALL)
    
    if match:
        return "inline"
    
    return None

def extract_layermap_from_js(js_content):
    """
    Extract the layerMap object from JavaScript content.
    Handles minified JavaScript with proper brace matching.
    """
    # Find the start of layerMap
    start_match = re.search(r'var\s+layerMap\s*=\s*\{', js_content, re.IGNORECASE)
    
    if not start_match:
        raise ValueError("Could not find 'var layerMap' in the JavaScript content")
    
    # Start from the opening brace
    start_pos = start_match.start() + js_content[start_match.start():].index('{')
    
    # Find the matching closing brace by counting braces
    brace_count = 0
    end_pos = start_pos
    in_string = False
    escape_next = False
    
    for i in range(start_pos, len(js_content)):
        char = js_content[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"' and not in_string:
            in_string = True
            continue
        elif char == '"' and in_string:
            in_string = False
            continue
        
        if not in_string:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_pos = i + 1
                    break
    
    if brace_count != 0:
        raise ValueError("Could not find matching closing brace for layerMap object")
    
    js_object = js_content[start_pos:end_pos]
    
    # Remove trailing semicolon if present
    js_object = js_object.rstrip(';').rstrip()
    
    # Convert JavaScript object to valid JSON
    json_str = js_object.replace("'", '"')
    
    # Parse the JSON
    try:
        layermap_data = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON at position: {e}")
        print(f"Problematic content: {json_str[:200]}...")
        raise
    
    return layermap_data

def parse_blueprint(html_content, base_url):
    """
    Parse a Minecraft blueprint from HTML content.
    Handles field inheritance for x2 and y1 coordinates.
    """
    # Find the layerMap script
    script_path = find_layermap_script(html_content)
    
    if not script_path:
        raise ValueError("Could not find layerMap script in the webpage")
    
    print(f"Found script: {script_path}")
    
    # Get the JavaScript content
    if script_path == "inline":
        js_content = html_content
        print("  (inline script)")
    else:
        script_url = urljoin(base_url, script_path)
        print(f"  Fetching from: {script_url}")
        js_content = fetch_webpage(script_url)
    
    # Extract layerMap
    layermap = extract_layermap_from_js(js_content)
    
    # Process layers with field inheritance
    blueprint = {
        "url": base_url,
        "script": script_path,
        "layers": {},
        "metadata": {
            "total_layers": len(layermap),
            "total_blocks": 0,
            "field_info": {
                "x": "Left boundary (X coordinate)",
                "y": "Top boundary (Y coordinate, decreases downward)",
                "x2": "Right boundary (width extent)",
                "y1": "Bottom boundary (height extent)",
                "s": "Size/thickness in pixels",
                "h": "Material type (e.g., Stone, Dark Oak Wood)"
            }
        }
    }
    
    for layer_id, blocks in layermap.items():
        # Apply field inheritance within the layer
        inherited_blocks = []
        last_x2 = None
        last_y1 = None
        
        for block_idx, block in enumerate(blocks):
            # Create a copy to avoid modifying the original
            block_copy = block.copy()
            
            # Inherit x2 and y1 from previous block if not specified
            if "x2" not in block_copy:
                if last_x2 is not None:
                    block_copy["x2"] = last_x2
                else:
                    # If it's the first block and no x2, try to use x as fallback (single column)
                    if "x" in block_copy:
                        block_copy["x2"] = block_copy["x"]
                        print(f"Warning: Block {block_idx} in layer {layer_id} missing x2, using x as fallback")
            
            if "y1" not in block_copy:
                if last_y1 is not None:
                    block_copy["y1"] = last_y1
                else:
                    # If it's the first block and no y1, try to use y as fallback (single row)
                    if "y" in block_copy:
                        block_copy["y1"] = block_copy["y"]
                        print(f"Warning: Block {block_idx} in layer {layer_id} missing y1, using y as fallback")
            
            # Update last known values
            if "x2" in block_copy:
                last_x2 = block_copy["x2"]
            if "y1" in block_copy:
                last_y1 = block_copy["y1"]
            
            inherited_blocks.append(block_copy)
        
        blueprint["layers"][layer_id] = {
            "block_count": len(inherited_blocks),
            "blocks": inherited_blocks
        }
        blueprint["metadata"]["total_blocks"] += len(inherited_blocks)
    
    return blueprint

def save_to_json(data, output_path):
    """Save parsed blueprint to JSON file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    print(f"✓ Saved to {output_path}")

def save_to_csv(data, output_path):
    """Save parsed blueprint to CSV file."""
    import csv
    
    rows = []
    for layer_id, layer_data in data["layers"].items():
        for block in layer_data["blocks"]:
            row = {
                "layer": layer_id,
                "x": block.get("x"),
                "y": block.get("y"),
                "size": block.get("s"),
                "height": block.get("h"),
                "x2": block.get("x2"),
                "y1": block.get("y1")
            }
            rows.append(row)
    
    if rows:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Saved to {output_path}")

def print_summary(data):
    """Print a summary of the blueprint."""
    print("\n" + "="*60)
    print("MINECRAFT BLUEPRINT SUMMARY")
    print("="*60)
    print(f"URL: {data['url']}")
    print(f"Script: {data['script']}")
    print(f"\nTotal Layers: {data['metadata']['total_layers']}")
    print(f"Total Blocks: {data['metadata']['total_blocks']}")
    print("\nBlocks per Layer:")
    
    for layer_id in sorted(data["layers"].keys(), key=lambda x: int(x) if x.isdigit() else x):
        block_count = data["layers"][layer_id]["block_count"]
        print(f"  Layer {layer_id}: {block_count} blocks")
    
    if "1" in data["layers"] and len(data["layers"]["1"]["blocks"]) > 0:
        print("\nSample Block (Layer 1, Block 1):")
        sample_block = data["layers"]["1"]["blocks"][0]
        for key, value in sample_block.items():
            print(f"  {key}: {value}")
    
    print("="*60 + "\n")

def get_filename_from_url(url):
    """Generate a filename from the blueprint URL."""
    # Extract the blueprint name from URL
    match = re.search(r'/minecraft/([^/]+)/([^/?#]+)', url)
    if match:
        return f"{match.group(1)}_{match.group(2)}"
    return "blueprint"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python minecraft_blueprint_scraper.py <url> [output_format]")
        print("  url: GrabCraft blueprint URL")
        print("  output_format: 'json' (default), 'csv', or 'both'")
        print("\nExample:")
        print("  python minecraft_blueprint_scraper.py https://www.grabcraft.com/minecraft/steampunk-marine-ship/sailing-ships#blueprints")
        sys.exit(1)
    
    url = sys.argv[1]
    output_format = sys.argv[2].lower() if len(sys.argv) > 2 else "json"
    
    try:
        # Fetch and parse blueprint
        print(f"Fetching {url}...")
        html_content = fetch_webpage(url)
        
        print("Parsing blueprint...")
        blueprint = parse_blueprint(html_content, url)
        
        # Print summary
        print_summary(blueprint)
        
        # Generate filename
        filename = get_filename_from_url(url)
        
        # Save output
        if output_format in ["json", "both"]:
            save_to_json(blueprint, f"{filename}_parsed.json")
        
        if output_format in ["csv", "both"]:
            save_to_csv(blueprint, f"{filename}_parsed.csv")
        
        print("Done!")
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)