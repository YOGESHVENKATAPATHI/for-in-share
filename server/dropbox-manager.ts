import { Dropbox } from 'dropbox';
import crypto from 'crypto';

interface DropboxAccount {
  id: number;
  appKey: string;
  appSecret: string;
  refreshToken: string;
  maxSizeBytes: number;
  currentSizeBytes: number;
  reservedBytes: number; // New: bytes reserved for pending uploads
}

interface ChunkReservation {
  id: string;
  accountId: number;
  bytes: number;
  timestamp: number;
  expiresAt: number;
}

class DropboxManager {
  private accounts: DropboxAccount[] = [];
  private clients: Map<number, Dropbox> = new Map();
  private readonly CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
  private readonly MAX_RETRIES = 3;
  private currentAccountIndex = 0;
  private reservations: Map<string, ChunkReservation> = new Map(); // Active reservations
  private readonly RESERVATION_TTL = 5 * 60 * 1000; // 5 minutes
  private accountLocks: Map<number, Promise<void>> = new Map(); // Prevent concurrent modifications

  // Default retry configuration (can be overridden by environment variables)
  private readonly DEFAULT_RETRY_CONFIG = {
    maxRetries: parseInt(process.env.DROPBOX_RETRY_MAX || '5'),
    waitForAvailability: (process.env.DROPBOX_WAIT_FOR_AVAILABILITY || 'true') === 'true',
    waitTimeoutMs: parseInt(process.env.DROPBOX_WAIT_TIMEOUT_MS || '300000'), // 5 minutes default
    exponentialBackoff: (process.env.DROPBOX_EXPONENTIAL_BACKOFF || 'true') === 'true'
  };

  constructor() {
    this.initializeAccounts();
  }

