// src/services/QueueManager.ts
import { EventEmitter } from 'events';

interface QueueItem {
  id: string;
  priority: number;
  task: () => Promise<any>;
  timestamp: number;
}

export class QueueManager extends EventEmitter {
  private queue: QueueItem[] = [];
  private processing: number = 0;
  private maxConcurrent: number;
  private isPaused: boolean = false;

  constructor(maxConcurrent: number = 2) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  async add(task: () => Promise<any>, priority: number = 0): Promise<any> {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    return new Promise((resolve, reject) => {
      const queueItem: QueueItem = {
        id,
        priority,
        task: async () => {
          try {
            const result = await task();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        timestamp: Date.now(),
      };

      // Insert based on priority (higher priority first)
      const index = this.queue.findIndex(item => item.priority < priority);
      if (index === -1) {
        this.queue.push(queueItem);
      } else {
        this.queue.splice(index, 0, queueItem);
      }

      this.emit('queued', { id, queueSize: this.queue.length });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isPaused || this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    this.processing++;

    this.emit('processing', { 
      id: item.id, 
      queueSize: this.queue.length,
      processing: this.processing 
    });

    try {
      await item.task();
    } catch (error) {
      console.error(`Queue item ${item.id} failed:`, error);
    } finally {
      this.processing--;
      this.emit('completed', { 
        id: item.id,
        queueSize: this.queue.length,
        processing: this.processing 
      });
      
      // Process next item
      this.processNext();
    }
  }

  pause(): void {
    this.isPaused = true;
    this.emit('paused');
  }

  resume(): void {
    this.isPaused = false;
    this.emit('resumed');
    this.processNext();
  }

  clear(): void {
    this.queue = [];
    this.emit('cleared');
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      isPaused: this.isPaused,
    };
  }
}