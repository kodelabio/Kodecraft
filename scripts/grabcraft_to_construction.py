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
    "Double Stone Brick Slab": "stone_brick_slab",  # Maps to stone_brick_slab (not double)
    "Stone Brick Slab": "stone_brick_slab",
    
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

def convert_grabcraft_to_construction(parsed_blueprint, name, starting_coords=None):
    """
    Convert GrabCraft blueprint to construction format (keeping rectangle representation).
    
    Args:
        parsed_blueprint: The parsed GrabCraft JSON (with inherited fields)
        name: Blueprint name for the output
        starting_coords: [x, y, z] starting coordinates (optional, defaults to [0, 64, 0])
    """
    if starting_coords is None:
        starting_coords = [0, 64, 0]
    
    base_x, base_y, base_z = starting_coords
    
    construction_blueprint = {
        name: {
            "type": "construction",
            "goal": f"Build the {name} structure",
            "conversation": f"Let's build the {name} structure together",
            "agent_count": 1,
            "timeout": 5000,
            "blueprint": {
                "materials": defaultdict(int),
                "levels": []
            },
            "initial_inventory": {
                "0": {}  # Will be filled with materials after counting
            }
        }
    }
    
    # Process each layer
    for layer_id in sorted(parsed_blueprint['layers'].keys(), key=lambda x: int(x) if x.isdigit() else 0):
        layer_data = parsed_blueprint['layers'][layer_id]
        blocks = layer_data['blocks']
        
        if not blocks:
            continue
        
        # Each block in GrabCraft is a single placement unit
        # GrabCraft uses pixel coordinates on a canvas, not block coordinates
        # Each block has an 's' (size) value which indicates the pixel scale
        # Typically s=21 means blocks are on a ~20 pixel grid
        # We need to convert from pixel coordinates to block offsets
        placement_blocks = []
        
        # Determine pixel size from the first block's 's' value
        pixel_size = blocks[0].get('s', 21) if blocks else 21
        
        # Find min coordinates to normalize relative to
        min_x = min(b['x'] for b in blocks) if blocks else 0
        min_y = min(b['y'] for b in blocks) if blocks else 0
        
        for block in blocks:
            minecraft_material = get_minecraft_block(block['h'])
            
            # Count as 1 block
            construction_blueprint[name]["blueprint"]["materials"][minecraft_material] += 1
            
            # Convert from GrabCraft pixel coordinates to Minecraft block coordinates
            # Divide by pixel_size to get block offsets, then subtract minimum to get relative position
            block_x = (block['x'] - min_x) // pixel_size
            block_z = (block['y'] - min_y) // pixel_size  # GrabCraft y = Z in world
            
            placement_block = {
                "x": block_x,
                "z": block_z,
                "material": minecraft_material
            }
            placement_blocks.append(placement_block)
        
        if placement_blocks:
            # Each layer should be at a different height
            # Layer 1 at base_y, layer 2 at base_y + 1, layer 3 at base_y + 2, etc.
            layer_y = base_y + (int(layer_id) - 1)
            
            level = {
                "level": int(layer_id),
                "coordinates": [0, layer_y, 0],
                "blocks": placement_blocks
            }
            
            construction_blueprint[name]["blueprint"]["levels"].append(level)
    
    # Convert materials defaultdict to regular dict
    construction_blueprint[name]["blueprint"]["materials"] = dict(
        construction_blueprint[name]["blueprint"]["materials"]
    )
    
    # Populate initial_inventory with all materials
    construction_blueprint[name]["initial_inventory"]["0"] = dict(
        construction_blueprint[name]["blueprint"]["materials"]
    )
    
    return construction_blueprint

def convert_file(input_json_path, output_json_path, blueprint_name, starting_coords=None):
    """Convert a GrabCraft JSON file to construction format."""
    
    with open(input_json_path, 'r') as f:
        grabcraft_data = json.load(f)
    
    construction_data = convert_grabcraft_to_construction(
        grabcraft_data,
        blueprint_name,
        starting_coords
    )
    
    with open(output_json_path, 'w') as f:
        json.dump(construction_data, f, indent=2)
    
    print(f"✓ Converted to {output_json_path}")
    
    # Print summary
    bp = construction_data[blueprint_name]['blueprint']
    print(f"\nSummary:")
    print(f"  Levels: {len(bp['levels'])}")
    total_blocks = sum(bp['materials'].values())
    print(f"  Total blocks: {total_blocks}")
    print(f"  Unique materials: {len(bp['materials'])}")
    print(f"\nMaterials:")
    for material, count in sorted(bp['materials'].items()):
        print(f"  {material}: {count}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python grabcraft_to_construction.py <input_json> <output_json> [blueprint_name] [x,y,z]")
        print("\nExample:")
        print("  python grabcraft_to_construction.py steampunk_parsed.json construction.json steampunk 0,64,0")
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
        except ValueError as e:
            print(f"Error: Invalid coordinate format. Use x,y,z (e.g., 0,64,0)")
            print(f"Details: {e}")
            sys.exit(1)
    
    convert_file(input_file, output_file, blueprint_name, starting_coords)