  private initializeAccounts() {
    const appKeys = (process.env.DROPBOX_APP_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    const appSecrets = (process.env.DROPBOX_APP_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
    const refreshTokens = (process.env.DROPBOX_REFRESH_TOKEN || '').split(',').map(t => t.trim()).filter(Boolean);

    if (appKeys.length !== appSecrets.length || appKeys.length !== refreshTokens.length) {
      console.warn('Dropbox credential arrays have mismatched lengths');
      const minLength = Math.min(appKeys.length, appSecrets.length, refreshTokens.length);
      appKeys.length = minLength;
      appSecrets.length = minLength;
      refreshTokens.length = minLength;
    }

    if (appKeys.length === 0) {
      console.warn('No Dropbox accounts configured. File uploads will fail.');
      return;
    }

    const maxSizeBytes = 1.8 * 1024 * 1024 * 1024; // 1.8GB per account

    this.accounts = appKeys.map((appKey, index) => ({
      id: index,
      appKey,
      appSecret: appSecrets[index],
      refreshToken: refreshTokens[index],
      maxSizeBytes,
      currentSizeBytes: 0,
      reservedBytes: 0,
    }));

    this.accounts.forEach(account => {
      const dbx = new Dropbox({
        clientId: account.appKey,
        clientSecret: account.appSecret,
        refreshToken: account.refreshToken,
      });
      this.clients.set(account.id, dbx);
    });

    console.log(`Initialized ${this.accounts.length} Dropbox accounts for distributed file storage`);
    
    this.fetchActualUsage();
    this.startReservationCleanup();
  }

  private async fetchActualUsage() {
    for (const account of this.accounts) {
      try {
        const client = this.clients.get(account.id);
        if (client) {
          const spaceUsage = await client.usersGetSpaceUsage();
          if (spaceUsage && spaceUsage.result && 'used' in spaceUsage.result) {
            account.currentSizeBytes = (spaceUsage.result as any).used || 0;
            console.log(`Dropbox account ${account.id}: ${this.formatBytes(account.currentSizeBytes)} / ${this.formatBytes(account.maxSizeBytes)}`);
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch space usage for Dropbox account ${account.id}:`, error);
      }
    }
  }

  getAccountCount(): number {
    return this.accounts.length;
  }

  private startReservationCleanup() {
    // Clean up expired reservations every minute
    setInterval(() => {
      this.cleanupExpiredReservations();
    }, 60 * 1000);
  }

  private cleanupExpiredReservations() {
    const now = Date.now();
    const expired = Array.from(this.reservations.entries())
      .filter(([_, reservation]) => reservation.expiresAt <= now);

    for (const [id, reservation] of expired) {
      console.log(`Cleaning up expired reservation ${id} for ${this.formatBytes(reservation.bytes)} on account ${reservation.accountId}`);
      
      // Release reserved bytes
      const account = this.accounts.find(a => a.id === reservation.accountId);
      if (account) {
        account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
      }
      
      this.reservations.delete(id);
    }

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired reservations`);
    }
  }

  async waitForStorageAvailability(bytes: number, timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      // Clean up expired reservations
      this.cleanupExpiredReservations();
      
      // Check if storage is available now
      let availableAccount = null;
      for (const account of this.accounts) {
        const totalUsed = account.currentSizeBytes + account.reservedBytes;
        const available = account.maxSizeBytes - totalUsed;
        
        if (available >= bytes) {
          availableAccount = account;
          break;
        }
      }
      
      if (availableAccount) {
        console.log(`✅ Storage became available on account ${availableAccount.id} after waiting ${Date.now() - startTime}ms`);
        return true;
      }
      
      // Log wait status
      const timeWaited = Date.now() - startTime;
      const timeRemaining = timeoutMs - timeWaited;
      console.log(`⏳ Waiting for ${this.formatBytes(bytes)} storage... (${Math.round(timeWaited/1000)}s elapsed, ${Math.round(timeRemaining/1000)}s remaining)`);
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.log(`⚠️ Timeout waiting for ${this.formatBytes(bytes)} storage after ${timeoutMs/1000}s`);
    return false;
  }

  private generateReservationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private async acquireAccountLock(accountId: number): Promise<() => void> {
    const existingLock = this.accountLocks.get(accountId);
    if (existingLock) {
      await existingLock;
    }

    let resolveLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });

    this.accountLocks.set(accountId, lockPromise);

    return () => {
      resolveLock();
      this.accountLocks.delete(accountId);
    };
  }

  async reserveStorageWithRetry(bytes: number, options: {
    maxRetries?: number;
    waitForAvailability?: boolean;
    waitTimeoutMs?: number;
    exponentialBackoff?: boolean;
  } = {}): Promise<{
    success: boolean;
    reservationId?: string;
    accountId?: number;
    message: string;
    retriesUsed?: number;
    waitTimeUsed?: number;
  }> {
    const {
      maxRetries = 5,
      waitForAvailability = true,
      waitTimeoutMs = 300000, // 5 minutes
      exponentialBackoff = true
    } = options;
    
    let lastError = '';
    let totalWaitTime = 0;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.reserveStorage(bytes);
        
        if (result.success) {
          if (attempt > 0) {
            console.log(`✅ Storage reservation succeeded on attempt ${attempt + 1} after ${totalWaitTime}ms total wait time`);
          }
          const finalResult = {
            ...result,
            retriesUsed: attempt,
            waitTimeUsed: totalWaitTime
          };
          
          // Debug log the return structure
          console.log(`📋 Reservation success details: accountId=${finalResult.accountId}, reservationId=${finalResult.reservationId}, success=${finalResult.success}`);
          
          return finalResult;
        }
        
        lastError = result.message;
        
        // If this is the last attempt, don't wait
        if (attempt === maxRetries) {
          break;
        }
        
        console.log(`📦 Storage reservation failed (attempt ${attempt + 1}/${maxRetries + 1})`);
        console.log(`   Reason: ${result.message}`);
        
        // If we should wait for availability and this looks like a capacity issue
        if (waitForAvailability && result.message.includes('Insufficient storage')) {
          console.log(`⏳ Waiting for storage to become available...`);
          const waitStart = Date.now();
          const storageAvailable = await this.waitForStorageAvailability(bytes, Math.min(waitTimeoutMs, 60000)); // Max 1 minute per wait
          const waitDuration = Date.now() - waitStart;
          totalWaitTime += waitDuration;
          
          if (storageAvailable) {
            console.log(`✅ Storage became available, retrying immediately...`);
            continue; // Retry immediately
          } else {
            console.log(`⚠️ Storage did not become available within timeout, using exponential backoff...`);
          }
        }
        
        // Calculate delay for retry
        let delay = 1000; // Default 1 second
        if (exponentialBackoff) {
          delay = Math.min(1000 * Math.pow(2, attempt), 16000); // Max 16 seconds
        }
        
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        totalWaitTime += delay;
        
        // Clean up expired reservations before retry
        this.cleanupExpiredReservations();
        
      } catch (error: any) {
        lastError = error.message;
        console.error(`❌ Storage reservation error on attempt ${attempt + 1}:`, error.message);
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = exponentialBackoff ? Math.min(1000 * Math.pow(2, attempt), 16000) : 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        totalWaitTime += delay;
      }
    }
    
    return {
      success: false,
      message: `Failed to reserve storage after ${maxRetries + 1} attempts and ${Math.round(totalWaitTime/1000)}s total wait time. Last error: ${lastError}`,
      retriesUsed: maxRetries + 1,
      waitTimeUsed: totalWaitTime
    };
  }

