const workerService = require('../services/workerService');
const config = require('../config');

const POLL_INTERVAL_MS = 5000;

// Surface startup so it's obvious from PM2 logs that the worker is alive.
// Puppeteer always runs headed (headless: false) — required by the
// RektCaptcha extension.
console.log(
  `[worker-${process.pid}] starting | NODE_ENV=${config.NODE_ENV} | ` +
  `headless=false | worker_concurrency=${config.WORKER_CONCURRENCY} | jobs_per_worker=1`
);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let shuttingDown = false;
let inFlightPromise = Promise.resolve();

process.on('SIGTERM', () => {
  shuttingDown = true;
  inFlightPromise.then(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 30000);
});

async function run() {
  while (!shuttingDown) {
    const batchPromise = workerService.processBatch().catch(err => {
      console.error(`[worker-${process.pid}] batch error: ${err.message}`);
    });
    inFlightPromise = batchPromise;
    await batchPromise;
    if (!shuttingDown) await sleep(POLL_INTERVAL_MS);
  }
}

run();
