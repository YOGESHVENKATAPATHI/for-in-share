import { useCallback } from 'react';

/**
 * Hook for requesting immediate processing of specific video chunks
 * Bypasses normal queue limitations when users need specific segments
 */
export function usePriorityChunkProcessor() {
  const requestPriorityChunk = useCallback(async (
    fileId: string, 
    chunkIndex: number,
    options: {
      forceProcess?: boolean;
      timeout?: number;
    } = {}
  ) => {
    const { forceProcess = true, timeout = 15000 } = options;
    
    console.log(`[PriorityChunk] Requesting priority processing for chunk ${chunkIndex} of file ${fileId}`);
    
    try {
      const response = await fetch(`/api/files/${fileId}/priority-chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chunkIndex,
          forceProcess,
          timeout
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log(`[PriorityChunk] Successfully requested priority processing:`, result);
      
      return {
        success: true,
        chunkIndex,
        streamUrl: result.streamUrl,
        result: result.result,
        message: result.message
      };
      
    } catch (error: any) {
      console.error(`[PriorityChunk] Failed to request priority processing for chunk ${chunkIndex}:`, error);
      
      return {
        success: false,
        chunkIndex,
        error: error.message,
        streamUrl: null
      };
    }
  }, []);
  
  const getPriorityStatus = useCallback(async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/priority-status`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return {
        success: true,
        status: result
      };
      
    } catch (error: any) {
      console.error(`[PriorityChunk] Failed to get priority status:`, error);
      
      return {
        success: false,
        error: error.message,
        status: null
      };
    }
  }, []);
  
  const cancelAllPriority = useCallback(async () => {
    try {
      console.log('[PriorityChunk] Cancelling all priority processing');
      
      const response = await fetch('/api/priority-processing/cancel-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('[PriorityChunk] Successfully cancelled all priority processing:', result);
      
      return {
        success: true,
        message: result.message
      };
      
    } catch (error: any) {
      console.error('[PriorityChunk] Failed to cancel priority processing:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }, []);
  
  return {
    requestPriorityChunk,
    getPriorityStatus,
    cancelAllPriority
  };
}

/**
 * Utility function to calculate which chunk contains a specific time position
 */
export function calculateChunkIndex(
  seekTime: number, 
  duration: number, 
  totalChunks: number
): number {
  if (duration <= 0 || totalChunks <= 0) return 0;
  
  const seekRatio = Math.max(0, Math.min(1, seekTime / duration));
  const chunkIndex = Math.floor(seekRatio * totalChunks);
  
  return Math.max(0, Math.min(totalChunks - 1, chunkIndex));
}

/**
 * Utility function to calculate multiple chunks around a seek position for buffering
 */
export function calculateBufferChunks(
  seekTime: number, 
  duration: number, 
  totalChunks: number,
  bufferAhead: number = 2,
  bufferBehind: number = 1
): number[] {
  const targetChunk = calculateChunkIndex(seekTime, duration, totalChunks);
  
  const startChunk = Math.max(0, targetChunk - bufferBehind);
  const endChunk = Math.min(totalChunks - 1, targetChunk + bufferAhead);
  
  const chunks = [];
  for (let i = startChunk; i <= endChunk; i++) {
    chunks.push(i);
  }
  
  return chunks;
}