  async reserveStorage(bytes: number): Promise<{
    success: boolean;
    reservationId?: string;
    accountId?: number;
    message: string;
  }> {
    // Clean up expired reservations first
    this.cleanupExpiredReservations();

    // Sort accounts by available space and try each one that has sufficient space
    const candidateAccounts = this.accounts
      .map(account => {
        const totalUsed = account.currentSizeBytes + account.reservedBytes;
        const available = account.maxSizeBytes - totalUsed;
        return { account, available };
      })
      .filter(item => item.available >= bytes)
      .sort((a, b) => b.available - a.available);

    if (candidateAccounts.length === 0) {
      const totalAvailable = this.accounts.reduce((sum, acc) => {
        const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
        return sum + Math.max(0, acc.maxSizeBytes - totalUsed);
      }, 0);

      // Log detailed storage status for debugging
      console.log(`📊 Storage Status Summary:`);
      this.accounts.forEach((acc, index) => {
        const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
        const available = acc.maxSizeBytes - totalUsed;
        const percentUsed = ((totalUsed / acc.maxSizeBytes) * 100).toFixed(1);
        console.log(`   Account ${index}: ${this.formatBytes(available)} available (${percentUsed}% used)`);
      });
      
      return {
        success: false,
        message: `Insufficient storage: need ${this.formatBytes(bytes)}, have ${this.formatBytes(totalAvailable)} available across all accounts. Consider cleaning up old files or adding more Dropbox accounts.`,
      };
    }

    // Try each candidate account in order of available space
    for (const { account } of candidateAccounts) {
      // Acquire lock for this account
      const releaseLock = await this.acquireAccountLock(account.id);

      try {
        // Double-check availability after acquiring lock
        const totalUsed = account.currentSizeBytes + account.reservedBytes;
        const available = account.maxSizeBytes - totalUsed;

        if (available < bytes) {
          console.log(`⚠️ Account ${account.id} no longer has sufficient space after lock acquisition, trying next...`);
          continue; // Try next account
        }

        // Create reservation
        const reservationId = this.generateReservationId();
        const now = Date.now();
        const reservation: ChunkReservation = {
          id: reservationId,
          accountId: account.id,
          bytes,
          timestamp: now,
          expiresAt: now + this.RESERVATION_TTL,
        };

        // Reserve the bytes
        account.reservedBytes += bytes;
        this.reservations.set(reservationId, reservation);

        console.log(`Reserved ${this.formatBytes(bytes)} on account ${account.id} (reservation: ${reservationId})`);

        return {
          success: true,
          reservationId,
          accountId: account.id,
          message: `Reserved ${this.formatBytes(bytes)} on account ${account.id}`,
        };
      } finally {
        releaseLock();
      }
    }

    // If we get here, all accounts failed after lock acquisition
    return {
      success: false,
      message: `Failed to reserve storage: all accounts with sufficient space became unavailable during lock acquisition`,
    };
  }

