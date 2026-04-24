const MAX_CONCURRENT_JOBS = 3;

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
