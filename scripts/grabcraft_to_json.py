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
    "Double Stone Brick Slab": "stone_bricks",  # Maps to stone_brick (it's a double )
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

    # Japanese house materials (add these at the end)
    "Oak Wood Stairs": "oak_stairs",
    "Jungle Wood Stairs": "jungle_stairs",
    "Oak Wood Plank": "oak_planks",
    "Jungle Wood Plank": "jungle_planks",
    "Oak Door": "oak_door",
    "Ladder": "ladder",
    "Clay": "terracotta",
    "Stone Pressure Plate": "stone_pressure_plate"
}



def get_minecraft_block(grabcraft_name):
    """Convert GrabCraft material name to Minecraft block ID."""

    # Strip directional data first: remove everything from first '(' onward
    clean_name = grabcraft_name.split('(')[0].rstrip(' _')
    # Check if cleaned name has a mapping
    if clean_name in MATERIAL_MAPPING:
        return MATERIAL_MAPPING[clean_name]
    
    # Fallback: convert to lowercase and replace spaces with underscores
    fallback = clean_name.lower().replace(" ", "_")
    print(f"Warning: No mapping for '{grabcraft_name}' (cleaned: '{clean_name}'), using fallback '{fallback}'")
    return fallback

def snake_sort(blocks):
    from itertools import groupby
    sorted_by_x = sorted(blocks, key=lambda b: (b['x'], b['z']))
    result = []
    for x, group in groupby(sorted_by_x, key=lambda b: b['x']):
        col = list(group)
        if len(result) > 0:
            # Check last block's z to determine direction
            last_z = result[-1]['z']
            if abs(col[0]['z'] - last_z) > abs(col[-1]['z'] - last_z):
                col = list(reversed(col))
        result.extend(col)
    return result

def perimeter_walk_sort(blocks):
    """Sort blocks to walk around the perimeter clockwise"""
    if not blocks:
        return blocks
    
    # Find bounding box
    xs = [b['x'] for b in blocks]
    zs = [b['z'] for b in blocks]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    
    # Classify each block by which edge it's closest to
    classified = []
    for b in blocks:
        dist_to_left = b['x'] - min_x
        dist_to_right = max_x - b['x']
        dist_to_front = b['z'] - min_z
        dist_to_back = max_z - b['z']
        
        min_dist = min(dist_to_left, dist_to_right, dist_to_front, dist_to_back)
        
        # Determine edge and sort key for clockwise walk
        if min_dist == dist_to_front:
            edge = 'front'
            sort_key = b['x']  # left to right along front
        elif min_dist == dist_to_right:
            edge = 'right'
            sort_key = b['z']  # front to back along right
        elif min_dist == dist_to_back:
            edge = 'back'
            sort_key = max_x - b['x']  # right to left along back
        else:  # dist_to_left
            edge = 'left'
            sort_key = max_z - b['z']  # back to front along left
        
        classified.append({'block': b, 'edge': edge, 'sort_key': sort_key})
    
    # Sort by edge priority, then by sort_key within edge
    edge_priority = {'front': 0, 'right': 1, 'back': 2, 'left': 3}
    classified.sort(key=lambda c: (edge_priority[c['edge']], c['sort_key']))
    
    return [c['block'] for c in classified]

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
        # pixel_size = blocks[0].get('s', 21) if blocks else 21
        all_coords = sorted(set(b['x'] for b in blocks)) + sorted(set(b['y'] for b in blocks))
        all_coords_x = sorted(set(b['x'] for b in blocks))
        all_coords_y = sorted(set(b['y'] for b in blocks))
        gaps_x = [all_coords_x[i+1] - all_coords_x[i] for i in range(len(all_coords_x)-1)]
        gaps_y = [all_coords_y[i+1] - all_coords_y[i] for i in range(len(all_coords_y)-1)]
        all_gaps = gaps_x + gaps_y
        pixel_size = min(all_gaps) if all_gaps else blocks[0].get('s', 21)


        
        # Find min coordinates to normalize relative to
        min_x = min(b['x'] for b in blocks) if blocks else 0
        min_y = min(b['y'] for b in blocks) if blocks else 0

        
        # seen = {}
        for block in blocks:
            minecraft_material = get_minecraft_block(block['h'])
            construction_blueprint[name]["blueprint"]["materials"][minecraft_material] += 1
            block_x = round((block['x'] - min_x) / pixel_size)
            block_z = round((block['y'] - min_y) / pixel_size)
            # Add directly to list (no deduplication)
            placement_blocks.append({"x": block_x, "z": block_z, "material": minecraft_material})
            #
            #key = (block_x, block_z)
            #if key in seen:
            #    # Remove the material count for the block being overwritten
            #    old_material = seen[key]['material']
            #    construction_blueprint[name]["blueprint"]["materials"][old_material] -= 1
            #seen[key] = {"x": block_x, "z": block_z, "material": minecraft_material}

        # placement_blocks = perimeter_walk_sort(list(seen.values()))
        placement_blocks = perimeter_walk_sort(placement_blocks)


        # ← ADD DEBUG HERE
        if layer_id == "1":
            x_coords = [b['x'] for b in placement_blocks]
            z_coords = [b['z'] for b in placement_blocks]
            print(f"Level 1 footprint:")
            print(f"  X range: {min(x_coords)} to {max(x_coords)} (width: {max(x_coords) - min(x_coords) + 1})")
            print(f"  Z range: {min(z_coords)} to {max(z_coords)} (depth: {max(z_coords) - min(z_coords) + 1})")
            print(f"  Block count: {len(placement_blocks)}")
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

    print("\n" + "="*60)
    print("CONVERSION VERIFICATION")
    print("="*60)
    
    # Count original blocks from parsed_data (input)
    original_block_count = 0
    for layer_num in grabcraft_data["layers"]:
        original_block_count += len(grabcraft_data["layers"][layer_num]["blocks"])
    
    # Count converted blocks
    converted_block_count = 0
    for level in bp["levels"]:
        converted_block_count += len(level["blocks"])
    
    print(f"Original blocks (Grabcraft):  {original_block_count}")
    print(f"Converted blocks (Blueprint): {converted_block_count}")
    print(f"Materials total:              {total_blocks}")
    
    if original_block_count == converted_block_count == total_blocks:
        print("✓ All counts match perfectly!")
    else:
        print(f"✗ MISMATCH DETECTED!")
        if original_block_count != converted_block_count:
            print(f"  Lost {original_block_count - converted_block_count} blocks in conversion!")
        if converted_block_count != total_blocks:
            print(f"  Material count doesn't match block count!")
    

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