  async confirmReservation(reservationId: string, actualBytes: number): Promise<{
    success: boolean;
    message: string;
  }> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return {
        success: false,
        message: `Reservation ${reservationId} not found or expired`,
      };
    }

    if (Date.now() > reservation.expiresAt) {
      this.cleanupExpiredReservations();
      return {
        success: false,
        message: `Reservation ${reservationId} has expired`,
      };
    }

    const account = this.accounts.find(a => a.id === reservation.accountId);
    if (!account) {
      return {
        success: false,
        message: `Account ${reservation.accountId} not found`,
      };
    }

    const releaseLock = await this.acquireAccountLock(account.id);

    try {
      // Convert reservation to actual usage
      account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
      account.currentSizeBytes += actualBytes;

      // Clean up reservation
      this.reservations.delete(reservationId);

      console.log(`Confirmed reservation ${reservationId}: ${this.formatBytes(actualBytes)} now used on account ${account.id}`);

      return {
        success: true,
        message: `Confirmed upload of ${this.formatBytes(actualBytes)} to account ${account.id}`,
      };
    } finally {
      releaseLock();
    }
  }

  async cancelReservation(reservationId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return {
        success: true, // Already gone, that's fine
        message: `Reservation ${reservationId} not found (may have already expired)`,
      };
    }

    const account = this.accounts.find(a => a.id === reservation.accountId);
    if (account) {
      const releaseLock = await this.acquireAccountLock(account.id);
      try {
        account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
        console.log(`Cancelled reservation ${reservationId}: released ${this.formatBytes(reservation.bytes)} on account ${account.id}`);
      } finally {
        releaseLock();
      }
    }

    this.reservations.delete(reservationId);

    return {
      success: true,
      message: `Cancelled reservation ${reservationId}`,
    };
  }

  findBestAccount(requiredBytes: number): number | null {
    if (this.accounts.length === 0) return null;

    // Clean up expired reservations first
    this.cleanupExpiredReservations();

    const availableAccounts = this.accounts
      .filter(account => {
        const totalUsed = account.currentSizeBytes + account.reservedBytes;
        return (account.maxSizeBytes - totalUsed) >= requiredBytes;
      })
      .sort((a, b) => {
        const aUsed = a.currentSizeBytes + a.reservedBytes;
        const bUsed = b.currentSizeBytes + b.reservedBytes;
        return aUsed - bUsed;
      });

    return availableAccounts.length > 0 ? availableAccounts[0].id : null;
  }

  findBestAccountWithReservation(requiredBytes: number): Promise<{
    success: boolean;
    accountId?: number;
    reservationId?: string;
    message: string;
  }> {
    return this.reserveStorage(requiredBytes);
  }

  getNextAccountRoundRobin(): number | null {
    if (this.accounts.length === 0) return null;
    
    const accountId = this.currentAccountIndex;
    this.currentAccountIndex = (this.currentAccountIndex + 1) % this.accounts.length;
    return accountId;
  }

  async verifyCapacity(totalBytesNeeded: number): Promise<{ 
    success: boolean; 
    message: string;
    reservationIds?: string[];
  }> {
    if (this.accounts.length === 0) {
      return { success: false, message: 'No Dropbox accounts configured' };
    }

    // Clean up expired reservations first
    this.cleanupExpiredReservations();

    const chunkSize = this.CHUNK_SIZE;
    const numChunks = Math.ceil(totalBytesNeeded / chunkSize);
    
    // Create simulation of account usage including reserved bytes
    const simulatedUsage = new Map<number, number>();
    this.accounts.forEach(acc => {
      const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
      simulatedUsage.set(acc.id, totalUsed);
    });
    
    const requiredAccounts: Set<number> = new Set();
    const simulatedReservations: string[] = [];
    
    // Simulate allocating each chunk with proper reservation logic
    for (let i = 0; i < numChunks; i++) {
      const chunkBytes = Math.min(chunkSize, totalBytesNeeded - (i * chunkSize));
      
      // Find account with sufficient space in simulation
      let allocatedAccountId: number | null = null;
      let minUsage = Infinity;
      
      for (const account of this.accounts) {
        const simulated = simulatedUsage.get(account.id) || 0;
        const available = account.maxSizeBytes - simulated;
        
        if (available >= chunkBytes && simulated < minUsage) {
          minUsage = simulated;
          allocatedAccountId = account.id;
        }
      }
      
      if (allocatedAccountId === null) {
        const totalAvailable = Array.from(simulatedUsage.entries()).reduce((sum, [id, used]) => {
          const account = this.accounts.find(a => a.id === id);
          return sum + (account ? account.maxSizeBytes - used : 0);
        }, 0);
        
        // Clean up any simulated reservations
        for (const reservationId of simulatedReservations) {
          await this.cancelReservation(reservationId);
        }
        
        return { 
          success: false, 
          message: `Insufficient storage space at chunk ${i + 1}/${numChunks}. Need ${this.formatBytes(totalBytesNeeded)}, have ${this.formatBytes(totalAvailable)} available` 
        };
      }
      
      // Update simulation
      simulatedUsage.set(allocatedAccountId, (simulatedUsage.get(allocatedAccountId) || 0) + chunkBytes);
      requiredAccounts.add(allocatedAccountId);
    }

    return { 
      success: true, 
      message: `File can be distributed across ${requiredAccounts.size} Dropbox account(s)`,
    };
  }

  async verifyCapacityWithReservations(totalBytesNeeded: number): Promise<{ 
    success: boolean; 
    message: string;
    reservationIds?: string[];
  }> {
    if (this.accounts.length === 0) {
      return { success: false, message: 'No Dropbox accounts configured' };
    }

    const chunkSize = this.CHUNK_SIZE;
    const numChunks = Math.ceil(totalBytesNeeded / chunkSize);
    const reservationIds: string[] = [];
    
    try {
      // Create actual reservations for each chunk
      for (let i = 0; i < numChunks; i++) {
        const chunkBytes = Math.min(chunkSize, totalBytesNeeded - (i * chunkSize));
        
        const reservation = await this.reserveStorage(chunkBytes);
        if (!reservation.success) {
          // Rollback all previous reservations
          for (const id of reservationIds) {
            await this.cancelReservation(id);
          }
          
          return {
            success: false,
            message: `Failed to reserve space for chunk ${i + 1}/${numChunks}: ${reservation.message}`,
          };
        }
        
        reservationIds.push(reservation.reservationId!);
      }

      return {
        success: true,
        message: `Successfully reserved space for ${numChunks} chunks across multiple accounts`,
        reservationIds,
      };
    } catch (error) {
      // Rollback all reservations on error
      for (const id of reservationIds) {
        await this.cancelReservation(id);
      }
      
      throw error;
    }
  }

  getClient(accountId: number): Dropbox | undefined {
    return this.clients.get(accountId);
  }

  computeChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async uploadChunkWithRetry(
    accountId: number,
    chunkData: Buffer,
    filePath: string,
    reservationId?: string,
    retryCount = 0
  ): Promise<{ dropboxFileId: string; dropboxPath: string; downloadUrl: string; checksum: string }> {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error(`Dropbox account ${accountId} not found`);
    }

    const checksum = this.computeChecksum(chunkData);

    try {
      const response = await client.filesUpload({
        path: filePath,
        contents: chunkData,
        mode: { '.tag': 'add' },
        autorename: true,
      });

      const verifyResponse = await client.filesGetMetadata({ path: response.result.path_lower || filePath });
      
      if ('size' in verifyResponse.result && verifyResponse.result.size !== chunkData.length) {
        throw new Error('Uploaded file size mismatch');
      }

      // If we have a reservation, confirm it with the actual upload size
      if (reservationId) {
        const confirmResult = await this.confirmReservation(reservationId, chunkData.length);
        if (!confirmResult.success) {
          console.warn(`Failed to confirm reservation ${reservationId}: ${confirmResult.message}`);
          // Still update usage manually as a fallback
          this.updateAccountUsage(accountId, chunkData.length);
        }
      } else {
        // No reservation, update usage directly
        this.updateAccountUsage(accountId, chunkData.length);
      }

      // Generate permanent download URL
      const downloadUrl = await this.createPermanentDownloadUrl(accountId, response.result.path_display || filePath);

      return {
        dropboxFileId: response.result.id,
        dropboxPath: response.result.path_display || filePath,
        downloadUrl,
        checksum,
      };
    } catch (error) {
      console.error(`Dropbox upload error (attempt ${retryCount + 1}/${this.MAX_RETRIES}):`, error);
      
      if (retryCount < this.MAX_RETRIES - 1) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.uploadChunkWithRetry(accountId, chunkData, filePath, reservationId, retryCount + 1);
      }
      
      throw new Error(`Failed to upload chunk after ${this.MAX_RETRIES} attempts`);
    }
  }

  async downloadChunk(accountId: number, path: string): Promise<Buffer> {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error(`Dropbox account ${accountId} not found`);
    }

    // Ensure path starts with '/' for Dropbox API compatibility
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    try {
      const response = await client.filesDownload({ path: normalizedPath });
      
      if ('fileBinary' in response.result && response.result.fileBinary) {
        return Buffer.from(response.result.fileBinary as any);
      }
      
      throw new Error('No file data in response');
    } catch (error) {
      console.error('Dropbox download error:', error);
      throw new Error('Failed to download chunk from Dropbox');
    }
  }

  async getTemporaryLink(accountId: number, path: string): Promise<string> {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error(`Dropbox account ${accountId} not found`);
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    try {
      const response = await client.filesGetTemporaryLink({ path: normalizedPath });
      return response.result.link;
    } catch (error) {
      console.error('Dropbox getTemporaryLink error:', error);
      throw new Error('Failed to get temporary link from Dropbox');
    }
  }

  async deleteChunk(accountId: number, path: string): Promise<void> {
    const client = this.getClient(accountId);
    if (!client) {
      console.warn(`Dropbox account ${accountId} not found for deletion`);
      return;
    }

    // Normalize path: Dropbox expects paths starting with '/'
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    try {
      await client.filesDeleteV2({ path: normalizedPath });
    } catch (error) {
      // Handle common 'not found' error (409 path_lookup/not_found) as a no-op
      try {
        const errAny: any = error;
        const status = errAny?.status;
        const summary = errAny?.error?.error_summary || errAny?.error_summary || '';

        // If path not found, it's already deleted — log at debug level and continue
        if (status === 409 && /path_lookup\/not_found/i.test(summary)) {
          console.log(`Dropbox delete: path not found (already deleted): ${path}`);
          return;
        }

        // Retry for transient errors (rate limits / 5xx)
        if (status === 429 || (status >= 500 && status < 600)) {
          for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            const delay = Math.pow(2, attempt) * 250;
            await new Promise((resolve) => setTimeout(resolve, delay));
            try {
              await client.filesDeleteV2({ path: normalizedPath });
              return;
            } catch (retryErr) {
              if (attempt === this.MAX_RETRIES) {
                console.error(`Dropbox delete error after ${this.MAX_RETRIES} attempts:`, retryErr);
              }
            }
          }
          return;
        }

        // Otherwise log the error for investigation
        console.error('Dropbox delete error:', error);
      } catch (innerErr) {
        // If error shape is unexpected, just log both
        console.error('Dropbox delete error (unexpected shape):', error, innerErr);
      }
    }
  }

  updateAccountUsage(accountId: number, sizeChange: number) {
    const account = this.accounts.find(a => a.id === accountId);
    if (account) {
      account.currentSizeBytes = Math.max(0, account.currentSizeBytes + sizeChange);
    }
  }

  async uploadChunkStreaming(
    chunkData: Buffer,
    chunkIndex: number,
    checksum: string,
    originalName: string
  ): Promise<{ dropboxFileId: string; dropboxPath: string; downloadUrl: string; accountId: number }> {
    // Find best account for this chunk
    const accountId = this.getNextAccountRoundRobin();
    if (accountId === null) {
      throw new Error('No Dropbox accounts available');
    }

    const filePath = `/forums/streaming/${originalName}/chunk_${chunkIndex}`;
    
    // Upload the chunk
    const result = await this.uploadChunkWithRetry(accountId, chunkData, filePath);
    
    return {
      ...result,
      accountId
    };
  }

  getChunkSize(): number {
    return this.CHUNK_SIZE;
  }

  getAllAccounts(): ReadonlyArray<Readonly<DropboxAccount>> {
    return this.accounts;
  }

  getAccountStatusWithReservations(): Array<{
    id: number;
    currentSizeBytes: number;
    reservedBytes: number;
    maxSizeBytes: number;
    availableBytes: number;
    utilizationPercent: number;
    reservationCount: number;
  }> {
    this.cleanupExpiredReservations();

    return this.accounts.map(account => {
      const totalUsed = account.currentSizeBytes + account.reservedBytes;
      const available = Math.max(0, account.maxSizeBytes - totalUsed);
      const utilizationPercent = (totalUsed / account.maxSizeBytes) * 100;
      
      const reservationCount = Array.from(this.reservations.values())
        .filter(r => r.accountId === account.id).length;

      return {
        id: account.id,
        currentSizeBytes: account.currentSizeBytes,
        reservedBytes: account.reservedBytes,
        maxSizeBytes: account.maxSizeBytes,
        availableBytes: available,
        utilizationPercent,
        reservationCount,
      };
    });
  }

  getReservationInfo(reservationId: string): ChunkReservation | null {
    return this.reservations.get(reservationId) || null;
  }

  getAllActiveReservations(): Array<ChunkReservation> {
    this.cleanupExpiredReservations();
    return Array.from(this.reservations.values());
  }

  /**
   * Create a permanent download URL for a file in Dropbox using shared link method
   */
  async createPermanentDownloadUrl(accountId: number, filePath: string): Promise<string> {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error(`Dropbox account ${accountId} not found`);
    }

    try {
      // Create a shared link with settings for public access
      const response = await client.sharingCreateSharedLinkWithSettings({
        path: filePath,
        settings: {
          requested_visibility: { '.tag': 'public' },
          audience: { '.tag': 'public' },
          access: { '.tag': 'viewer' }
        }
      });

      if (response.result && response.result.url) {
        // Convert shared link (dl=0) to direct download link (dl=1)
        // Also replace www.dropbox.com with dl.dropboxusercontent.com for better direct access
        let downloadUrl = response.result.url.replace('dl=0', 'dl=1');
        downloadUrl = downloadUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        
        console.log(`📋 Generated permanent shared link for account ${accountId}: ${downloadUrl.substring(0, 80)}...`);
        return downloadUrl;
      }

      throw new Error('Could not generate shared link');
    } catch (error: any) {
      // If link already exists, try to list it
      if (error?.error?.error?.['.tag'] === 'shared_link_already_exists') {
        try {
          const listResponse = await client.sharingListSharedLinks({
            path: filePath,
            direct_only: true
          });

          if (listResponse.result.links.length > 0) {
            let downloadUrl = listResponse.result.links[0].url.replace('dl=0', 'dl=1');
            downloadUrl = downloadUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
            console.log(`📋 Retrieved existing shared link for account ${accountId}: ${downloadUrl.substring(0, 80)}...`);
            return downloadUrl;
          }
        } catch (listError) {
          console.error(`Failed to list existing shared links for account ${accountId}:`, listError);
        }
      }

      console.error(`Failed to create permanent download URL for account ${accountId}:`, error);
      
      // Fallback: try to create a temporary link (better than nothing, but expires in 4 hours)
      try {
        const tempLinkResponse = await client.filesGetTemporaryLink({ path: filePath });
        if (tempLinkResponse.result && tempLinkResponse.result.link) {
          const tempLink = tempLinkResponse.result.link;
          console.log(`📋 Using temporary link (fallback) for account ${accountId}: ${filePath}`);
          return tempLink;
        }
      } catch (tempError) {
        console.error(`Failed to create temporary link fallback for account ${accountId}:`, tempError);
      }

      // Last resort fallback
      const encodedPath = encodeURIComponent(filePath);
      const fallbackUrl = `https://www.dropbox.com/s/fallback${Date.now()}${accountId}/${encodedPath}?dl=1`;
      console.log(`📋 Using constructed fallback URL for account ${accountId}: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export const dropboxManager = new DropboxManager();
