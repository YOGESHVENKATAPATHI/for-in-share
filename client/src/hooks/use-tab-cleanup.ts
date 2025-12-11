import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { storageCleanup } from "@/lib/storage-cleanup";

interface UseTabCleanupOptions {
  enabled?: boolean;
  onCleanup?: () => void;
}

/**
 * Hook to handle cleanup when the browser tab is closed or refreshed
 * Uses multiple detection methods for better reliability
 */
export function useTabCleanup(options: UseTabCleanupOptions = {}) {
  const { enabled = true, onCleanup } = options;
  const cleanupTriggeredRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Generate a unique session ID for this tab
    const generateSessionId = () => {
      return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    // Initialize session on first load
    const initializeSession = async () => {
      try {
        sessionIdRef.current = generateSessionId();
        console.log(`[TabCleanup] Initializing session: ${sessionIdRef.current}`);
        
        await apiRequest('/api/session/initialize', {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
          headers: { 'Content-Type': 'application/json' }
        });

        // Start heartbeat to keep session alive
        startHeartbeat();
      } catch (error) {
        console.error('[TabCleanup] Failed to initialize session:', error);
      }
    };

    // Send heartbeat to server to indicate tab is still active
    const sendHeartbeat = async () => {
      if (!sessionIdRef.current) return;
      
      try {
        await apiRequest('/api/session/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.warn('[TabCleanup] Heartbeat failed:', error);
      }
    };

    // Start periodic heartbeat
    const startHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Send heartbeat every 30 seconds
      heartbeatIntervalRef.current = setInterval(() => {
        sendHeartbeat();
      }, 30000);
    };

    // Cleanup function to notify server
    const performCleanup = async (reason: string) => {
      if (cleanupTriggeredRef.current || !sessionIdRef.current) return;
      
      cleanupTriggeredRef.current = true;
      console.log(`[TabCleanup] Performing cleanup - ${reason}`);

      try {
        // Stop heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Notify server about tab closure
        await fetch('/api/session/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sessionId: sessionIdRef.current,
            reason 
          }),
          keepalive: true // Ensure request completes even if page is unloading
        });

        // Perform client-side storage cleanup
        if (reason === 'beforeunload' || reason === 'pagehide') {
          // Only do full cleanup on actual page unload
          await storageCleanup.performFullCleanup();
        } else {
          // Light cleanup for other events
          storageCleanup.clearTemporaryFiles();
          storageCleanup.clearObjectURLs();
        }

        onCleanup?.();
      } catch (error) {
        console.error('[TabCleanup] Cleanup request failed:', error);
      }
    };

    // Handle page unload (tab close, refresh, navigation)
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      performCleanup('beforeunload');
      
      // Don't show confirmation dialog, just cleanup
      return undefined;
    };

    // Handle visibility change (tab becomes hidden)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab is hidden, but not necessarily closed
        // Stop heartbeat temporarily to reduce server load
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      } else if (document.visibilityState === 'visible') {
        // Tab is visible again, resume heartbeat
        if (sessionIdRef.current && !cleanupTriggeredRef.current) {
          startHeartbeat();
          sendHeartbeat(); // Send immediate heartbeat
        }
      }
    };

    // Handle page hide (more reliable than beforeunload on mobile)
    const handlePageHide = () => {
      performCleanup('pagehide');
    };

    // Handle focus loss (fallback detection)
    const handleWindowBlur = () => {
      // Don't cleanup on blur, just note that tab lost focus
      // This helps differentiate between tab switch and tab close
    };

    // Initialize session and set up event listeners
    initializeSession();

    // Set up event listeners for different cleanup triggers
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function for React useEffect
    return () => {
      console.log('[TabCleanup] React cleanup triggered');
      
      // Remove event listeners
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Perform final cleanup
      performCleanup('component_unmount');
    };
  }, [enabled, onCleanup]);

  return {
    sessionId: sessionIdRef.current,
    cleanup: () => performCleanup('manual'),
  };
}