export class RealmManager {
    constructor(worldInfo = null) {
        this.worldInfo = worldInfo;
        
        if (worldInfo) {
            this.initializeWorldBounds();
        }
    }

    initializeWorldBounds() {
        if (!this.worldInfo) return;
        
        if (this.worldInfo.worldType === 'flat') {
            this.worldBounds = {
                minX: -10000,
                maxX: 10000,
                minZ: -10000,
                maxZ: 10000
            };
        } else if (this.worldInfo.worldType === 'default' || this.worldInfo.worldType === 'normal') {
            this.worldBounds = {
                minX: -29999984,
                maxX: 29999984,
                minZ: -29999984,
                maxZ: 29999984
            };
        } else {
            const buffer = 10000;
            this.worldBounds = {
                minX: this.worldInfo.spawnPoint.x - buffer,
                maxX: this.worldInfo.spawnPoint.x + buffer,
                minZ: this.worldInfo.spawnPoint.z - buffer,
                maxZ: this.worldInfo.spawnPoint.z + buffer
            };
        }
        
        console.log(`🌍 World bounds initialized:`);
        console.log(`   Type: ${this.worldInfo.worldType}`);
        console.log(`   X: [${this.worldBounds.minX}, ${this.worldBounds.maxX}]`);
        console.log(`   Z: [${this.worldBounds.minZ}, ${this.worldBounds.maxZ}]`);
    }

    calculateRealmSize(leader_pr_value) {
        const baseSize = 300;
        const multiplier = leader_pr_value / 100;
        return Math.floor(baseSize * multiplier);
    }

    // In realm_manager.js
    calculateRealmGrid(maxPlayers, worldWidth, worldDepth) {
        const sqrtPlayers = Math.sqrt(maxPlayers);
        const cols = Math.ceil(sqrtPlayers);
        const rows = Math.ceil(maxPlayers / cols);
        
        const realmWidth = Math.floor(worldWidth / cols);
        const realmDepth = Math.floor(worldDepth / rows);
        
        return {
            cols: cols,
            rows: rows,
            realmWidth: realmWidth,
            realmDepth: realmDepth,
            totalBlocksPerRealm: realmWidth * realmDepth
        };
    }

// For 10 players in 20000×20000 world:
// cols = 4, rows = 3
// realmWidth = 5000, realmDepth = 6667
// Per player: 33,335,000 blocks ✓

    findAvailableRealmSpace(realmSize, existingRealms = [], padding = 50) {
        const { minX, maxX, minZ, maxZ } = this.worldBounds;
        
        const worldWidth = maxX - minX;
        const worldDepth = maxZ - minZ;
        
        console.log(`📏 Allocating realm of size ${realmSize} in world [${worldWidth} x ${worldDepth}]`);
        
        let currentZ = minZ;
        
        while (currentZ < maxZ) {
            const candidateBounds = {
                minX: minX,
                maxX: maxX,
                minZ: currentZ,
                maxZ: currentZ + realmSize,
                minY: this.worldInfo.minY,
                maxY: this.worldInfo.maxY
            };
            
            const hasConflict = existingRealms.some(realm => 
                this.boundsOverlap(candidateBounds, realm.bounds, padding)
            );
            
            if (!hasConflict) {
                return candidateBounds;
            }
            
            currentZ += (realmSize + padding);
        }
        
        return null;
    }

    boundsOverlap(bounds1, bounds2, padding = 50) {
        return !(bounds1.maxX + padding < bounds2.minX ||
                 bounds1.minX - padding > bounds2.maxX ||
                 bounds1.maxZ + padding < bounds2.minZ ||
                 bounds1.minZ - padding > bounds2.maxZ);
    }

    validateMovement(position, bounds) {
        if (!bounds) return { valid: true };
        
        const { x, y, z } = position;
        const { minX, maxX, minZ, maxZ, minY, maxY } = bounds;
        
        const xOk = x >= minX && x <= maxX;
        const zOk = z >= minZ && z <= maxZ;
        const yOk = !minY || !maxY || (y >= minY && y <= maxY);
        
        if (!xOk || !zOk || !yOk) {
            return {
                valid: false,
                error: `Trespass detected! Position ${JSON.stringify(position)} outside realm bounds`,
                bounds: bounds
            };
        }
        
        return { valid: true };
    }

    getRandomPosInRealm(bounds) {
        return {
            x: Math.floor(Math.random() * (bounds.maxX - bounds.minX) + bounds.minX),
            y: bounds.minY || -64,
            z: Math.floor(Math.random() * (bounds.maxZ - bounds.minZ) + bounds.minZ)
        };
    }
}

export const globalRealmManager = new RealmManager();