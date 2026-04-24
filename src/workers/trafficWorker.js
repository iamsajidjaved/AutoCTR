const workerService = require('../services/workerService');

const POLL_INTERVAL_MS = 5000;

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
