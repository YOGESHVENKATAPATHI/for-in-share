/**
 * Utility functions for client-side storage cleanup
 */

export const storageCleanup = {
  /**
   * Clear all application-specific data from localStorage
   */
  clearLocalStorage() {
    try {
      // Get all keys
      const keys = Object.keys(localStorage);
      
      // Clear application-specific keys
      const appKeys = keys.filter(key => 
        key.startsWith('forum-') ||
        key.startsWith('file-') ||
        key.startsWith('user-') ||
        key.startsWith('session-') ||
        key.startsWith('upload-') ||
        key.startsWith('cache-') ||
        key.includes('tanstack') || // React Query cache
        key.includes('query')
      );

      appKeys.forEach(key => {
        localStorage.removeItem(key);
        console.log(`[StorageCleanup] Removed localStorage key: ${key}`);
      });

      console.log(`[StorageCleanup] Cleared ${appKeys.length} localStorage keys`);
    } catch (error) {
      console.error('[StorageCleanup] Error clearing localStorage:', error);
    }
  },

  /**
   * Clear all application-specific data from sessionStorage
   */
  clearSessionStorage() {
    try {
      // Get all keys
      const keys = Object.keys(sessionStorage);
      
      // Clear application-specific keys
      const appKeys = keys.filter(key => 
        key.startsWith('forum-') ||
        key.startsWith('file-') ||
        key.startsWith('user-') ||
        key.startsWith('session-') ||
        key.startsWith('upload-') ||
        key.startsWith('temp-')
      );

      appKeys.forEach(key => {
        sessionStorage.removeItem(key);
        console.log(`[StorageCleanup] Removed sessionStorage key: ${key}`);
      });

      console.log(`[StorageCleanup] Cleared ${appKeys.length} sessionStorage keys`);
    } catch (error) {
      console.error('[StorageCleanup] Error clearing sessionStorage:', error);
    }
  },

  /**
   * Clear IndexedDB databases used by the application
   */
  async clearIndexedDB() {
    try {
      if ('indexedDB' in window) {
        // Common database names used by the application
        const dbNames = [
          'tanstack-query', // React Query offline cache
          'file-cache',
          'upload-cache',
          'video-cache',
          'app-cache'
        ];

        for (const dbName of dbNames) {
          try {
            const deleteRequest = indexedDB.deleteDatabase(dbName);
            await new Promise<void>((resolve, reject) => {
              deleteRequest.onsuccess = () => {
                console.log(`[StorageCleanup] Deleted IndexedDB: ${dbName}`);
                resolve();
              };
              deleteRequest.onerror = () => {
                console.warn(`[StorageCleanup] Failed to delete IndexedDB: ${dbName}`);
                resolve(); // Continue even if deletion fails
              };
              deleteRequest.onblocked = () => {
                console.warn(`[StorageCleanup] IndexedDB deletion blocked: ${dbName}`);
                resolve(); // Continue even if blocked
              };
            });
          } catch (error) {
            console.warn(`[StorageCleanup] Error deleting IndexedDB ${dbName}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[StorageCleanup] Error clearing IndexedDB:', error);
    }
  },

  /**
   * Clear application cache (Service Worker cache)
   */
  async clearApplicationCache() {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        const appCaches = cacheNames.filter(name => 
          name.includes('for-in-share') ||
          name.includes('app-cache') ||
          name.includes('api-cache') ||
          name.includes('file-cache')
        );

        for (const cacheName of appCaches) {
          await caches.delete(cacheName);
          console.log(`[StorageCleanup] Deleted cache: ${cacheName}`);
        }

        console.log(`[StorageCleanup] Cleared ${appCaches.length} application caches`);
      }
    } catch (error) {
      console.error('[StorageCleanup] Error clearing application cache:', error);
    }
  },

  /**
   * Revoke all object URLs to free memory
   */
  clearObjectURLs() {
    try {
      // Clear any blob URLs that might be stored
      const keys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
      const blobKeys = keys.filter(key => {
        try {
          const value = localStorage.getItem(key) || sessionStorage.getItem(key);
          return value && value.startsWith('blob:');
        } catch {
          return false;
        }
      });

      blobKeys.forEach(key => {
        try {
          const url = localStorage.getItem(key) || sessionStorage.getItem(key);
          if (url) {
            URL.revokeObjectURL(url);
            console.log(`[StorageCleanup] Revoked object URL: ${key}`);
          }
        } catch (error) {
          console.warn(`[StorageCleanup] Error revoking URL for ${key}:`, error);
        }
      });

      console.log(`[StorageCleanup] Revoked ${blobKeys.length} object URLs`);
    } catch (error) {
      console.error('[StorageCleanup] Error clearing object URLs:', error);
    }
  },

  /**
   * Clear all temporary files and uploads
   */
  async clearTemporaryFiles() {
    try {
      // Clear any file references stored in local/session storage
      const allKeys = [
        ...Object.keys(localStorage),
        ...Object.keys(sessionStorage)
      ];

      const fileKeys = allKeys.filter(key =>
        key.includes('temp-file-') ||
        key.includes('upload-progress-') ||
        key.includes('file-chunk-') ||
        key.includes('partial-upload-')
      );

      fileKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
          console.log(`[StorageCleanup] Removed temporary file key: ${key}`);
        } catch (error) {
          console.warn(`[StorageCleanup] Error removing ${key}:`, error);
        }
      });

      console.log(`[StorageCleanup] Cleared ${fileKeys.length} temporary file references`);
    } catch (error) {
      console.error('[StorageCleanup] Error clearing temporary files:', error);
    }
  },

  /**
   * Perform complete cleanup of all client-side storage
   */
  async performFullCleanup() {
    console.log('[StorageCleanup] Starting full cleanup...');
    
    // Clear all storage types
    this.clearLocalStorage();
    this.clearSessionStorage();
    this.clearObjectURLs();
    await this.clearTemporaryFiles();
    await this.clearIndexedDB();
    await this.clearApplicationCache();

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
      console.log('[StorageCleanup] Triggered garbage collection');
    }

    console.log('[StorageCleanup] Full cleanup completed');
  }
};

// Type declaration for garbage collection
declare global {
  interface Window {
    gc?: () => void;
  }
}