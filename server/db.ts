import dotenv from 'dotenv';

// Load environment variables before everything else
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

// Retry utility function for database operations
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Only retry on connection-related errors
      if (
        (error.code === 'ETIMEDOUT' ||
         error.code === 'ECONNREFUSED' ||
         error.code === 'ENOTFOUND' ||
         error.message?.includes('WebSocket') ||
         error.message?.includes('connection') ||
         error.message?.includes('timeout')) &&
        attempt < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        break;
      }
    }
  }

  console.error(`${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
  throw lastError;
}

const parseDatabaseUrls = (): string[] => {
  const dbUrl = process.env.DATABASE_URL || '';
  const urls = dbUrl.split(',').map(url => url.trim()).filter(Boolean);
  
  if (urls.length === 0) {
    throw new Error('DATABASE_URL must be set with at least one database connection string');
  }
  
  return urls;
};

export interface DatabaseInstance {
  id: number;
  pool: Pool;
  db: ReturnType<typeof drizzle>;
  url: string;
}

class DatabaseManager {
  private instances: DatabaseInstance[] = [];
  private currentWriteIndex = 0;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    const urls = parseDatabaseUrls();
    
    this.instances = urls.map((url, index) => {
      const pool = new Pool({ 
        connectionString: url,
        connectionTimeoutMillis: 10000, // 10 seconds
        idleTimeoutMillis: 30000, // 30 seconds
        max: 10, // Maximum number of connections
        allowExitOnIdle: true
      });
      const db = drizzle({ client: pool, schema });
      
      return {
        id: index,
        pool,
        db,
        url,
      };
    });

    console.log(`Initialized ${this.instances.length} Neon database connections for distributed storage`);
    
    // Initialize shard metadata after a short delay to ensure connections are ready
    setTimeout(() => {
      this.initializeShardMetadata().then(() => {
        // Start periodic optimization (every 30 minutes)
        setInterval(() => {
          this.optimizeShardSelection().catch(error => {
            console.error('Shard optimization error:', error);
          });
        }, 30 * 60 * 1000); // 30 minutes
        
        // Run initial optimization
        this.optimizeShardSelection().catch(error => {
          console.error('Initial shard optimization error:', error);
        });
      }).catch(error => {
        console.error('Failed to initialize shard metadata:', error);
      });
    }, 1000);
  }

  getAllInstances(): DatabaseInstance[] {
    return this.instances;
  }

  getPrimaryInstance(): DatabaseInstance {
    return this.instances[0];
  }

  getInstanceForWrite(): DatabaseInstance {
    if (this.instances.length === 1) {
      return this.instances[0];
    }

    const instance = this.instances[this.currentWriteIndex];
    this.currentWriteIndex = (this.currentWriteIndex + 1) % this.instances.length;
    return instance;
  }

  async getInstanceByLeastUsed(): Promise<DatabaseInstance> {
    if (this.instances.length === 1) {
      return this.instances[0];
    }

    try {
      const usagePromises = this.instances.map(async (instance) => {
        try {
          // Get metadata for max size and active status
          const [metadata] = await retryWithBackoff(
            () => instance.db
              .select()
              .from(schema.dbShardMetadata)
              .where(eq(schema.dbShardMetadata.shardId, instance.id))
              .limit(1),
            3,
            1000,
            `Metadata query for shard ${instance.id}`
          );

          const maxSize = metadata?.maxSize || 524288000; // 500MB default
          const isActive = metadata?.isActive !== false; // Default to true if not found

          // Get actual database size using PostgreSQL system queries
          let currentSize = 0;
          try {
            const sizeResult = await retryWithBackoff(
              () => instance.pool.query(`
                SELECT pg_database_size(current_database()) as db_size_bytes
              `),
              3,
              1000,
              `Size query for shard ${instance.id}`
            );
            
            if (sizeResult.rows && sizeResult.rows.length > 0) {
              currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
            }
          } catch (sizeError) {
            console.warn(`Error getting real-time size for shard ${instance.id}, using metadata:`, sizeError);
            currentSize = metadata?.currentSize || 0;
          }

          return {
            instance,
            usage: currentSize,
            maxSize,
            utilizationPercent: (currentSize / maxSize) * 100,
            isActive,
            availableSpace: maxSize - currentSize,
          };
        } catch (error) {
          console.warn(`Error fetching metadata for shard ${instance.id}:`, error);
          return {
            instance,
            usage: 0,
            maxSize: 524288000,
            utilizationPercent: 0,
            isActive: true,
            availableSpace: 524288000,
          };
        }
      });

      const usageData = await Promise.all(usagePromises);
      
      // Filter out inactive or full shards
      const activeShards = usageData.filter(
        data => data.isActive && data.utilizationPercent < 95 // Leave 5% buffer
      );

      if (activeShards.length === 0) {
        console.warn('All shards are full or inactive, using least full active shard');
        const leastFull = usageData
          .filter(data => data.isActive)
          .sort((a, b) => a.utilizationPercent - b.utilizationPercent)[0];
        return leastFull?.instance || this.instances[0];
      }

      // Sort by available space (descending) for best fit
      const leastUsed = activeShards.sort((a, b) => b.availableSpace - a.availableSpace)[0];
      
      console.log(`Selected shard ${leastUsed.instance.id} with ${this.formatBytes(leastUsed.availableSpace)} available`);
      return leastUsed.instance;
    } catch (error) {
      console.warn('Error fetching DB usage, using round-robin:', error);
      return this.getInstanceForWrite();
    }
  }

  async executeOnAllInstances<T>(
    queryFn: (db: ReturnType<typeof drizzle>) => Promise<T[]>
  ): Promise<T[]> {
    const results = await Promise.allSettled(
      this.instances.map(async (instance) => {
        try {
          return await retryWithBackoff(
            () => queryFn(instance.db),
            3,
            1000,
            `Query on instance ${instance.id}`
          );
        } catch (error) {
          console.error(`❌ Database query failed on instance ${instance.id}:`, error);
          return [];
        }
      })
    );
    
    // Extract successful results and flatten
    return results
      .filter((result): result is PromiseFulfilledResult<T[]> => result.status === 'fulfilled')
      .map(result => result.value)
      .flat();
  }

  async getInstanceForUser(userId: string): Promise<DatabaseInstance | null> {
    for (const instance of this.instances) {
      try {
        const [user] = await retryWithBackoff(
          () => instance.db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1),
          3,
          1000,
          `Find user ${userId} on instance ${instance.id}`
        );
        if (user) {
          return instance;
        }
      } catch (error) {
        console.warn(`Error checking user ${userId} on instance ${instance.id}:`, error);
      }
    }
    return null;
  }

  async updateShardMetadata(shardId: number, sizeChange: number) {
    const instance = this.instances.find(i => i.id === shardId);
    if (!instance) return;

    try {
      const [existing] = await retryWithBackoff(
        () => instance.db
          .select()
          .from(schema.dbShardMetadata)
          .where(eq(schema.dbShardMetadata.shardId, shardId))
          .limit(1),
        3,
        1000,
        `Select metadata for shard ${shardId}`
      );

      if (existing) {
        await retryWithBackoff(
          () => instance.db
            .update(schema.dbShardMetadata)
            .set({
              currentSize: Math.max(0, existing.currentSize + sizeChange),
              lastUpdated: new Date(),
            })
            .where(eq(schema.dbShardMetadata.shardId, shardId)),
          3,
          1000,
          `Update metadata for shard ${shardId}`
        );
      } else {
        await retryWithBackoff(
          () => instance.db
            .insert(schema.dbShardMetadata)
            .values({
              shardId,
              currentSize: Math.max(0, sizeChange),
              isActive: true,
              lastUpdated: new Date(),
            })
            .onConflictDoNothing(),
          3,
          1000,
          `Insert metadata for shard ${shardId}`
        );
      }
    } catch (error) {
      console.error(`Error updating shard metadata for shard ${shardId}:`, error);
    }
  }

  async verifyCapacity(estimatedBytes: number): Promise<{ success: boolean; message: string; recommendedShard?: number }> {
    if (this.instances.length === 0) {
      return { success: false, message: 'No database connections available' };
    }

    try {
      const capacityChecks = await Promise.all(
        this.instances.map(async (instance) => {
          try {
            // Get metadata for max size and active status
            const [metadata] = await instance.db
              .select()
              .from(schema.dbShardMetadata)
              .where(eq(schema.dbShardMetadata.shardId, instance.id))
              .limit(1);

            const maxSize = metadata?.maxSize || 524288000;
            const isActive = metadata?.isActive !== false;

            // Get actual database size using PostgreSQL system queries
            let currentSize = 0;
            try {
              const sizeResult = await instance.pool.query(`
                SELECT pg_database_size(current_database()) as db_size_bytes
              `);
              
              if (sizeResult.rows && sizeResult.rows.length > 0) {
                currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
              }
            } catch (sizeError) {
              console.warn(`Error getting real-time database size for shard ${instance.id}, using metadata:`, sizeError);
              currentSize = metadata?.currentSize || 0;
            }

            const available = maxSize - currentSize;
            const utilizationPercent = (currentSize / maxSize) * 100;

            return {
              shardId: instance.id,
              currentSize,
              maxSize,
              available,
              utilizationPercent,
              isActive,
              canFit: available >= estimatedBytes && isActive && utilizationPercent < 95,
              fitWithBuffer: available >= (estimatedBytes * 1.2), // 20% buffer for growth
            };
          } catch (error) {
            console.warn(`Error checking capacity for shard ${instance.id}:`, error);
            return {
              shardId: instance.id,
              currentSize: 0,
              maxSize: 524288000,
              available: 524288000,
              utilizationPercent: 0,
              isActive: true,
              canFit: true,
              fitWithBuffer: true,
            };
          }
        })
      );

      // Find shards that can fit the data
      const viableShards = capacityChecks.filter(check => check.canFit);
      const bufferedShards = capacityChecks.filter(check => check.fitWithBuffer);

      // Prefer shards with buffer space
      const recommendedShard = bufferedShards.length > 0 
        ? bufferedShards.sort((a, b) => b.available - a.available)[0]
        : viableShards.length > 0
        ? viableShards.sort((a, b) => b.available - a.available)[0]
        : null;

      if (!recommendedShard) {
        const totalAvailable = capacityChecks.reduce((sum, check) => sum + check.available, 0);
        const activeShards = capacityChecks.filter(check => check.isActive);
        
        return {
          success: false,
          message: `Insufficient database capacity. Need ${this.formatBytes(estimatedBytes)}, have ${this.formatBytes(totalAvailable)} available across ${activeShards.length} active shards`,
        };
      }

      const bufferWarning = !bufferedShards.some(s => s.shardId === recommendedShard.shardId) 
        ? ' (Warning: Low buffer space)' : '';

      return {
        success: true,
        message: `Sufficient capacity available on shard ${recommendedShard.shardId}${bufferWarning}`,
        recommendedShard: recommendedShard.shardId,
      };
    } catch (error) {
      console.warn('Error checking database capacity:', error);
      return { 
        success: false, 
        message: `Capacity check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  getInstanceCount(): number {
    return this.instances.length;
  }

  getInstanceById(shardId: number): DatabaseInstance | undefined {
    return this.instances.find(instance => instance.id === shardId);
  }

  async getBestInstanceForData(estimatedBytes: number): Promise<DatabaseInstance> {
    const capacityCheck = await this.verifyCapacity(estimatedBytes);
    
    if (!capacityCheck.success) {
      throw new Error(capacityCheck.message);
    }

    if (capacityCheck.recommendedShard !== undefined) {
      const instance = this.getInstanceById(capacityCheck.recommendedShard);
      if (instance) {
        return instance;
      }
    }

    return this.getInstanceByLeastUsed();
  }

  async initializeShardMetadata(): Promise<void> {
    console.log('Initializing shard metadata...');
    
    for (const instance of this.instances) {
      try {
        // Check if metadata exists
        const [existing] = await retryWithBackoff(
          () => instance.db
            .select()
            .from(schema.dbShardMetadata)
            .where(eq(schema.dbShardMetadata.shardId, instance.id))
            .limit(1),
          3,
          1000,
          `Check metadata for shard ${instance.id}`
        );

        if (!existing) {
          // Create initial metadata
          await retryWithBackoff(
            () => instance.db
              .insert(schema.dbShardMetadata)
              .values({
                shardId: instance.id,
                currentSize: 0,
                maxSize: 524288000, // 500MB
                isActive: true,
                lastUpdated: new Date(),
              })
              .onConflictDoNothing(),
            3,
            1000,
            `Insert metadata for shard ${instance.id}`
          );
          
          console.log(`Initialized metadata for shard ${instance.id}`);
        } else {
          console.log(`Shard ${instance.id} metadata already exists - size: ${this.formatBytes(existing.currentSize)}`);
        }
      } catch (error) {
        console.error(`Error initializing metadata for shard ${instance.id}:`, error);
      }
    }
  }

  async getShardStatistics(): Promise<Array<{
    shardId: number;
    currentSize: number;
    maxSize: number;
    utilizationPercent: number;
    isActive: boolean;
    availableSpace: number;
  }>> {
    const stats = await Promise.all(
      this.instances.map(async (instance) => {
        try {
          // Get metadata for max size and active status
          const [metadata] = await retryWithBackoff(
            () => instance.db
              .select()
              .from(schema.dbShardMetadata)
              .where(eq(schema.dbShardMetadata.shardId, instance.id))
              .limit(1),
            3,
            1000,
            `Get metadata for shard ${instance.id}`
          );

          const maxSize = metadata?.maxSize || 524288000;
          const isActive = metadata?.isActive !== false;

          // Get actual database size using PostgreSQL system queries
          let currentSize = 0;
          try {
            // Query to get the actual database size in bytes
            const sizeResult = await retryWithBackoff(
              () => instance.pool.query(`
                SELECT 
                  pg_database_size(current_database()) as db_size_bytes,
                  current_database() as db_name
              `),
              3,
              1000,
              `Get size for shard ${instance.id}`
            );
            
            if (sizeResult.rows && sizeResult.rows.length > 0) {
              currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
            }
          } catch (sizeError) {
            console.error(`Error getting database size for shard ${instance.id}:`, sizeError);
            // Fallback to metadata if direct query fails
            currentSize = metadata?.currentSize || 0;
          }

          return {
            shardId: instance.id,
            currentSize,
            maxSize,
            utilizationPercent: (currentSize / maxSize) * 100,
            isActive,
            availableSpace: maxSize - currentSize,
          };
        } catch (error) {
          console.error(`Error getting shard statistics for shard ${instance.id}:`, error);
          return {
            shardId: instance.id,
            currentSize: 0,
            maxSize: 524288000,
            utilizationPercent: 0,
            isActive: true,
            availableSpace: 524288000,
          };
        }
      })
    );

    return stats;
  }

  async rebalanceShards(): Promise<{
    success: boolean;
    message: string;
    movedRecords?: number;
  }> {
    try {
      const stats = await this.getShardStatistics();
      const overUtilizedShards = stats.filter(stat => stat.utilizationPercent > 85);
      const underUtilizedShards = stats.filter(stat => stat.utilizationPercent < 50 && stat.isActive);

      if (overUtilizedShards.length === 0) {
        return {
          success: true,
          message: 'No shards require rebalancing',
        };
      }

      if (underUtilizedShards.length === 0) {
        return {
          success: false,
          message: 'No available shards for rebalancing',
        };
      }

      let totalMoved = 0;

      // For now, just return a message as actual data migration would be complex
      // In a real implementation, you would:
      // 1. Identify recent records that can be moved
      // 2. Copy data to the target shard
      // 3. Update foreign key references
      // 4. Delete from source shard
      // 5. Update metadata

      console.log(`Rebalancing needed: ${overUtilizedShards.length} over-utilized shards`);
      console.log(`Available targets: ${underUtilizedShards.length} under-utilized shards`);

      return {
        success: true,
        message: `Rebalancing analysis complete. ${overUtilizedShards.length} shards over 85% capacity, ${underUtilizedShards.length} shards available for migration`,
        movedRecords: totalMoved,
      };
    } catch (error) {
      return {
        success: false,
        message: `Rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async optimizeShardSelection(): Promise<void> {
    try {
      const stats = await this.getShardStatistics();
      
      // Log current shard status for monitoring
      console.log('\n📊 Database Shard Status:');
      stats.forEach(stat => {
        const status = stat.utilizationPercent > 90 ? '🔴 CRITICAL' :
                      stat.utilizationPercent > 75 ? '🟡 WARNING' :
                      stat.utilizationPercent > 50 ? '🟢 GOOD' : '🔵 LIGHT';
        
        console.log(`  Shard ${stat.shardId}: ${status} ${stat.utilizationPercent.toFixed(1)}% (${this.formatBytes(stat.currentSize)}/${this.formatBytes(stat.maxSize)})`);
      });

      // Automatically mark shards as inactive if they're too full
      for (const stat of stats) {
        if (stat.utilizationPercent > 95 && stat.isActive) {
          console.log(`⚠️  Marking shard ${stat.shardId} as inactive (${stat.utilizationPercent.toFixed(1)}% full)`);
          const instance = this.getInstanceById(stat.shardId);
          if (instance) {
            await retryWithBackoff(
              () => instance.db
                .update(schema.dbShardMetadata)
                .set({ isActive: false, lastUpdated: new Date() })
                .where(eq(schema.dbShardMetadata.shardId, stat.shardId)),
              3,
              1000,
              `Deactivate shard ${stat.shardId}`
            );
          }
        } else if (stat.utilizationPercent < 80 && !stat.isActive) {
          console.log(`✅ Reactivating shard ${stat.shardId} (${stat.utilizationPercent.toFixed(1)}% full)`);
          const instance = this.getInstanceById(stat.shardId);
          if (instance) {
            await retryWithBackoff(
              () => instance.db
                .update(schema.dbShardMetadata)
                .set({ isActive: true, lastUpdated: new Date() })
                .where(eq(schema.dbShardMetadata.shardId, stat.shardId)),
              3,
              1000,
              `Reactivate shard ${stat.shardId}`
            );
          }
        }
      }
    } catch (error) {
      console.error('Error optimizing shard selection:', error);
    }
  }

  /**
   * Update file chunk record with upload completion details
   */
  async updateFileChunk(chunkData: {
    fileId: string;
    chunkIndex: number;
    dropboxAccountId: number;
    dropboxFileId: string;
    status: string;
    uploadedAt: Date;
    processingServerId: string;
  }): Promise<void> {
    try {
      const instance = this.getInstanceForWrite();
      
      // Store chunk tracking data in memory for distributed processing
      // This will be enhanced with proper database schema later
      if (!(globalThis as any).chunkTracker) {
        (globalThis as any).chunkTracker = new Map();
      }
      
      const chunkKey = `${chunkData.fileId}_${chunkData.chunkIndex}`;
      (globalThis as any).chunkTracker.set(chunkKey, {
        ...chunkData,
        updatedAt: new Date()
      });

      console.log(`💾 Updated chunk ${chunkData.chunkIndex} for file ${chunkData.fileId}`);
    } catch (error: any) {
      console.error(`❌ Failed to update file chunk:`, error.message);
      throw error;
    }
  }

  /**
   * Mark a file chunk as failed
   */
  async markChunkFailed(chunkData: {
    fileId: string;
    chunkIndex: number;
    errorMessage: string;
    attempts: number;
  }): Promise<void> {
    try {
      const instance = this.getInstanceForWrite();
      
      // Store failed chunk data in memory for distributed processing
      if (!(globalThis as any).chunkTracker) {
        (globalThis as any).chunkTracker = new Map();
      }
      
      const chunkKey = `${chunkData.fileId}_${chunkData.chunkIndex}`;
      const existingChunk = (globalThis as any).chunkTracker.get(chunkKey);
      
      (globalThis as any).chunkTracker.set(chunkKey, {
        ...existingChunk,
        fileId: chunkData.fileId,
        chunkIndex: chunkData.chunkIndex,
        status: 'failed',
        errorMessage: chunkData.errorMessage,
        attempts: chunkData.attempts,
        updatedAt: new Date()
      });

      console.log(`❌ Marked chunk ${chunkData.chunkIndex} as failed for file ${chunkData.fileId}`);
    } catch (error: any) {
      console.log(`❌ Failed to mark chunk as failed:`, error.message);
      throw error;
    }
  }

  async checkHealth(): Promise<{ healthy: boolean; details: any[] }> {
    const results = await Promise.allSettled(
      this.instances.map(async (instance) => {
        try {
          // Simple health check - try to execute a basic query
          await retryWithBackoff(
            () => instance.pool.query('SELECT 1'),
            2,
            500,
            `Health check for instance ${instance.id}`
          );
          return { instanceId: instance.id, healthy: true };
        } catch (error) {
          console.warn(`Health check failed for instance ${instance.id}:`, error);
          return { instanceId: instance.id, healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    const details = results.map(result => 
      result.status === 'fulfilled' ? result.value : { instanceId: -1, healthy: false, error: 'Promise rejected' }
    );

    const healthy = details.every(detail => detail.healthy);

    return { healthy, details };
  }
}

export const dbManager = new DatabaseManager();

export const db = dbManager.getPrimaryInstance().db;
export const pool = dbManager.getPrimaryInstance().pool;
