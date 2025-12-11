import { useEffect } from 'react';

/**
 * Hook to reset all client-side storage and cached data for a fresh user experience
 */
export function useStorageReset(userId?: string) {
  
  const resetAllClientStorage = () => {
    console.log('[StorageReset] 🧹 Clearing all client-side storage and cache');
    
    try {
      // 1. Clear localStorage
      const localStorageKeys = Object.keys(localStorage);
      localStorageKeys.forEach(key => {
        if (
          key.startsWith('video-') ||
          key.startsWith('player-') ||
          key.startsWith('seek-') ||
          key.startsWith('progress-') ||
          key.startsWith('duration-') ||
          key.startsWith('chunk-') ||
          key.startsWith('buffer-') ||
          key.startsWith('hls-') ||
          key.startsWith('transcoding-') ||
          key.includes('position') ||
          key.includes('time') ||
          key.includes('cache')
        ) {
          localStorage.removeItem(key);
        }
      });
      console.log(`[StorageReset] Cleared ${localStorageKeys.length} localStorage video-related items`);

      // 2. Clear sessionStorage
      const sessionStorageKeys = Object.keys(sessionStorage);
      sessionStorageKeys.forEach(key => {
        if (
          key.startsWith('video-') ||
          key.startsWith('player-') ||
          key.startsWith('seek-') ||
          key.startsWith('progress-') ||
          key.startsWith('duration-') ||
          key.startsWith('chunk-') ||
          key.startsWith('buffer-') ||
          key.startsWith('hls-') ||
          key.startsWith('transcoding-') ||
          key.includes('position') ||
          key.includes('time') ||
          key.includes('cache')
        ) {
          sessionStorage.removeItem(key);
        }
      });
      console.log(`[StorageReset] Cleared ${sessionStorageKeys.length} sessionStorage video-related items`);

      // 3. Clear IndexedDB databases if any
      if ('indexedDB' in window) {
        // Common video player database names
        const commonDBNames = [
          'video-cache',
          'player-cache', 
          'hls-cache',
          'chunk-cache',
          'seek-cache',
          'progress-cache'
        ];
        
        commonDBNames.forEach(dbName => {
          try {
            const deleteReq = indexedDB.deleteDatabase(dbName);
            deleteReq.onsuccess = () => {
              console.log(`[StorageReset] Deleted IndexedDB: ${dbName}`);
            };
            deleteReq.onerror = () => {
              // Silently ignore - database might not exist
            };
          } catch (error) {
            // Silently ignore errors
          }
        });
      }

      // 4. Clear cache storage if supported
      if ('caches' in window) {
        caches.keys().then(cacheNames => {
          const videoCaches = cacheNames.filter(name => 
            name.includes('video') || 
            name.includes('hls') || 
            name.includes('chunk') ||
            name.includes('stream')
          );
          
          videoCaches.forEach(cacheName => {
            caches.delete(cacheName).then(() => {
              console.log(`[StorageReset] Cleared cache: ${cacheName}`);
            });
          });
        });
      }

      // 5. Force garbage collection if available
      if (window.gc) {
        window.gc();
        console.log('[StorageReset] Triggered garbage collection');
      }

      // 6. Clear any React Query cache (if using React Query)
      // This would be handled by the query client reset

      console.log('[StorageReset] ✅ Client storage reset completed');
      
    } catch (error) {
      console.error('[StorageReset] ❌ Error during client storage reset:', error);
    }
  };

  const resetOnLogin = (userId: string) => {
    console.log(`[StorageReset] 🔄 User logged in: ${userId} - triggering storage reset`);
    
    // Small delay to ensure login is complete
    setTimeout(() => {
      resetAllClientStorage();
      
      // Send reset signal to server for server-side cleanup
      fetch('/api/user/reset-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      }).catch(error => {
        console.warn('[StorageReset] Server-side cache reset failed:', error);
      });
      
    }, 100);
  };

  // Reset when user changes (login/logout)
  useEffect(() => {
    if (userId) {
      resetOnLogin(userId);
    }
  }, [userId]);

  return {
    resetAllClientStorage,
    resetOnLogin
  };
}

// Global function for manual reset
export const resetAllClientStorage = () => {
  console.log('[StorageReset] 🧹 Manual client storage reset triggered');
  
  try {
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear IndexedDB
    if ('indexedDB' in window) {
      indexedDB.databases?.().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      });
    }
    
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      });
    }
    
    console.log('[StorageReset] ✅ Manual storage reset completed');
    
    // Reload the page for a completely fresh start
    window.location.reload();
    
  } catch (error) {
    console.error('[StorageReset] ❌ Error during manual storage reset:', error);
  }
};

declare global {
  interface Window {
    gc?: () => void;
  }
}