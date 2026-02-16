import json
import sys
from collections import defaultdict

# Mapping from GrabCraft material names to Minecraft block IDs
MATERIAL_MAPPING = {
    # Stone variants
    "Stone": "stone",
    "Cobblestone": "cobblestone",
    "Mossy Cobblestone": "mossy_cobblestone",
    "Stone Bricks": "stone_bricks",
    "Cracked Stone Bricks": "cracked_stone_bricks",
    "Chiseled Stone Bricks": "chiseled_stone_bricks",
    "Mossy Stone Bricks": "mossy_stone_bricks",
    
    # Wood variants
    "Oak Wood": "oak_log",
    "Spruce Wood": "spruce_log",
    "Birch Wood": "birch_log",
    "Jungle Wood": "jungle_log",
    "Acacia Wood": "acacia_log",
    "Dark Oak Wood": "dark_oak_log",
    "Mangrove Wood": "mangrove_log",
    
    # Planks
    "Oak Planks": "oak_planks",
    "Spruce Planks": "spruce_planks",
    "Birch Planks": "birch_planks",
    "Jungle Planks": "jungle_planks",
    "Acacia Planks": "acacia_planks",
    "Dark Oak Planks": "dark_oak_planks",
    "Mangrove Planks": "mangrove_planks",
    
    # Stairs
    "Oak Stairs": "oak_stairs",
    "Spruce Stairs": "spruce_stairs",
    "Birch Stairs": "birch_stairs",
    "Jungle Stairs": "jungle_stairs",
    "Acacia Stairs": "acacia_stairs",
    "Dark Oak Stairs": "dark_oak_stairs",
    "Stone Stairs": "stone_stairs",
    
    # Doors and gates
    "Oak Door": "oak_door",
    "Spruce Door": "spruce_door",
    "Birch Door": "birch_door",
    "Jungle Door": "jungle_door",
    "Acacia Door": "acacia_door",
    "Dark Oak Door": "dark_oak_door",
    "Oak Fence": "oak_fence",
    "Spruce Fence": "spruce_fence",
    "Birch Fence": "birch_fence",
    "Jungle Fence": "jungle_fence",
    "Acacia Fence": "acacia_fence",
    "Dark Oak Fence": "dark_oak_fence",
    
    # Prismarine variants
    "Prismarine": "prismarine",
    "Prismarine Bricks": "prismarine_bricks",
    "Dark Prismarine": "dark_prismarine",
    
    # Light sources
    "Torch": "torch",
    "Sea Lantern": "sea_lantern",
    "Glowstone": "glowstone",
    "Lantern": "lantern",
    
    # Glass and panes
    "Glass": "glass",
    "Glass Pane": "glass_pane",
    "Dark Glass": "dark_glass",
    
    # Blocks
    "Iron Block": "iron_block",
    "Gold Block": "gold_block",
    "Diamond Block": "diamond_block",
    "Emerald Block": "emerald_block",
    "Quartz Block": "quartz_block",
    "Purpur Block": "purpur_block",
    
    # Wool
    "White Wool": "white_wool",
    "Orange Wool": "orange_wool",
    "Magenta Wool": "magenta_wool",
    "Light Blue Wool": "light_blue_wool",
    "Yellow Wool": "yellow_wool",
    "Lime Wool": "lime_wool",
    "Pink Wool": "pink_wool",
    "Gray Wool": "gray_wool",
    "Light Gray Wool": "light_gray_wool",
    "Cyan Wool": "cyan_wool",
    "Purple Wool": "purple_wool",
    "Blue Wool": "blue_wool",
    "Brown Wool": "brown_wool",
    "Green Wool": "green_wool",
    "Red Wool": "red_wool",
    "Black Wool": "black_wool",
}

def get_minecraft_block(grabcraft_name):
    """Convert GrabCraft material name to Minecraft block ID."""
    if grabcraft_name in MATERIAL_MAPPING:
        return MATERIAL_MAPPING[grabcraft_name]
    
    # Fallback: convert to lowercase and replace spaces with underscores
    fallback = grabcraft_name.lower().replace(" ", "_")
    print(f"Warning: No mapping for '{grabcraft_name}', using fallback '{fallback}'")
    return fallback

def normalize_coordinates(blocks):
    """Find the bounding box and normalize coordinates."""
    if not blocks:
        return blocks, (0, 0, 0, 0)
    
    all_x = []
    all_y = []
    
    for block in blocks:
        all_x.extend([block['x'], block['x2']])
        all_y.extend([block['y'], block['y1']])
    
    min_x = min(all_x)
    max_x = max(all_x)
    min_y = min(all_y)
    max_y = max(all_y)
    
    return (min_x, max_x, min_y, max_y)

def expand_rectangle(block):
    """Expand a rectangle block into individual coordinates."""
    x1, x2 = block['x'], block['x2']
    y1, y2 = block['y1'], block['y']  # Note: y1 is bottom, y is top in GrabCraft
    
    # Ensure proper ordering
    x_min, x_max = min(x1, x2), max(x1, x2)
    y_min, y_max = min(y1, y2), max(y1, y2)
    
    coordinates = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            coordinates.append((x, y, block['h']))
    
    return coordinates

