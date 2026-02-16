#!/usr/bin/env python3
"""
Split a blueprint into multiple non-overlapping blueprints divided by Z axis.
Each resulting blueprint can be assigned to a separate agent.
"""

import json
import sys
from collections import defaultdict

def split_blueprint_by_z(input_json_path, output_prefix, num_agents=2):
    """
    Split a blueprint into multiple blueprints divided along the Z axis.
    
    Args:
        input_json_path: Path to the input blueprint JSON
        output_prefix: Prefix for output filenames (e.g., "stone_house" -> "stone_house_part1.json")
        num_agents: Number of agents (blueprints to create)
    """
    
    with open(input_json_path, 'r') as f:
        blueprint_data = json.load(f)
    
    # Get the blueprint name (should be the only key)
    blueprint_name = list(blueprint_data.keys())[0]
    blueprint = blueprint_data[blueprint_name]
    
    # Find Z range across all blocks
    min_z = float('inf')
    max_z = float('-inf')
    
    for level in blueprint['blueprint']['levels']:
        for block in level['blocks']:
            block_z = block['z']
            min_z = min(min_z, block_z)
            max_z = max(max_z, block_z)
    
    print(f"✓ Found Z range: {min_z} to {max_z}")
    z_range = max_z - min_z + 1
    z_per_agent = z_range / num_agents
    
    print(f"✓ Z range per agent: {z_per_agent}")
    
    # Create divisions for each agent
    divisions = []
    for i in range(num_agents):
        div_min_z = min_z + (i * z_per_agent)
        div_max_z = min_z + ((i + 1) * z_per_agent)
        divisions.append({
            'index': i + 1,
            'min_z': div_min_z,
            'max_z': div_max_z,
            'blocks_by_level': defaultdict(list)
        })
    
    print(f"\n✓ Created {num_agents} agent divisions:")
    for div in divisions:
        print(f"  Agent {div['index']}: Z {div['min_z']:.1f} to {div['max_z']:.1f}")
    
    # Assign blocks to divisions
    for level in blueprint['blueprint']['levels']:
        level_id = level['level']
        for block in level['blocks']:
            block_z = block['z']
            
            # Find which division this block belongs to
            for div in divisions:
                if div['min_z'] <= block_z < div['max_z']:
                    div['blocks_by_level'][level_id].append(block)
                    break
    
    # Create output blueprints
    for div in divisions:
        # Create new blueprint structure
        new_blueprint = {
            f"{blueprint_name}_part{div['index']}": {
                "type": blueprint.get("type", "construction"),
                "goal": f"{blueprint.get('goal', 'Build structure')} (Agent {div['index']}/{num_agents})",
                "conversation": f"{blueprint.get('conversation', 'Build structure')} (Agent {div['index']}/{num_agents})",
                "agent_count": 1,
                "timeout": blueprint.get("timeout", 5000),
                "blueprint": {
                    "materials": defaultdict(int),
                    "levels": []
                },
                "initial_inventory": {"0": {}}
            }
        }
        
        bp_key = f"{blueprint_name}_part{div['index']}"
        
        # Build levels with only blocks from this division
        for level in blueprint['blueprint']['levels']:
            level_id = level['level']
            division_blocks = div['blocks_by_level'].get(level_id, [])
            
            if division_blocks:
                # Count materials
                for block in division_blocks:
                    material = block['material']
                    new_blueprint[bp_key]['blueprint']['materials'][material] += 1
                
                # Create level with blocks from this division
                new_level = {
                    "level": level_id,
                    "coordinates": level['coordinates'].copy(),
                    "blocks": division_blocks
                }
                new_blueprint[bp_key]['blueprint']['levels'].append(new_level)
        
        # Convert materials to dict
        new_blueprint[bp_key]['blueprint']['materials'] = dict(
            new_blueprint[bp_key]['blueprint']['materials']
        )
        
        # Populate initial_inventory
        new_blueprint[bp_key]['initial_inventory']['0'] = dict(
            new_blueprint[bp_key]['blueprint']['materials']
        )
        
        # Write output file
        output_path = f"{output_prefix}_part{div['index']}.json"
        with open(output_path, 'w') as f:
            json.dump(new_blueprint, f, indent=2)
        
        total_blocks = sum(new_blueprint[bp_key]['blueprint']['materials'].values())
        print(f"\n✓ Created {output_path}")
        print(f"  Levels: {len(new_blueprint[bp_key]['blueprint']['levels'])}")
        print(f"  Total blocks: {total_blocks}")
        print(f"  Materials: {new_blueprint[bp_key]['blueprint']['materials']}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python blueprint_splitter.py <input_json> [output_prefix] [num_agents]")
        print("\nExample:")
        print("  python blueprint_splitter.py stone_house.json stone_house 2")
        print("\nThis will create:")
        print("  stone_house_part1.json (Agent 1)")
        print("  stone_house_part2.json (Agent 2)")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_prefix = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.json', '')
    num_agents = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    
    print(f"Splitting blueprint: {input_file}")
    print(f"Output prefix: {output_prefix}")
    print(f"Number of agents: {num_agents}\n")
    
    split_blueprint_by_z(input_file, output_prefix, num_agents)
    print("\n✓ Blueprint splitting complete!")

if __name__ == "__main__":
    main()