import { EventEmitter } from 'events';

/**
 * Priority chunk processor that handles immediate chunk requests
 * bypassing normal queuing systems
 */
export class PriorityChunkProcessor extends EventEmitter {
  private activeProcessing = new Map<string, Promise<any>>();
  private abortControllers = new Map<string, AbortController>();

  /**
   * Process a specific chunk immediately, cancelling other lower-priority tasks if needed
   */
  public async processChunkImmediate<T>(
    chunkId: string,
    chunkIndex: number,
    processor: (signal: AbortSignal) => Promise<T>,
    options: {
      priority?: 'high' | 'normal';
      cancelOthers?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const { priority = 'high', cancelOthers = true, timeout = 30000 } = options;
    
    console.log(`[PriorityProcessor] Processing chunk ${chunkIndex} (${chunkId}) with ${priority} priority`);
    
    // If this is high priority, cancel other normal priority tasks
    if (priority === 'high' && cancelOthers) {
      this.cancelLowerPriorityTasks();
    }
    
    // Create abort controller for this task
    const abortController = new AbortController();
    this.abortControllers.set(chunkId, abortController);
    
    // Create timeout if specified
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        console.log(`[PriorityProcessor] Timeout reached for chunk ${chunkIndex}, aborting`);
        abortController.abort();
      }, timeout);
    }
    
    try {
      // Execute the processor with abort signal
      const processingPromise = processor(abortController.signal);
      this.activeProcessing.set(chunkId, processingPromise);
      
      const result = await processingPromise;
      
      console.log(`[PriorityProcessor] Successfully processed chunk ${chunkIndex} (${chunkId})`);
      this.emit('chunkProcessed', { chunkId, chunkIndex, success: true });
      
      return result;
      
    } catch (error: any) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log(`[PriorityProcessor] Chunk ${chunkIndex} processing was cancelled`);
        this.emit('chunkCancelled', { chunkId, chunkIndex });
      } else {
        console.error(`[PriorityProcessor] Error processing chunk ${chunkIndex}:`, error);
        this.emit('chunkError', { chunkId, chunkIndex, error });
      }
      throw error;
    } finally {
      // Cleanup
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.activeProcessing.delete(chunkId);
      this.abortControllers.delete(chunkId);
    }
  }
  
  /**
   * Cancel all lower priority tasks to make room for high-priority requests
   */
  private cancelLowerPriorityTasks(): void {
    const cancelled = [];
    
    Array.from(this.abortControllers.entries()).forEach(([chunkId, abortController]) => {
      if (!abortController.signal.aborted) {
        console.log(`[PriorityProcessor] Cancelling lower priority task: ${chunkId}`);
        abortController.abort();
        cancelled.push(chunkId);
      }
    });
    
    if (cancelled.length > 0) {
      console.log(`[PriorityProcessor] Cancelled ${cancelled.length} lower priority tasks: ${cancelled.join(', ')}`);
    }
  }
  
  /**
   * Cancel a specific chunk processing
   */
  public cancelChunk(chunkId: string): boolean {
    const abortController = this.abortControllers.get(chunkId);
    if (abortController && !abortController.signal.aborted) {
      console.log(`[PriorityProcessor] Manually cancelling chunk: ${chunkId}`);
      abortController.abort();
      return true;
    }
    return false;
  }
  
  /**
   * Cancel all active processing
   */
  public cancelAll(): void {
    console.log(`[PriorityProcessor] Cancelling all active processing (${this.abortControllers.size} tasks)`);
    
    Array.from(this.abortControllers.entries()).forEach(([chunkId, abortController]) => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    });
    
    this.abortControllers.clear();
    this.activeProcessing.clear();
  }
  
  /**
   * Get status of active processing
   */
  public getStatus(): {
    activeCount: number;
    activeChunks: string[];
  } {
    return {
      activeCount: this.activeProcessing.size,
      activeChunks: Array.from(this.activeProcessing.keys())
    };
  }
}

// Global priority processor instance
export const globalPriorityProcessor = new PriorityChunkProcessor();