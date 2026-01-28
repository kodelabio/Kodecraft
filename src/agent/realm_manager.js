// src/agent/realm_manager.js
export class RealmManager {
    constructor(worldBounds = null) {
        this.realms = new Map();
        this.leaderRealms = new Map();
        this.worldBounds = worldBounds || {
            minX: -10000,
            maxX: 10000,
            minZ: -10000,
            maxZ: 10000
        };
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
        const existingRealms = Array.from(this.realms.values());
        const { minX, maxX, minZ, maxZ } = this.worldBounds;
        
        for (let x = minX; x < maxX; x += (realmSize + padding)) {
            for (let z = minZ; z < maxZ; z += (realmSize + padding)) {
                const candidateBounds = {
                    minX: x,
                    maxX: x + realmSize,
                    minZ: z,
                    maxZ: z + realmSize,
                    minY: 0,
                    maxY: 320
                };
                
                const hasConflict = existingRealms.some(realm => 
                    this.boundsOverlap(candidateBounds, realm.bounds)
                );
                
                if (!hasConflict) {
                    return candidateBounds;
                }
            }
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