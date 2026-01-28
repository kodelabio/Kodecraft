// src/agent/realm_manager.js
export class RealmManager {
    constructor(worldInfo = null) {
      this.realms = new Map();
      this.leaderRealms = new Map();
      this.worldInfo = worldInfo || {
          dimension: 'overworld',
          minY: -64,
          maxY: 320,
          worldType: 'flat',
          spawnPoint: { x: 0, y: -60, z: 0 }
      };
      
      // Initialize world bounds based on world type
      this.initializeWorldBounds();
    }

    initializeWorldBounds() {
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
            // Custom world - use spawn as center with buffer
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
        console.log(`   Y: [${this.worldInfo.minY}, ${this.worldInfo.maxY}]`);
    }

    calculateRealmSize(leader_pr_value) {
        const baseSize = 300;
        const multiplier = leader_pr_value / 100;
        return Math.floor(baseSize * multiplier);
    }

    boundsOverlap(bounds1, bounds2, padding = 50) {
        return !(bounds1.maxX + padding < bounds2.minX ||
                 bounds1.minX - padding > bounds2.maxX ||
                 bounds1.maxZ + padding < bounds2.minZ ||
                 bounds1.minZ - padding > bounds2.maxZ);
    }

    findAvailableRealmSpace(realmSize, padding = 50) {
      const { minX, maxX, minZ, maxZ } = this.worldBounds;
      const existingRealms = Array.from(this.realms.values());
      
      const worldWidth = maxX - minX;
      const worldDepth = maxZ - minZ;
      
      // Allocate based on world dimensions
      console.log(`📏 Allocating realm of size ${realmSize} in world [${worldWidth} x ${worldDepth}]`);
      
      // Try allocating sequentially in Z-axis
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

    defineRealm(realmId, leaderId, bounds) {
        // bounds: { minX, maxX, minZ, maxZ, minY?, maxY? }
        this.realms.set(realmId, {
            realmId,
            leaderId,
            bounds,
            workers: [],
            createdAt: Date.now()
        });
        this.leaderRealms.set(leaderId, realmId);
    }

    isWithinBounds(position, realmId) {
        const realm = this.realms.get(realmId);
        if (!realm) return false;
        
        const { x, y, z } = position;
        const { minX, maxX, minZ, maxZ, minY, maxY } = realm.bounds;
        
        const xOk = x >= minX && x <= maxX;
        const zOk = z >= minZ && z <= maxZ;
        const yOk = !minY || !maxY || (y >= minY && y <= maxY);
        
        return xOk && zOk && yOk;
    }

    validateMovement(position, realmId) {
        if (!this.isWithinBounds(position, realmId)) {
            const realm = this.realms.get(realmId);
            return {
                valid: false,
                error: `Trespass detected! Position ${JSON.stringify(position)} outside realm ${realmId}`,
                realm: realm.bounds
            };
        }
        return { valid: true };
    }

    registerWorkerToRealm(workerName, realmId) {
        const realm = this.realms.get(realmId);
        if (realm) {
            realm.workers.push(workerName);
        }
    }

    getRealmForLeader(leaderId) {
        return this.leaderRealms.get(leaderId);
    }

    registerLeaderToRealm(leaderId, realmId) {
      const realm = this.realms.get(realmId);
      if (realm) {
          realm.leaderId = leaderId;
          this.leaderRealms.set(leaderId, realmId);
          return true;
        }
      return false;
    }

    getLeaderRealm(leaderId) {
      return this.leaderRealms.get(leaderId);
    }


}