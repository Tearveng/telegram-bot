"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = void 0;
// src/services/QueueManager.ts
const events_1 = require("events");
class QueueManager extends events_1.EventEmitter {
    queue = [];
    processing = 0;
    maxConcurrent;
    isPaused = false;
    constructor(maxConcurrent = 2) {
        super();
        this.maxConcurrent = maxConcurrent;
    }
    async add(task, priority = 0) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        return new Promise((resolve, reject) => {
            const queueItem = {
                id,
                priority,
                task: async () => {
                    try {
                        const result = await task();
                        resolve(result);
                    }
                    catch (error) {
                        reject(error);
                    }
                },
                timestamp: Date.now(),
            };
            // Insert based on priority (higher priority first)
            const index = this.queue.findIndex(item => item.priority < priority);
            if (index === -1) {
                this.queue.push(queueItem);
            }
            else {
                this.queue.splice(index, 0, queueItem);
            }
            this.emit('queued', { id, queueSize: this.queue.length });
            this.processNext();
        });
    }
    async processNext() {
        if (this.isPaused || this.processing >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        const item = this.queue.shift();
        this.processing++;
        this.emit('processing', {
            id: item.id,
            queueSize: this.queue.length,
            processing: this.processing
        });
        try {
            await item.task();
        }
        catch (error) {
            console.error(`Queue item ${item.id} failed:`, error);
        }
        finally {
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
    pause() {
        this.isPaused = true;
        this.emit('paused');
    }
    resume() {
        this.isPaused = false;
        this.emit('resumed');
        this.processNext();
    }
    clear() {
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
exports.QueueManager = QueueManager;
//# sourceMappingURL=QueueManager.js.map