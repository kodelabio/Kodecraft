// MongoDB Build Location Manager
// This module handles storing and retrieving build locations from MongoDB

export class BuildLocationManager {
    constructor(mongoClient = null) {
        this.mongoClient = mongoClient;
        this.dbName = 'minecraft';
        this.collectionName = 'build_locations';
        this.fallbackStorage = new Map(); // In-memory fallback
    }

    // Store a build location
    async storeBuildLocation(location, sessionId, buildRequest, structureSize) {
        const locationRecord = {
            location: `${location.x},${location.y},${location.z}`,
            structure_type: buildRequest.substring(0, 100),
            built_at: new Date().toISOString(),
            session_id: sessionId,
            coordinates: location,
            size: structureSize,
            status: 'reserved'
        };

        try {
            if (this.mongoClient) {
                const db = this.mongoClient.db(this.dbName);
                const collection = db.collection(this.collectionName);
                await collection.insertOne(locationRecord);
                console.log(`Build location stored in MongoDB: x=${location.x}, z=${location.z}`);
            } else {
                // Fallback to in-memory storage
                this.fallbackStorage.set(sessionId, locationRecord);
                console.log(`Build location stored in memory: x=${location.x}, z=${location.z}`);
            }
            return true;
        } catch (error) {
            console.error('Error storing build location:', error);
            // Fallback to memory even if MongoDB fails
            this.fallbackStorage.set(sessionId, locationRecord);
            return false;
        }
    }

    // Get existing build locations
    async getExistingBuildLocations() {
        try {
            if (this.mongoClient) {
                const db = this.mongoClient.db(this.dbName);
                const collection = db.collection(this.collectionName);
                
                // Get builds from the last 24 hours that are not completed
                const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const builds = await collection.find({
                    built_at: { $gte: cutoffTime.toISOString() },
                    status: { $in: ['reserved', 'building'] }
                }).toArray();
                
                console.log(`Retrieved ${builds.length} existing builds from MongoDB`);
                return builds;
            } else {
                // Fallback to in-memory storage
                const builds = Array.from(this.fallbackStorage.values());
                console.log(`Retrieved ${builds.length} existing builds from memory`);
                return builds;
            }
        } catch (error) {
            console.error('Error retrieving build locations:', error);
            return Array.from(this.fallbackStorage.values());
        }
    }

    // Update build status (reserved -> building -> completed)
    async updateBuildStatus(sessionId, newStatus) {
        try {
            if (this.mongoClient) {
                const db = this.mongoClient.db(this.dbName);
                const collection = db.collection(this.collectionName);
                
                await collection.updateOne(
                    { session_id: sessionId },
                    { 
                        $set: { 
                            status: newStatus,
                            updated_at: new Date().toISOString()
                        }
                    }
                );
                console.log(`Updated build status for ${sessionId}: ${newStatus}`);
            } else {
                // Fallback to in-memory storage
                const record = this.fallbackStorage.get(sessionId);
                if (record) {
                    record.status = newStatus;
                    record.updated_at = new Date().toISOString();
                }
            }
            return true;
        } catch (error) {
            console.error('Error updating build status:', error);
            return false;
        }
    }

    // Check if a location has conflicts with existing builds
    async checkLocationConflicts(location, structureSize, minDistance = 50) {
        const existingBuilds = await this.getExistingBuildLocations();
        
        return existingBuilds.some(build => {
            if (!build.coordinates) return false;
            const distance = Math.sqrt(
                Math.pow(location.x - build.coordinates.x, 2) + 
                Math.pow(location.z - build.coordinates.z, 2)
            );
            return distance < (minDistance + (build.size || 25));
        });
    }

    // Find a clear build location
    async findClearBuildLocation(preferredLocation, structureSize) {
        const minDistance = structureSize + 20;
        let buildLocation = { ...preferredLocation };
        
        // Check if preferred location is clear
        const hasConflict = await this.checkLocationConflicts(buildLocation, structureSize, minDistance);
        
        if (!hasConflict) {
            return buildLocation;
        }
        
        // Find alternative location
        let attempts = 0;
        while (attempts < 10) {
            const angle = (attempts * 60) * (Math.PI / 180);
            buildLocation = {
                x: Math.floor(preferredLocation.x + Math.cos(angle) * minDistance),
                y: preferredLocation.y,
                z: Math.floor(preferredLocation.z + Math.sin(angle) * minDistance)
            };
            
            const conflictExists = await this.checkLocationConflicts(buildLocation, structureSize, minDistance);
            if (!conflictExists) {
                break;
            }
            
            attempts++;
        }
        
        return buildLocation;
    }

    // Clean up old build records
    async cleanupOldBuilds(maxAgeHours = 24) {
        try {
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
            
            if (this.mongoClient) {
                const db = this.mongoClient.db(this.dbName);
                const collection = db.collection(this.collectionName);
                
                const result = await collection.deleteMany({
                    built_at: { $lt: cutoffTime.toISOString() },
                    status: 'completed'
                });
                
                console.log(`Cleaned up ${result.deletedCount} old build records`);
            } else {
                // Clean up in-memory storage
                const cutoffTimestamp = cutoffTime.getTime();
                for (const [sessionId, record] of this.fallbackStorage) {
                    const recordTime = new Date(record.built_at).getTime();
                    if (recordTime < cutoffTimestamp && record.status === 'completed') {
                        this.fallbackStorage.delete(sessionId);
                    }
                }
            }
        } catch (error) {
            console.error('Error cleaning up old builds:', error);
        }
    }
}