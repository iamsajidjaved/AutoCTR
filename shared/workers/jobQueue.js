// Real concurrency enforcement lives in shared/services/workerService.js
// (BATCH_SIZE=1 + per-poll `await`). This semaphore is retained for parity and
// potential future use; its limit is kept in sync with the worker invariant.
const MAX_CONCURRENT_JOBS = 1;

class JobQueue {
  constructor() {
    this.running = 0;
  }

  available() {
    return this.running < MAX_CONCURRENT_JOBS;
  }

  async run(fn) {
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
    }
  }
}

module.exports = { JobQueue, MAX_CONCURRENT_JOBS };