def create_placement_grid(blocks, bounds):
    """Create a 2D placement grid from expanded blocks."""
    min_x, max_x, min_y, max_y = bounds
    
    width = max_x - min_x + 1
    height = max_y - min_y + 1
    
    # Initialize grid with air
    grid = [["air" for _ in range(width)] for _ in range(height)]
    
    # Fill grid with blocks
    for block in blocks:
        x1, x2 = block['x'], block['x2']
        y1, y2 = block['y1'], block['y']
        
        # Ensure proper ordering
        x_min, x_max = min(x1, x2), max(x1, x2)
        y_min, y_max = min(y1, y2), max(y1, y2)
        
        material = get_minecraft_block(block['h'])
        
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                grid_x = x - min_x
                grid_y = y - min_y
                grid[grid_y][grid_x] = material
    
    return grid

def convert_grabcraft_to_minecraft(parsed_blueprint, name, starting_coords=None):
    """
    Convert GrabCraft blueprint to Minecraft construction format.
    
    Args:
        parsed_blueprint: The parsed GrabCraft JSON (with inherited fields)
        name: Blueprint name for the output
        starting_coords: [x, y, z] starting coordinates (optional, defaults to [0, 64, 0])
    """
    if starting_coords is None:
        starting_coords = [0, 64, 0]
    
    minecraft_blueprint = {
        name: {
            "type": "construction",
            "goal": f"Build the {name} structure",
            "conversation": f"Let's build the {name} structure together",
            "agent_count": 1,
            "timeout": 5000,
            "blueprint": {
                "materials": defaultdict(int),
                "levels": []
            }
        }
    }
    
    base_x, base_y, base_z = starting_coords
    
    # Process each layer
    for layer_id in sorted(parsed_blueprint['layers'].keys(), key=lambda x: int(x) if x.isdigit() else 0):
        layer_data = parsed_blueprint['layers'][layer_id]
        blocks = layer_data['blocks']
        
        if not blocks:
            continue
        
        # Get bounds for this layer
        bounds = normalize_coordinates(blocks)
        min_x, max_x, min_y, max_y = bounds
        
        # Create placement grid
        placement = create_placement_grid(blocks, bounds)
        
        # Count materials
        for row in placement:
            for block_type in row:
                if block_type != "air":
                    minecraft_blueprint[name]["blueprint"]["materials"][block_type] += 1
        
        # Calculate level height (Y in Minecraft)
        # Layer ID typically represents height offset
        level_y = base_y + int(layer_id)
        
        level = {
            "level": int(layer_id),
            "coordinates": [base_x, level_y, base_z],
            "placement": placement
        }
        
        minecraft_blueprint[name]["blueprint"]["levels"].append(level)
    
    # Convert materials defaultdict to regular dict
    minecraft_blueprint[name]["blueprint"]["materials"] = dict(
        minecraft_blueprint[name]["blueprint"]["materials"]
    )
    
    return minecraft_blueprint

def convert_file(input_json_path, output_json_path, blueprint_name, starting_coords=None):
    """Convert a GrabCraft JSON file to Minecraft format."""
    
    with open(input_json_path, 'r') as f:
        grabcraft_data = json.load(f)
    
    minecraft_data = convert_grabcraft_to_minecraft(
        grabcraft_data,
        blueprint_name,
        starting_coords
    )
    
    with open(output_json_path, 'w') as f:
        json.dump(minecraft_data, f, indent=2)
    
    print(f"✓ Converted to {output_json_path}")
    
    # Print summary
    bp = minecraft_data[blueprint_name]['blueprint']
    print(f"\nSummary:")
    print(f"  Levels: {len(bp['levels'])}")
    print(f"  Total blocks: {sum(bp['materials'].values())}")
    print(f"  Unique materials: {len(bp['materials'])}")
    print(f"\nMaterials:")
    for material, count in sorted(bp['materials'].items()):
        print(f"  {material}: {count}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python grabcraft_to_minecraft.py <input_json> <output_json> [blueprint_name] [x,y,z]")
        print("\nExample:")
        print("  python grabcraft_to_minecraft.py steampunk_parsed.json minecraft_blueprint.json steampunk 0,64,0")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    blueprint_name = sys.argv[3] if len(sys.argv) > 3 else "blueprint"
    
    starting_coords = None
    if len(sys.argv) > 4:
        coords_str = sys.argv[4]
        try:
            starting_coords = [int(c.strip()) for c in coords_str.split(',')]
            if len(starting_coords) != 3:
                print("Error: Coordinates must be 3 values (x,y,z)")
                sys.exit(1)
        except ValueError:
            print("Error: Invalid coordinate format. Use x,y,z (e.g., 0,64,0)")
            sys.exit(1)
    
    convert_file(input_file, output_file, blueprint_name, starting_coords)